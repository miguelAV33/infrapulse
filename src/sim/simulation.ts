import { formatDuration } from '../lib/format';
import { createRng, type Rng } from '../lib/prng';
import { alertDurationSec, evaluateAlerts, RULE_LABELS, type AlertChange } from './alerts';
import { createFleet, isWindows, ROLE_PROFILES } from './fleet';
import { cleanupEvent, routineEvent, type NewLogEntry } from './routine';
import type { Incident, IncidentKind, Metrics, Partition, Server, Service, SimState, Thresholds } from './types';

/**
 * Núcleo de la simulación. `simulationReducer` es una función pura:
 * (estado, acción) → estado nuevo. La aleatoriedad sale de un PRNG cuyo
 * estado viaja dentro de SimState, y la hora llega en la propia acción,
 * así que con la misma semilla y las mismas acciones el resultado es idéntico.
 */

export const HISTORY_LENGTH = 60;
export const LOG_LIMIT = 400;
export const RESOLVED_LIMIT = 60;
export const MAX_CONCURRENT_INCIDENTS = 3;
export const INCIDENT_CHANCE = 0.05;
export const ROUTINE_EVENT_CHANCE = 0.6;
export const REBOOT_TICKS = 3;

export type SimAction =
  | { type: 'tick'; now: number; thresholds: Thresholds }
  | { type: 'setPaused'; paused: boolean }
  | { type: 'restartService'; server: string; service: string; now: number }
  | { type: 'rebootServer'; server: string; now: number }
  | { type: 'acknowledgeAlert'; id: string; now: number }
  | { type: 'reset'; seed: number; now: number; thresholds: Thresholds; intervalMs: number };

export function simulationReducer(state: SimState, action: SimAction): SimState {
  switch (action.type) {
    case 'tick':
      return state.paused ? state : step(state, action.now, action.thresholds);
    case 'setPaused':
      return state.paused === action.paused ? state : { ...state, paused: action.paused };
    case 'restartService':
      return restartService(state, action.server, action.service, action.now);
    case 'rebootServer':
      return rebootServer(state, action.server, action.now);
    case 'acknowledgeAlert':
      return acknowledgeAlert(state, action.id, action.now);
    case 'reset':
      return createInitialState(action);
  }
}

/**
 * Estado inicial. Se simulan HISTORY_LENGTH ticks "hacia atrás" para que
 * las gráficas tengan datos desde el primer render (sin pantalla vacía).
 */
export function createInitialState(options: {
  seed: number;
  now: number;
  thresholds: Thresholds;
  intervalMs: number;
}): SimState {
  const { seed, now, thresholds, intervalMs } = options;
  const rng = createRng(seed);
  const startedAt = now - HISTORY_LENGTH * intervalMs;

  const servers = createFleet(rng);
  let state: SimState = {
    seed,
    rngState: rng.state,
    tick: 0,
    now: startedAt,
    paused: false,
    servers,
    activeAlerts: [],
    resolvedAlerts: [],
    streaks: {},
    log: [],
    nextLogId: 1,
  };
  state = appendLog(state, startedAt, [
    { level: 'info', server: null, source: 'infrapulse', message: `Simulación iniciada con la semilla ${seed}` },
  ]);

  for (let i = HISTORY_LENGTH - 1; i >= 0; i--) {
    state = step(state, now - i * intervalMs, thresholds);
  }
  return state;
}

