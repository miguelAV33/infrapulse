import { describe, expect, it } from 'vitest';
import { makeServer, thresholds, withMetrics } from '../test/fixtures';
import {
  alertDurationSec,
  collectConditions,
  evaluateAlerts,
  nextStreak,
  reconcileAlerts,
  streakSeverity,
  thresholdSeverity,
  type AlertCondition,
} from './alerts';
import type { Alert, Server, Streak } from './types';

/** Ejecuta varios ticks seguidos sobre el mismo servidor con la CPU indicada. */
function runCpuTicks(cpuValues: number[], startAt = 0) {
  let active: Alert[] = [];
  let streaks: Record<string, Streak> = {};
  const resolved: Alert[] = [];
  const history: Alert[][] = [];
  cpuValues.forEach((cpu, i) => {
    const result = evaluateAlerts({
      servers: [withMetrics(cpu)],
      thresholds,
      streaks,
      active,
      now: startAt + i * 1000,
    });
    active = result.active;
    streaks = result.streaks;
    resolved.push(...result.resolved);
    history.push(active);
  });
  return { active, streaks, resolved, history };
}

describe('rachas de ticks consecutivos', () => {
  it('nextStreak cuenta por separado aviso y crítico', () => {
    let streak = nextStreak(undefined, 85, 80, 90);
    expect(streak).toEqual({ warning: 1, critical: 0 });
    streak = nextStreak(streak, 95, 80, 90);
    expect(streak).toEqual({ warning: 2, critical: 1 });
    streak = nextStreak(streak, 50, 80, 90);
    expect(streak).toEqual({ warning: 0, critical: 0 });
  });

  it('streakSeverity exige llegar al número de ticks', () => {
    expect(streakSeverity({ warning: 2, critical: 0 }, 3)).toBeNull();
    expect(streakSeverity({ warning: 3, critical: 0 }, 3)).toBe('warning');
    expect(streakSeverity({ warning: 5, critical: 3 }, 3)).toBe('critical');
  });

  it('thresholdSeverity es inmediato y estricto (mayor que)', () => {
    expect(thresholdSeverity(85, 85, 95)).toBeNull();
    expect(thresholdSeverity(85.1, 85, 95)).toBe('warning');
    expect(thresholdSeverity(96, 85, 95)).toBe('critical');
  });
});

describe('regla de CPU', () => {
  it('no alerta hasta el tercer tick consecutivo por encima del umbral crítico', () => {
    const { history } = runCpuTicks([95, 95, 95]);
    expect(history[0]).toHaveLength(0);
    expect(history[1]).toHaveLength(0);
    expect(history[2]).toHaveLength(1);
    expect(history[2][0]).toMatchObject({ rule: 'cpu', severity: 'critical', server: 'web-01', firedAt: 2000 });
  });

  it('un tick por debajo reinicia la racha', () => {
    const { active } = runCpuTicks([95, 95, 50, 95, 95]);
    expect(active).toHaveLength(0);
  });

  it('escala de aviso a crítico manteniendo la misma alerta', () => {
    const { history } = runCpuTicks([85, 85, 85, 95, 95, 95]);
    const warning = history[2][0];
    expect(warning.severity).toBe('warning');
    // Tick 5: solo dos ticks críticos → sigue en aviso. Tick 6: tercero → crítico.
    expect(history[4][0].severity).toBe('warning');
    const critical = history[5][0];
    expect(critical.severity).toBe('critical');
    expect(critical.peakSeverity).toBe('critical');
    expect(critical.id).toBe(warning.id);
    expect(critical.firedAt).toBe(warning.firedAt);
  });

  it('se resuelve cuando la condición desaparece y calcula la duración', () => {
    const { active, resolved } = runCpuTicks([95, 95, 95, 95, 40]);
    expect(active).toHaveLength(0);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].resolvedAt).toBe(4000);
    expect(alertDurationSec(resolved[0], 99_999)).toBe(2);
  });

  it('respeta un número de ticks configurado distinto', () => {
    const result = evaluateAlerts({
      servers: [withMetrics(99)],
      thresholds: { ...thresholds, consecutiveTicks: 1 },
      streaks: {},
      active: [],
      now: 0,
    });
    expect(result.active).toHaveLength(1);
  });
});

