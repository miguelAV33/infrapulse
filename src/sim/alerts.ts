import { formatPercent } from '../lib/format';
import type { Alert, AlertRule, Server, Severity, Streak, Thresholds } from './types';

/**
 * Motor de reglas de alerta. Son funciones puras: reciben el estado de la
 * flota y las alertas activas y devuelven las alertas nuevas, escaladas y
 * resueltas. No saben nada de React ni de temporizadores, por eso se testean
 * de forma aislada.
 *
 * Reglas:
 *  - CPU / RAM: por encima del umbral durante N ticks consecutivos → aviso o crítico.
 *  - Disco: por encima del umbral → aviso o crítico (cambia despacio, no hace falta racha).
 *  - Servicio caído → crítico.
 *  - Servidor sin respuesta → crítico.
 */

export const RULE_LABELS: Record<AlertRule, string> = {
  cpu: 'CPU alta',
  ram: 'Memoria alta',
  disk: 'Disco casi lleno',
  service: 'Servicio caído',
  unreachable: 'Servidor inaccesible',
};

export const SEVERITY_LABELS: Record<Severity, string> = {
  warning: 'Aviso',
  critical: 'Crítico',
};

const SEVERITY_RANK: Record<Severity, number> = { warning: 1, critical: 2 };

/** Situación anómala detectada en este tick; si persiste, la alerta sigue activa. */
export interface AlertCondition {
  key: string;
  rule: AlertRule;
  server: string;
  target: string | null;
  severity: Severity;
  message: string;
}

export type AlertChange =
  | { kind: 'fired'; alert: Alert }
  | { kind: 'escalated'; alert: Alert }
  | { kind: 'deescalated'; alert: Alert }
  | { kind: 'resolved'; alert: Alert };

/** Actualiza la racha de ticks consecutivos por encima de los umbrales. */
export function nextStreak(
  previous: Streak | undefined,
  value: number,
  warning: number,
  critical: number,
): Streak {
  const prev = previous ?? { warning: 0, critical: 0 };
  if (value > critical) return { warning: prev.warning + 1, critical: prev.critical + 1 };
  if (value > warning) return { warning: prev.warning + 1, critical: 0 };
  return { warning: 0, critical: 0 };
}

/** Severidad que corresponde a una racha: hace falta llegar a `requiredTicks`. */
export function streakSeverity(streak: Streak, requiredTicks: number): Severity | null {
  if (streak.critical >= requiredTicks) return 'critical';
  if (streak.warning >= requiredTicks) return 'warning';
  return null;
}

/** Severidad inmediata por umbral (sin racha), usada para los discos. */
export function thresholdSeverity(value: number, warning: number, critical: number): Severity | null {
  if (value > critical) return 'critical';
  if (value > warning) return 'warning';
  return null;
}

export const alertKey = (rule: AlertRule, server: string, target: string | null = null): string =>
  target ? `${rule}:${target}@${server}` : `${rule}@${server}`;

/** Recorre la flota y devuelve las condiciones de alerta de este tick. */
export function collectConditions(
  servers: readonly Server[],
  thresholds: Thresholds,
  previousStreaks: Readonly<Record<string, Streak>>,
  activeAlerts: readonly Alert[],
): { conditions: AlertCondition[]; streaks: Record<string, Streak> } {
  const conditions: AlertCondition[] = [];
  const streaks: Record<string, Streak> = {};

  for (const server of servers) {
    const cpuKey = alertKey('cpu', server.name);
    const ramKey = alertKey('ram', server.name);

    if (server.reachability !== 'up') {
      // Sin métricas no podemos evaluar: congelamos rachas y alertas previas
      // (igual que un check "UNKNOWN" en Nagios) en vez de darlas por resueltas.
      if (previousStreaks[cpuKey]) streaks[cpuKey] = previousStreaks[cpuKey];
      if (previousStreaks[ramKey]) streaks[ramKey] = previousStreaks[ramKey];
      for (const alert of activeAlerts) {
        if (alert.server === server.name && alert.rule !== 'unreachable') {
          const { key, rule, target, severity, message } = alert;
          conditions.push({ key, rule, server: server.name, target, severity, message });
        }
      }
      // Un reinicio pedido por el operador es una parada planificada: no alerta.
      if (server.reachability === 'down') {
        conditions.push({
          key: alertKey('unreachable', server.name),
          rule: 'unreachable',
          server: server.name,
          target: null,
          severity: 'critical',
          message: `${server.name} no responde a ping ni a SSH`,
        });
      }
      continue;
    }

    const { cpu, ram } = server.metrics;
    const required = thresholds.consecutiveTicks;

    const cpuStreak = nextStreak(previousStreaks[cpuKey], cpu, thresholds.cpuWarning, thresholds.cpuCritical);
    streaks[cpuKey] = cpuStreak;
    const cpuSeverity = streakSeverity(cpuStreak, required);
    if (cpuSeverity) {
      const limit = cpuSeverity === 'critical' ? thresholds.cpuCritical : thresholds.cpuWarning;
      const ticks = cpuSeverity === 'critical' ? cpuStreak.critical : cpuStreak.warning;
      conditions.push({
        key: cpuKey,
        rule: 'cpu',
        server: server.name,
        target: null,
        severity: cpuSeverity,
        message: `CPU al ${formatPercent(cpu)} durante ${ticks} ticks (umbral ${formatPercent(limit)})`,
      });
    }

    const ramStreak = nextStreak(previousStreaks[ramKey], ram, thresholds.ramWarning, thresholds.ramCritical);
    streaks[ramKey] = ramStreak;
    const ramSeverity = streakSeverity(ramStreak, required);
    if (ramSeverity) {
      const limit = ramSeverity === 'critical' ? thresholds.ramCritical : thresholds.ramWarning;
      conditions.push({
        key: ramKey,
        rule: 'ram',
        server: server.name,
        target: null,
        severity: ramSeverity,
        message: `Memoria al ${formatPercent(ram)} (umbral ${formatPercent(limit)})`,
      });
    }

    for (const partition of server.partitions) {
      const severity = thresholdSeverity(partition.usedPct, thresholds.diskWarning, thresholds.diskCritical);
      if (!severity) continue;
      const limit = severity === 'critical' ? thresholds.diskCritical : thresholds.diskWarning;
      conditions.push({
        key: alertKey('disk', server.name, partition.mount),
        rule: 'disk',
        server: server.name,
        target: partition.mount,
        severity,
        message: `Partición ${partition.mount} al ${formatPercent(partition.usedPct)} (umbral ${formatPercent(limit)})`,
      });
    }

    for (const service of server.services) {
      if (service.status !== 'failed') continue;
      conditions.push({
        key: alertKey('service', server.name, service.name),
        rule: 'service',
        server: server.name,
        target: service.name,
        severity: 'critical',
        message: `El servicio ${service.name} está detenido`,
      });
    }
  }

  return { conditions, streaks };
}