/** Un tick: avanza métricas, incidentes y discos, y evalúa las reglas de alerta. */
export function step(state: SimState, now: number, thresholds: Thresholds): SimState {
  const rng = createRng(state.rngState);
  const elapsedSec = Math.max(0, (now - state.now) / 1000);
  const logs: NewLogEntry[] = [];

  let servers = state.servers.map((server) => advanceServer(server, rng, elapsedSec, logs));
  servers = maybeStartIncident(servers, rng, logs);
  servers = servers.map((server) => recordSample(server, now));

  if (rng.chance(ROUTINE_EVENT_CHANCE)) {
    const online = servers.filter((server) => server.reachability === 'up');
    if (online.length > 0) logs.push(routineEvent(rng.pick(online), rng));
  }

  const evaluation = evaluateAlerts({
    servers,
    thresholds,
    streaks: state.streaks,
    active: state.activeAlerts,
    now,
  });
  for (const change of evaluation.changes) logs.push(alertChangeEvent(change, now));

  return appendLog(
    {
      ...state,
      rngState: rng.state,
      tick: state.tick + 1,
      now,
      servers,
      activeAlerts: evaluation.active,
      resolvedAlerts: [...evaluation.resolved, ...state.resolvedAlerts].slice(0, RESOLVED_LIMIT),
      streaks: evaluation.streaks,
    },
    now,
    logs,
  );
}

// ---------------------------------------------------------------------------
// Evolución de cada servidor
// ---------------------------------------------------------------------------

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Paseo aleatorio acotado con "vuelta a la media": cada tick el valor se
 * acerca un poco a su referencia y se le suma ruido. Así se mueve de forma
 * creíble sin dispararse ni quedarse plano.
 */
function walk(current: number, target: number, pull: number, jitter: number, rng: Rng, min: number, max: number) {
  return clamp(current + (target - current) * pull + rng.noise() * jitter, min, max);
}

function serviceManager(server: Server): string {
  return isWindows(server) ? 'Service Control Manager' : 'systemd';
}