describe('reconocimiento y cambios de severidad', () => {
  const base: Alert = {
    id: 'cpu@web-01#0',
    key: 'cpu@web-01',
    rule: 'cpu',
    server: 'web-01',
    target: null,
    severity: 'warning',
    peakSeverity: 'warning',
    message: 'CPU alta',
    firedAt: 0,
    acknowledgedAt: 500,
    resolvedAt: null,
  };
  const condition = (severity: 'warning' | 'critical'): AlertCondition => ({
    key: base.key,
    rule: 'cpu',
    server: 'web-01',
    target: null,
    severity,
    message: 'CPU alta',
  });

  it('al escalar a crítico se pierde el reconocimiento', () => {
    const { active, changes } = reconcileAlerts([base], [condition('critical')], 1000);
    expect(active[0].acknowledgedAt).toBeNull();
    expect(changes).toEqual([{ kind: 'escalated', alert: active[0] }]);
  });

  it('al rebajar a aviso se conserva el reconocimiento y el pico', () => {
    const critical = { ...base, severity: 'critical' as const, peakSeverity: 'critical' as const };
    const { active, changes } = reconcileAlerts([critical], [condition('warning')], 1000);
    expect(active[0]).toMatchObject({ severity: 'warning', peakSeverity: 'critical', acknowledgedAt: 500 });
    expect(changes[0].kind).toBe('deescalated');
  });

  it('si nada cambia devuelve la misma referencia (sin re-render innecesario)', () => {
    const { active, changes } = reconcileAlerts([base], [condition('warning')], 1000);
    expect(active[0]).toBe(base);
    expect(changes).toHaveLength(0);
  });
});

describe('reglas de disco, servicios y conectividad', () => {
  it('disco: aviso por encima del 85 % y crítico por encima del 95 %', () => {
    const disk = (usedPct: number): Server =>
      makeServer({ partitions: [{ mount: '/var', sizeGb: 100, usedPct, growthPerTick: 0, cleanupAt: 99, cleanupTo: 50 }] });
    const severities = [80, 86, 96].map(
      (used) => collectConditions([disk(used)], thresholds, {}, []).conditions[0]?.severity ?? null,
    );
    expect(severities).toEqual([null, 'warning', 'critical']);
  });

  it('servicio detenido → crítico; reiniciándose → sin alerta', () => {
    const failed = makeServer({ services: [{ name: 'nginx', port: 443, status: 'failed' }] });
    const restarting = makeServer({ services: [{ name: 'nginx', port: 443, status: 'restarting' }] });
    expect(collectConditions([failed], thresholds, {}, []).conditions).toEqual([
      expect.objectContaining({ rule: 'service', target: 'nginx', severity: 'critical', key: 'service:nginx@web-01' }),
    ]);
    expect(collectConditions([restarting], thresholds, {}, []).conditions).toHaveLength(0);
  });

  it('servidor sin respuesta → crítico, y sus otras alertas se congelan', () => {
    const fullDisk = makeServer({
      partitions: [{ mount: '/', sizeGb: 100, usedPct: 90, growthPerTick: 0, cleanupAt: 99, cleanupTo: 50 }],
    });
    const first = evaluateAlerts({ servers: [fullDisk], thresholds, streaks: {}, active: [], now: 0 });
    expect(first.active).toHaveLength(1);

    const down = { ...fullDisk, reachability: 'down' as const };
    const second = evaluateAlerts({
      servers: [down],
      thresholds,
      streaks: { 'cpu@web-01': { warning: 2, critical: 1 } },
      active: first.active,
      now: 1000,
    });
    expect(second.resolved).toHaveLength(0);
    expect(second.active.map((a) => a.rule).sort()).toEqual(['disk', 'unreachable']);
    expect(second.active.find((a) => a.rule === 'disk')).toBe(first.active[0]);
    expect(second.streaks['cpu@web-01']).toEqual({ warning: 2, critical: 1 });
  });

  it('un reinicio planificado no genera alerta de conectividad', () => {
    const rebooting = makeServer({ reachability: 'rebooting' });
    expect(collectConditions([rebooting], thresholds, {}, []).conditions).toHaveLength(0);
  });
});
