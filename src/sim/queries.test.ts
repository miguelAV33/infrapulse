import { describe, expect, it } from 'vitest';
import { makeServer, withMetrics } from '../test/fixtures';
import { countByLevel, filterLog, logToCsv } from './logQuery';
import { fleetSummary, serverStatus, statusByServer } from './selectors';
import { EMPTY_FILTERS, filterServers, hasActiveFilters, sortServers } from './serverQuery';
import { createStore } from './store';
import type { Alert, LogEntry } from './types';

const alert = (server: string, severity: Alert['severity'], acknowledgedAt: number | null = null): Alert => ({
  id: `${server}-${severity}`,
  key: `cpu@${server}`,
  rule: 'cpu',
  server,
  target: null,
  severity,
  peakSeverity: severity,
  message: '',
  firedAt: 0,
  acknowledgedAt,
  resolvedAt: null,
});

const fleet = [
  withMetrics(20, 40, { name: 'web-01', ip: '10.10.1.11', role: 'web', datacenter: 'Madrid-DC1' }),
  withMetrics(70, 40, { name: 'db-01', ip: '10.10.3.31', role: 'database', datacenter: 'Madrid-DC1' }),
  withMetrics(50, 40, { name: 'vpn-01', ip: '10.10.0.5', role: 'vpn', datacenter: 'Frankfurt-DC2' }),
  withMetrics(99, 40, { name: 'mail-01', ip: '10.10.5.51', role: 'mail', reachability: 'down' }),
];
const alerts = [alert('db-01', 'critical'), alert('vpn-01', 'warning', 5)];
const statuses = statusByServer({ servers: fleet, activeAlerts: alerts });

describe('estado de un servidor', () => {
  it('deriva el estado de sus alertas y su conectividad', () => {
    expect(statuses).toEqual({ 'web-01': 'ok', 'db-01': 'critical', 'vpn-01': 'warning', 'mail-01': 'offline' });
  });

  it('una alerta crítica pesa más que un aviso', () => {
    expect(serverStatus(makeServer(), [alert('web-01', 'warning'), alert('web-01', 'critical')])).toBe('critical');
  });
});

describe('fleetSummary', () => {
  it('cuenta servidores en línea y alertas por severidad', () => {
    const summary = fleetSummary({ servers: fleet, activeAlerts: alerts });
    expect(summary.total).toBe(4);
    expect(summary.online).toBe(3);
    expect(summary.alerts).toEqual({ critical: 1, warning: 1, unacknowledged: 1 });
    // La media solo usa servidores en línea: (20 + 70 + 50) / 3
    expect(summary.avgCpu).toBeCloseTo(46.67, 1);
  });
});

describe('filtrado y ordenación de servidores', () => {
  it('filtra por texto (nombre o IP), estado, rol y centro de datos', () => {
    const names = (filters: Partial<typeof EMPTY_FILTERS>) =>
      filterServers(fleet, { ...EMPTY_FILTERS, ...filters }, statuses).map((s) => s.name);
    expect(names({ query: 'WEB' })).toEqual(['web-01']);
    expect(names({ query: '10.10.3' })).toEqual(['db-01']);
    expect(names({ status: 'offline' })).toEqual(['mail-01']);
    expect(names({ role: 'vpn' })).toEqual(['vpn-01']);
    expect(names({ datacenter: 'Frankfurt-DC2' })).toEqual(['vpn-01']);
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, query: ' x ' })).toBe(true);
  });

  it('ordena por CPU descendente dejando al final los servidores sin conexión', () => {
    const sorted = sortServers(fleet, { key: 'cpu', direction: 'desc' }, statuses).map((s) => s.name);
    expect(sorted).toEqual(['db-01', 'vpn-01', 'web-01', 'mail-01']);
  });

  it('ordena por estado: crítico, sin conexión, aviso y ok', () => {
    const sorted = sortServers(fleet, { key: 'status', direction: 'asc' }, statuses).map((s) => s.name);
    expect(sorted).toEqual(['db-01', 'mail-01', 'vpn-01', 'web-01']);
  });
});

describe('registro de eventos', () => {
  const log: LogEntry[] = [
    { id: 3, ts: Date.UTC(2026, 9, 6, 10, 0, 2), level: 'critical', server: 'db-01', source: 'monitor', message: 'Disco "lleno"; revisar' },
    { id: 2, ts: Date.UTC(2026, 9, 6, 10, 0, 1), level: 'warning', server: 'web-01', source: 'kernel', message: 'Pico de CPU' },
    { id: 1, ts: Date.UTC(2026, 9, 6, 10, 0, 0), level: 'info', server: null, source: 'infrapulse', message: 'Inicio' },
  ];

  it('filtra por nivel y por texto en mensaje, origen o servidor', () => {
    expect(filterLog(log, 'warning', '').map((e) => e.id)).toEqual([2]);
    expect(filterLog(log, 'all', 'DB-01').map((e) => e.id)).toEqual([3]);
    expect(filterLog(log, 'all', 'kernel').map((e) => e.id)).toEqual([2]);
    expect(countByLevel(log)).toEqual({ all: 3, info: 1, warning: 1, critical: 1 });
  });

  it('exporta a CSV con cabecera, fecha ISO y campos escapados', () => {
    const lines = logToCsv(log).split('\r\n');
    expect(lines[0]).toBe('fecha;nivel;servidor;origen;mensaje');
    expect(lines[1]).toBe('2026-10-06T10:00:02.000Z;critico;db-01;monitor;"Disco ""lleno""; revisar"');
    expect(lines[3]).toBe('2026-10-06T10:00:00.000Z;info;;infrapulse;Inicio');
  });
});

describe('createStore', () => {
  it('notifica solo cuando el estado cambia y permite darse de baja', () => {
    const store = createStore((state: number, action: 'inc' | 'noop') => (action === 'inc' ? state + 1 : state), 0);
    let calls = 0;
    const unsubscribe = store.subscribe(() => calls++);
    store.dispatch('noop');
    expect(calls).toBe(0);
    store.dispatch('inc');
    expect(store.getState()).toBe(1);
    expect(calls).toBe(1);
    unsubscribe();
    store.dispatch('inc');
    expect(calls).toBe(1);
  });
});