/**
 * Compara las condiciones de este tick con las alertas activas:
 *  - condición nueva          → alerta disparada
 *  - sube de severidad        → escalada (y se pierde el "reconocida": hay que volver a mirarla)
 *  - baja de severidad        → rebajada
 *  - la condición desaparece  → resuelta (pasa al historial con su hora de fin)
 */
export function reconcileAlerts(
  active: readonly Alert[],
  conditions: readonly AlertCondition[],
  now: number,
): { active: Alert[]; resolved: Alert[]; changes: AlertChange[] } {
  const byKey = new Map(active.map((alert) => [alert.key, alert]));
  const seen = new Set<string>();
  const nextActive: Alert[] = [];
  const changes: AlertChange[] = [];

  for (const condition of conditions) {
    seen.add(condition.key);
    const existing = byKey.get(condition.key);

    if (!existing) {
      const alert: Alert = {
        id: `${condition.key}#${now}`,
        key: condition.key,
        rule: condition.rule,
        server: condition.server,
        target: condition.target,
        severity: condition.severity,
        peakSeverity: condition.severity,
        message: condition.message,
        firedAt: now,
        acknowledgedAt: null,
        resolvedAt: null,
      };
      nextActive.push(alert);
      changes.push({ kind: 'fired', alert });
      continue;
    }

    if (existing.severity === condition.severity) {
      nextActive.push(existing.message === condition.message ? existing : { ...existing, message: condition.message });
      continue;
    }

    const escalated = SEVERITY_RANK[condition.severity] > SEVERITY_RANK[existing.severity];
    const updated: Alert = {
      ...existing,
      severity: condition.severity,
      message: condition.message,
      peakSeverity: escalated ? condition.severity : existing.peakSeverity,
      acknowledgedAt: escalated ? null : existing.acknowledgedAt,
    };
    nextActive.push(updated);
    changes.push({ kind: escalated ? 'escalated' : 'deescalated', alert: updated });
  }

  const resolved: Alert[] = [];
  for (const alert of active) {
    if (seen.has(alert.key)) continue;
    const done = { ...alert, resolvedAt: now };
    resolved.push(done);
    changes.push({ kind: 'resolved', alert: done });
  }

  return { active: nextActive, resolved, changes };
}

/** Atajo que encadena los dos pasos anteriores. */
export function evaluateAlerts(input: {
  servers: readonly Server[];
  thresholds: Thresholds;
  streaks: Readonly<Record<string, Streak>>;
  active: readonly Alert[];
  now: number;
}): { active: Alert[]; resolved: Alert[]; changes: AlertChange[]; streaks: Record<string, Streak> } {
  const { conditions, streaks } = collectConditions(input.servers, input.thresholds, input.streaks, input.active);
  return { ...reconcileAlerts(input.active, conditions, input.now), streaks };
}

/** Duración de una alerta en segundos (hasta ahora si sigue activa). */
export function alertDurationSec(alert: Alert, now: number): number {
  return ((alert.resolvedAt ?? now) - alert.firedAt) / 1000;
}
