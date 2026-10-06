import { toCsv } from '../lib/csv';
import type { LogEntry, LogLevel } from './types';

/** Filtros y exportación del registro de eventos (lógica pura). */

export type LevelFilter = LogLevel | 'all';

export function filterLog(entries: readonly LogEntry[], level: LevelFilter, query: string): LogEntry[] {
  const text = query.trim().toLowerCase();
  return entries.filter(
    (entry) =>
      (level === 'all' || entry.level === level) &&
      (text === '' ||
        entry.message.toLowerCase().includes(text) ||
        entry.source.toLowerCase().includes(text) ||
        (entry.server ?? '').toLowerCase().includes(text)),
  );
}

export function countByLevel(entries: readonly LogEntry[]): Record<LevelFilter, number> {
  const counts: Record<LevelFilter, number> = { all: entries.length, info: 0, warning: 0, critical: 0 };
  for (const entry of entries) counts[entry.level] += 1;
  return counts;
}

const LEVEL_CSV: Record<LogLevel, string> = { info: 'info', warning: 'aviso', critical: 'critico' };

/** CSV con fecha ISO 8601 (inequívoca al importarla en otras herramientas). */
export function logToCsv(entries: readonly LogEntry[]): string {
  return toCsv([
    ['fecha', 'nivel', 'servidor', 'origen', 'mensaje'],
    ...entries.map((entry) => [
      new Date(entry.ts).toISOString(),
      LEVEL_CSV[entry.level],
      entry.server ?? '',
      entry.source,
      entry.message,
    ]),
  ]);
}