function advanceServer(server: Server, rng: Rng, elapsedSec: number, logs: NewLogEntry[]): Server {
  let s: Server = { ...server, uptimeSec: server.uptimeSec + elapsedSec };

  // 1. Reinicio pedido por el operador: unos ticks sin responder y vuelve limpio.
  if (s.reachability === 'rebooting') {
    if (s.rebootTicks > 1) return { ...s, rebootTicks: s.rebootTicks - 1 };
    logs.push({ level: 'info', server: s.name, source: 'kernel', message: 'Arranque completado; todos los servicios en ejecución' });
    const profile = ROLE_PROFILES[s.role];
    return {
      ...s,
      reachability: 'up',
      rebootTicks: 0,
      uptimeSec: 0,
      jobTicks: 0,
      services: s.services.map((svc) => ({ ...svc, status: 'running' })),
      metrics: { ...s.metrics, cpu: profile.cpu, ram: profile.ram * 0.8, load: [0.2, 0.1, 0.05] },
    };
  }

  // 2. Cuenta atrás del incidente en curso: algunos se resuelven solos.
  if (s.incident) {
    s = s.incident.ticksLeft > 1
      ? { ...s, incident: { ...s.incident, ticksLeft: s.incident.ticksLeft - 1 } }
      : endIncident(s, s.incident, rng, logs);
  }

  // Sin respuesta: no hay métricas nuevas (se conservan las últimas conocidas).
  if (s.reachability === 'down') return s;

  // 3. Servicios que se estaban reiniciando vuelven a estar activos.
  const services: Service[] = s.services.map((svc) => {
    if (svc.status !== 'restarting') return svc;
    logs.push({ level: 'info', server: s.name, source: serviceManager(s), message: `${svc.name} activo de nuevo tras el reinicio` });
    return { ...svc, status: 'running' };
  });

  // 4. Trabajos periódicos intensivos (builds de CI, copias de seguridad).
  const profile = ROLE_PROFILES[s.role];
  let jobTicks = Math.max(0, s.jobTicks - 1);
  if (jobTicks === 0 && profile.job && rng.chance(profile.job.chancePerTick)) {
    jobTicks = rng.int(profile.job.minTicks, profile.job.maxTicks);
    if (s.role === 'backup') {
      logs.push({ level: 'info', server: s.name, source: 'Veeam', message: 'Iniciado el trabajo de copia incremental «Diario-BD»' });
    }
  }
  const job = jobTicks > 0 && profile.job ? profile.job : null;

  // 5. Métricas.
  const spike = s.incident?.kind === 'cpu_spike';
  const degraded = services.some((svc) => svc.status !== 'running');
  const prev = s.metrics;
  const cpuTarget = spike ? 97 : profile.cpu + (job?.cpuBoost ?? 0);
  const cpu = walk(prev.cpu, cpuTarget, spike ? 0.6 : 0.3, spike ? 1 : profile.cpuJitter, rng, 0.5, 100);
  const ram = walk(prev.ram, profile.ram + (job ? 6 : 0), 0.08, profile.ramJitter, rng, 1, 99.5);
  // Con un servicio caído el tráfico se desploma (los clientes reciben errores).
  const netFactor = degraded ? 0.3 : 1;
  const inTarget = (profile.netIn + (job?.netInBoost ?? 0)) * netFactor;
  const outTarget = profile.netOut * netFactor;
  const netIn = walk(prev.netIn, inTarget, 0.3, inTarget * 0.08 + 0.3, rng, 0, 10_000);
  const netOut = walk(prev.netOut, outTarget, 0.3, outTarget * 0.08 + 0.3, rng, 0, 10_000);
  // Carga media: misma idea que el kernel, medias exponenciales con distinta inercia.
  const instantLoad = (cpu / 100) * s.cores * (1 + rng.range(0, 0.15));
  const [l1, l5, l15] = prev.load;
  const load: Metrics['load'] = [
    l1 + (instantLoad - l1) * 0.45,
    l5 + (instantLoad - l5) * 0.12,
    l15 + (instantLoad - l15) * 0.04,
  ];

  // 6. Discos: crecen poco a poco y, al llenarse, salta la limpieza automática.
  const partitions: Partition[] = s.partitions.map((partition) => {
    const burst = s.incident?.kind === 'disk_burst' && s.incident.target === partition.mount;
    let usedPct = burst
      ? partition.usedPct + (99 - partition.usedPct) * 0.3
      : partition.usedPct + partition.growthPerTick * (job && s.role === 'backup' ? 4 : 1) * rng.range(0.5, 1.5);
    usedPct = clamp(usedPct, 0, 100);
    if (!burst && usedPct >= partition.cleanupAt) {
      const target = clamp(partition.cleanupTo + rng.range(-2, 2), 5, 95);
      logs.push(cleanupEvent(s, partition, ((usedPct - target) / 100) * partition.sizeGb));
      usedPct = target;
    }
    return { ...partition, usedPct };
  });

  return { ...s, services, jobTicks, metrics: { cpu, ram, netIn, netOut, load }, partitions };
}

function endIncident(server: Server, incident: Incident, rng: Rng, logs: NewLogEntry[]): Server {
  const s: Server = { ...server, incident: null };
  switch (incident.kind) {
    case 'cpu_spike':
      logs.push({ level: 'info', server: s.name, source: incident.target ?? 'kernel', message: 'El proceso ha terminado su tarea; la CPU vuelve a valores normales' });
      return s;
    case 'service_crash': {
      // El gestor de servicios lo levanta solo (Restart=on-failure) si nadie lo ha hecho antes.
      const service = s.services.find((svc) => svc.name === incident.target);
      if (!service || service.status !== 'failed') return s;
      logs.push({ level: 'info', server: s.name, source: serviceManager(s), message: `${service.name} reiniciado automáticamente tras el fallo` });
      return { ...s, services: s.services.map((svc) => (svc === service ? { ...svc, status: 'running' } : svc)) };
    }
    case 'unreachable':
      logs.push({ level: 'info', server: s.name, source: 'monitor', message: 'Conectividad restablecida: responde de nuevo a ping y SSH' });
      return { ...s, reachability: 'up' };
    case 'disk_burst':
      return {
        ...s,
        partitions: s.partitions.map((partition) => {
          if (partition.mount !== incident.target) return partition;
          const target = clamp(partition.cleanupTo + rng.range(-2, 2), 5, 95);
          logs.push(cleanupEvent(s, partition, ((partition.usedPct - target) / 100) * partition.sizeGb));
          return { ...partition, usedPct: target };
        }),
      };
  }
}

