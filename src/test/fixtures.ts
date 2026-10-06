import type { Server, Thresholds } from '../sim/types';
import { DEFAULT_THRESHOLDS } from '../sim/settings';

/** Servidor mínimo para tests: se sobrescribe solo lo que interesa en cada caso. */
export function makeServer(overrides: Partial<Server> = {}): Server {
  return {
    name: 'web-01',
    role: 'web',
    description: 'Servidor de prueba',
    os: 'Ubuntu 24.04 LTS',
    datacenter: 'Madrid-DC1',
    ip: '10.10.1.11',
    cores: 4,
    ramGb: 8,
    partitions: [{ mount: '/', sizeGb: 100, usedPct: 40, growthPerTick: 0, cleanupAt: 90, cleanupTo: 30 }],
    services: [{ name: 'nginx', port: 443, status: 'running' }],
    uptimeSec: 1000,
    reachability: 'up',
    rebootTicks: 0,
    metrics: { cpu: 20, ram: 40, netIn: 10, netOut: 10, load: [1, 1, 1] },
    jobTicks: 0,
    history: [],
    incident: null,
    ...overrides,
  };
}

export const thresholds: Thresholds = { ...DEFAULT_THRESHOLDS };

/** Servidor con CPU y RAM concretas. */
export function withMetrics(cpu: number, ram = 40, overrides: Partial<Server> = {}): Server {
  return makeServer({ metrics: { cpu, ram, netIn: 10, netOut: 10, load: [1, 1, 1] }, ...overrides });
}
