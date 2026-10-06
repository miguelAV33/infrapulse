import { describe, expect, it } from 'vitest';
import { thresholds } from '../test/fixtures';
import {
  createInitialState,
  HISTORY_LENGTH,
  LOG_LIMIT,
  MAX_CONCURRENT_INCIDENTS,
  REBOOT_TICKS,
  RESOLVED_LIMIT,
  simulationReducer,
} from './simulation';
import type { Server, SimState } from './types';

const START = Date.UTC(2026, 9, 6, 10, 0, 0);
const INTERVAL = 2000;

function init(seed = 42): SimState {
  return createInitialState({ seed, now: START, thresholds, intervalMs: INTERVAL });
}

function tick(state: SimState, times = 1): SimState {
  let next = state;
  for (let i = 0; i < times; i++) {
    next = simulationReducer(next, { type: 'tick', now: next.now + INTERVAL, thresholds });
  }
  return next;
}

function server(state: SimState, name: string): Server {
  const found = state.servers.find((s) => s.name === name);
  if (!found) throw new Error(`No existe ${name}`);
  return found;
}

/** Devuelve una copia del estado con un servidor modificado (para preparar escenarios). */
function patchServer(state: SimState, name: string, patch: Partial<Server>): SimState {
  return { ...state, servers: state.servers.map((s) => (s.name === name ? { ...s, ...patch } : s)) };
}

const inRange = (value: number | null, min: number, max: number) =>
  value == null || (value >= min && value <= max);

describe('estado inicial', () => {
  it('crea la flota con el histórico precalentado', () => {
    const state = init();
    expect(state.servers).toHaveLength(10);
    expect(state.tick).toBe(HISTORY_LENGTH);
    expect(state.now).toBe(START);
    for (const s of state.servers) expect(s.history).toHaveLength(HISTORY_LENGTH);
  });

  it('incluye sistemas operativos y centros de datos variados', () => {
    const state = init();
    expect(new Set(state.servers.map((s) => s.os)).size).toBeGreaterThanOrEqual(4);
    expect(new Set(state.servers.map((s) => s.datacenter))).toEqual(new Set(['Madrid-DC1', 'Frankfurt-DC2']));
  });
});

describe('determinismo', () => {
  it('la misma semilla produce exactamente el mismo estado', () => {
    expect(tick(init(42), 300)).toEqual(tick(init(42), 300));
  });

  it('semillas distintas producen simulaciones distintas', () => {
    const a = tick(init(1), 50).servers.map((s) => s.metrics.cpu);
    const b = tick(init(2), 50).servers.map((s) => s.metrics.cpu);
    expect(a).not.toEqual(b);
  });
});