// ---------------------------------------------------------------------------
// Incidentes aleatorios
// ---------------------------------------------------------------------------

const INCIDENT_WEIGHTS: [IncidentKind, number][] = [
  ['cpu_spike', 35],
  ['service_crash', 35],
  ['disk_burst', 15],
  ['unreachable', 15],
];

const HUNGRY_PROCESS: Record<Server['role'], string> = {
  web: 'php-fpm',
  api: 'node',
  database: 'postgres',
  cache: 'redis-server',
  mail: 'clamd',
  vpn: 'openvpn',
  backup: 'VeeamAgent.exe',
  ci: 'dockerd',
};

function pickWeighted<T>(rng: Rng, options: readonly [T, number][]): T {
  const total = options.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = rng.next() * total;
  for (const [value, weight] of options) {
    roll -= weight;
    if (roll < 0) return value;
  }
  return options[options.length - 1][0];
}

function maybeStartIncident(servers: Server[], rng: Rng, logs: NewLogEntry[]): Server[] {
  // Se tira el dado siempre, aunque luego no se use: así la secuencia del PRNG no
  // depende de cuántos incidentes haya y el comportamiento es más estable.
  const roll = rng.chance(INCIDENT_CHANCE);
  const busy = servers.filter((s) => s.incident || s.reachability !== 'up').length;
  if (!roll || busy >= MAX_CONCURRENT_INCIDENTS) return servers;

  const candidates = servers.filter((s) => !s.incident && s.reachability === 'up');
  if (candidates.length === 0) return servers;

  const victim = rng.pick(candidates);
  const kind = pickWeighted(rng, INCIDENT_WEIGHTS);
  const updated = startIncident(victim, kind, rng, logs);
  return servers.map((s) => (s.name === victim.name ? updated : s));
}

function startIncident(server: Server, kind: IncidentKind, rng: Rng, logs: NewLogEntry[]): Server {
  switch (kind) {
    case 'cpu_spike': {
      const process = HUNGRY_PROCESS[server.role];
      logs.push({ level: 'warning', server: server.name, source: process, message: 'Proceso consumiendo CPU de forma sostenida' });
      return { ...server, incident: { kind, ticksLeft: rng.int(6, 16), target: process } };
    }
    case 'service_crash': {
      const service = rng.pick(server.services);
      const message = isWindows(server)
        ? `El servicio ${service.name} se detuvo de forma inesperada (evento 7034)`
        : `${service.name}.service: el proceso principal terminó con status=1/FAILURE`;
      logs.push({ level: 'critical', server: server.name, source: serviceManager(server), message });
      return {
        ...server,
        incident: { kind, ticksLeft: rng.int(20, 50), target: service.name },
        services: server.services.map((svc) => (svc === service ? { ...svc, status: 'failed' } : svc)),
      };
    }
    case 'disk_burst': {
      const partition = rng.pick(server.partitions);
      logs.push({ level: 'warning', server: server.name, source: 'kernel', message: `Crecimiento anómalo de ficheros en ${partition.mount}` });
      return { ...server, incident: { kind, ticksLeft: rng.int(10, 16), target: partition.mount } };
    }
    case 'unreachable':
      // El propio servidor no puede avisar: lo detectará el monitor con la alerta.
      return { ...server, reachability: 'down', incident: { kind, ticksLeft: rng.int(6, 18), target: null } };
  }
}

function recordSample(server: Server, now: number): Server {
  const online = server.reachability === 'up';
  const { cpu, ram, netIn, netOut } = server.metrics;
  const sample = online
    ? { t: now, cpu, ram, netIn, netOut }
    : { t: now, cpu: null, ram: null, netIn: null, netOut: null };
  return { ...server, history: [...server.history, sample].slice(-HISTORY_LENGTH) };
}

// ---------------------------------------------------------------------------
// Acciones simuladas del operador
// ---------------------------------------------------------------------------

