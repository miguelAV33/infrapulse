import { fullestPartition, STATUS_RANK } from './selectors';
import type { Datacenter, Role, Server, ServerStatus } from './types';

/** Filtrado y ordenación de la lista de servidores del resumen (lógica pura). */

export interface ServerFilters {
  query: string;
  status: ServerStatus | 'all';
  role: Role | 'all';
  datacenter: Datacenter | 'all';
}

export const EMPTY_FILTERS: ServerFilters = { query: '', status: 'all', role: 'all', datacenter: 'all' };

export type SortKey = 'name' | 'status' | 'cpu' | 'ram' | 'disk' | 'net';
export type SortDirection = 'asc' | 'desc';
export interface SortState {
  key: SortKey;
  direction: SortDirection;
}

/** Dirección inicial al pulsar una columna: las métricas, de mayor a menor. */
export const DEFAULT_DIRECTION: Record<SortKey, SortDirection> = {
  name: 'asc',
  status: 'asc',
  cpu: 'desc',
  ram: 'desc',
  disk: 'desc',
  net: 'desc',
};

export function hasActiveFilters(filters: ServerFilters): boolean {
  return (
    filters.query.trim() !== '' || filters.status !== 'all' || filters.role !== 'all' || filters.datacenter !== 'all'
  );
}

export function filterServers(
  servers: readonly Server[],
  filters: ServerFilters,
  statuses: Readonly<Record<string, ServerStatus>>,
): Server[] {
  const query = filters.query.trim().toLowerCase();
  return servers.filter(
    (server) =>
      (query === '' || server.name.toLowerCase().includes(query) || server.ip.includes(query)) &&
      (filters.status === 'all' || statuses[server.name] === filters.status) &&
      (filters.role === 'all' || server.role === filters.role) &&
      (filters.datacenter === 'all' || server.datacenter === filters.datacenter),
  );
}

/** Valor numérico por el que se ordena; sin conexión cuenta como -1 (al final en orden descendente). */
function metricFor(server: Server, key: Exclude<SortKey, 'name' | 'status'>): number {
  if (server.reachability !== 'up') return -1;
  switch (key) {
    case 'cpu':
      return server.metrics.cpu;
    case 'ram':
      return server.metrics.ram;
    case 'disk':
      return fullestPartition(server).usedPct;
    case 'net':
      return server.metrics.netIn + server.metrics.netOut;
  }
}

export function sortServers(
  servers: readonly Server[],
  sort: SortState,
  statuses: Readonly<Record<string, ServerStatus>>,
): Server[] {
  const factor = sort.direction === 'asc' ? 1 : -1;
  const byName = (a: Server, b: Server) => a.name.localeCompare(b.name, 'es');

  return [...servers].sort((a, b) => {
    if (sort.key === 'name') return factor * byName(a, b);
    if (sort.key === 'status') {
      const diff = STATUS_RANK[statuses[a.name]] - STATUS_RANK[statuses[b.name]];
      return diff !== 0 ? factor * diff : byName(a, b);
    }
    const diff = metricFor(a, sort.key) - metricFor(b, sort.key);
    return diff !== 0 ? factor * diff : byName(a, b);
  });
}