describe('límites de la simulación', () => {
  it.each([1, 42, 2026, 987654321])('con la semilla %i todo se mantiene en rango durante 1500 ticks', (seed) => {
    // Se acumulan las infracciones y se comprueban al final (un expect por valor sería muy lento).
    const problems: string[] = [];
    let state = init(seed);
    for (let i = 0; i < 1500; i++) {
      state = tick(state);
      const busy = state.servers.filter((s) => s.incident || s.reachability !== 'up').length;
      if (busy > MAX_CONCURRENT_INCIDENTS + 1) problems.push(`tick ${state.tick}: ${busy} incidentes simultáneos`);
      if (state.log.length > LOG_LIMIT) problems.push(`tick ${state.tick}: registro demasiado largo`);
      if (state.resolvedAlerts.length > RESOLVED_LIMIT) problems.push(`tick ${state.tick}: historial demasiado largo`);
      for (const s of state.servers) {
        const where = `tick ${state.tick} ${s.name}`;
        const { cpu, ram, netIn, netOut, load } = s.metrics;
        if (!inRange(cpu, 0, 100) || !inRange(ram, 0, 100)) problems.push(`${where}: cpu ${cpu} ram ${ram}`);
        if (netIn < 0 || netOut < 0 || load.some((l) => l < 0)) problems.push(`${where}: red o carga negativa`);
        if (s.partitions.some((p) => !inRange(p.usedPct, 0, 100))) problems.push(`${where}: disco fuera de rango`);
        if (s.history.length > HISTORY_LENGTH) problems.push(`${where}: histórico demasiado largo`);
        if (s.history.some((h) => !inRange(h.cpu, 0, 100) || !inRange(h.ram, 0, 100))) problems.push(`${where}: muestra fuera de rango`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('genera incidentes y alertas que acaban resolviéndose solas', () => {
    const state = tick(init(42), 600);
    expect(state.resolvedAlerts.length).toBeGreaterThan(0);
    expect(state.log.some((e) => e.source === 'monitor' && e.message.startsWith('Alerta resuelta'))).toBe(true);
  });

  it('las muestras sin conexión se guardan como null (huecos en la gráfica)', () => {
    const state = tick(patchServer(init(), 'web-01', { reachability: 'down', incident: { kind: 'unreachable', ticksLeft: 5, target: null } }));
    expect(server(state, 'web-01').history.at(-1)).toMatchObject({ cpu: null, ram: null });
    expect(state.activeAlerts.some((a) => a.rule === 'unreachable' && a.server === 'web-01')).toBe(true);
  });
});

describe('acciones del operador', () => {
  it('pausar detiene los ticks sin cambiar el estado', () => {
    const paused = simulationReducer(init(), { type: 'setPaused', paused: true });
    expect(simulationReducer(paused, { type: 'tick', now: START + 10_000, thresholds })).toBe(paused);
  });

  it('reiniciar un servicio caído lo pone en "restarting" y en el siguiente tick vuelve a "running"', () => {
    let state = patchServer(init(), 'web-01', {
      services: server(init(), 'web-01').services.map((s) => (s.name === 'nginx' ? { ...s, status: 'failed' } : s)),
      incident: { kind: 'service_crash', ticksLeft: 30, target: 'nginx' },
    });
    state = simulationReducer(state, { type: 'restartService', server: 'web-01', service: 'nginx', now: START + 1 });

    const nginx = () => server(state, 'web-01').services.find((s) => s.name === 'nginx');
    expect(nginx()?.status).toBe('restarting');
    expect(server(state, 'web-01').incident).toBeNull();
    expect(state.log[0]).toMatchObject({ source: 'operador', server: 'web-01' });
    expect(state.log[0].message).toContain('simulado');

    state = tick(state);
    expect(nginx()?.status).toBe('running');
  });

  it('reiniciar el servidor lo deja fuera unos ticks y vuelve con uptime a cero', () => {
    let state = simulationReducer(init(), { type: 'rebootServer', server: 'db-01', now: START + 1 });
    expect(server(state, 'db-01').reachability).toBe('rebooting');
    state = tick(state, REBOOT_TICKS - 1);
    expect(server(state, 'db-01').reachability).toBe('rebooting');
    expect(state.activeAlerts.some((a) => a.server === 'db-01' && a.rule === 'unreachable')).toBe(false);
    state = tick(state);
    expect(server(state, 'db-01').reachability).toBe('up');
    expect(server(state, 'db-01').uptimeSec).toBeLessThan(10);
  });

  it('reconocer una alerta guarda la hora y deja constancia en el registro', () => {
    let state = tick(init(42), 200);
    const alert = state.activeAlerts[0] ?? null;
    expect(alert).not.toBeNull();
    if (!alert) return;
    state = simulationReducer(state, { type: 'acknowledgeAlert', id: alert.id, now: state.now + 5 });
    expect(state.activeAlerts.find((a) => a.id === alert.id)?.acknowledgedAt).toBe(state.now + 5);
    expect(state.log[0].message).toContain('Alerta reconocida');
    // Reconocer dos veces no hace nada.
    expect(simulationReducer(state, { type: 'acknowledgeAlert', id: alert.id, now: state.now + 9 })).toBe(state);
  });

  it('reset vuelve a generar la simulación con la semilla indicada', () => {
    const state = simulationReducer(tick(init(1), 20), {
      type: 'reset',
      seed: 42,
      now: START,
      thresholds,
      intervalMs: INTERVAL,
    });
    expect(state).toEqual(init(42));
  });
});