function updateServer(state: SimState, name: string, update: (server: Server) => Server): SimState {
  return { ...state, servers: state.servers.map((s) => (s.name === name ? update(s) : s)) };
}

function restartService(state: SimState, serverName: string, serviceName: string, now: number): SimState {
  const server = state.servers.find((s) => s.name === serverName);
  const service = server?.services.find((svc) => svc.name === serviceName);
  if (!server || !service || server.reachability !== 'up' || service.status === 'restarting') return state;

  const next = updateServer(state, serverName, (s) => ({
    ...s,
    // Si el incidente era la caída de este servicio, el reinicio lo soluciona.
    incident: s.incident?.kind === 'service_crash' && s.incident.target === serviceName ? null : s.incident,
    services: s.services.map((svc) => (svc.name === serviceName ? { ...svc, status: 'restarting' } : svc)),
  }));
  return appendLog(next, now, [
    { level: 'info', server: serverName, source: 'operador', message: `Reinicio simulado de ${serviceName} solicitado desde InfraPulse` },
  ]);
}

function rebootServer(state: SimState, serverName: string, now: number): SimState {
  const server = state.servers.find((s) => s.name === serverName);
  if (!server || server.reachability === 'rebooting') return state;

  const viaIpmi = server.reachability === 'down';
  const next = updateServer(state, serverName, (s) => ({
    ...s,
    reachability: 'rebooting',
    rebootTicks: REBOOT_TICKS,
    incident: null,
  }));
  return appendLog(next, now, [
    {
      level: 'warning',
      server: serverName,
      source: 'operador',
      message: viaIpmi
        ? 'Reinicio forzado simulado (vía IPMI) solicitado desde InfraPulse'
        : 'Reinicio simulado del servidor solicitado desde InfraPulse',
    },
  ]);
}

function acknowledgeAlert(state: SimState, id: string, now: number): SimState {
  const alert = state.activeAlerts.find((a) => a.id === id);
  if (!alert || alert.acknowledgedAt != null) return state;
  const next = {
    ...state,
    activeAlerts: state.activeAlerts.map((a) => (a.id === id ? { ...a, acknowledgedAt: now } : a)),
  };
  return appendLog(next, now, [
    { level: 'info', server: alert.server, source: 'operador', message: `Alerta reconocida: ${RULE_LABELS[alert.rule]}${alert.target ? ` (${alert.target})` : ''}` },
  ]);
}

// ---------------------------------------------------------------------------
// Registro de eventos
// ---------------------------------------------------------------------------

function alertChangeEvent(change: AlertChange, now: number): NewLogEntry {
  const { alert } = change;
  const base = { server: alert.server, source: 'monitor' };
  switch (change.kind) {
    case 'fired':
      return {
        ...base,
        level: alert.severity,
        message: `Alerta ${alert.severity === 'critical' ? 'crítica' : 'de aviso'}: ${alert.message}`,
      };
    case 'escalated':
      return { ...base, level: 'critical', message: `Alerta escalada a crítica: ${alert.message}` };
    case 'deescalated':
      return { ...base, level: 'warning', message: `Alerta rebajada a aviso: ${alert.message}` };
    case 'resolved':
      return {
        ...base,
        level: 'info',
        message: `Alerta resuelta tras ${formatDuration(alertDurationSec(alert, now))}: ${RULE_LABELS[alert.rule]}${alert.target ? ` (${alert.target})` : ''}`,
      };
  }
}

/** Añade entradas al registro (guardado de más reciente a más antigua). */
function appendLog(state: SimState, ts: number, entries: readonly NewLogEntry[]): SimState {
  if (entries.length === 0) return state;
  const stamped = entries.map((entry, index) => ({ ...entry, id: state.nextLogId + index, ts }));
  return {
    ...state,
    log: [...stamped.reverse(), ...state.log].slice(0, LOG_LIMIT),
    nextLogId: state.nextLogId + entries.length,
  };
}
