import type { Alert, Server, ServerStatus, SimState } from './types';

/** Datos derivados del estado: se calculan al vuelo y no se guardan. */

export const STATUS_LABELS: Record<ServerStatus, string> = {
  ok: 'OK',
  warning: 'Aviso',
  critical: 'Crítico',
  offline: 'Sin conexión',
};

/** Orden de gravedad para ordenar listas (lo más urgente primero). */
export const STATUS_RANK: Record<ServerStatus, number> = {
  critical: 0,
  offline: 1,
  warning: 2,
  ok: 3,
};

export function serverStatus(server: Server, activeAlerts: readonly Alert[]): ServerStatus {
  if (server.reachability !== 'up') return 'offline';
  let status: ServerStatus = 'ok';
  for (const alert of activeAlerts) {
    if (alert.server !== server.name) continue;
    if (alert.severity === 'critical') return 'critical';
    status = 'warning';
  }
  return status;
}

export function statusByServer(state: Pick<SimState, 'servers' | 'activeAlerts'>): Record<string, ServerStatus> {
  return Object.fromEntries(state.servers.map((s) => [s.name, serverStatus(s, state.activeAlerts)]));
}

/** La partición más llena es la que importa para el resumen. */
export function fullestPartition(server: Server) {
  return server.partitions.reduce((max, p) => (p.usedPct > max.usedPct ? p : max));
}

export interface FleetSummary {
  total: number;
  online: number;
  alerts: { critical: number; warning: number; unacknowledged: number };
  avgCpu: number | null;
  /** Servidor en línea con la CPU más alta. */
  busiest: { name: string; cpu: number } | null;
  avgCpuHistory: (number | null)[];
  netIn: number;
  netOut: number;
  netHistory: (number | null)[];
}

/** Media de valores no nulos; null si no hay ninguno. */
function average(values: readonly (number | null)[]): number | null {
  const present = values.filter((v): v is number => v != null);
  return present.length === 0 ? null : present.reduce((a, b) => a + b, 0) / present.length;
}

export function fleetSummary(state: Pick<SimState, 'servers' | 'activeAlerts'>): FleetSummary {
  const online = state.servers.filter((s) => s.reachability === 'up');
  const alerts = { critical: 0, warning: 0, unacknowledged: 0 };
  for (const alert of state.activeAlerts) {
    alerts[alert.severity] += 1;
    if (alert.acknowledgedAt == null) alerts.unacknowledged += 1;
  }

  // Todas las series tienen la misma longitud (una muestra por tick y servidor).
  const length = Math.min(...state.servers.map((s) => s.history.length));
  const avgCpuHistory: (number | null)[] = [];
  const netHistory: (number | null)[] = [];
  for (let i = 0; i < length; i++) {
    const samples = state.servers.map((s) => s.history[s.history.length - length + i]);
    avgCpuHistory.push(average(samples.map((sample) => sample.cpu)));
    netHistory.push(samples.reduce((sum, sample) => sum + (sample.netIn ?? 0) + (sample.netOut ?? 0), 0));
  }

  return {
    total: state.servers.length,
    online: online.length,
    alerts,
    avgCpu: average(online.map((s) => s.metrics.cpu)),
    busiest: online.reduce<FleetSummary['busiest']>(
      (max, s) => (max == null || s.metrics.cpu > max.cpu ? { name: s.name, cpu: s.metrics.cpu } : max),
      null,
    ),
    avgCpuHistory,
    netIn: online.reduce((sum, s) => sum + s.metrics.netIn, 0),
    netOut: online.reduce((sum, s) => sum + s.metrics.netOut, 0),
    netHistory,
  };
}
