import { useMemo, useState } from 'react';
import { Icon } from '../components/Icon';
import { LevelBadge } from '../components/StatusPill';
import { EmptyState, PageHeader } from '../components/ui';
import { useSimulation } from '../context/simulation';
import { downloadTextFile } from '../lib/csv';
import { formatClock, formatNumber, plural } from '../lib/format';
import { routes } from '../lib/routes';
import { countByLevel, filterLog, logToCsv, type LevelFilter } from '../sim/logQuery';
import type { LogEntry } from '../sim/types';

const LEVEL_OPTIONS: [LevelFilter, string][] = [
  ['all', 'Todos'],
  ['info', 'Info'],
  ['warning', 'Aviso'],
  ['critical', 'Crítico'],
];

export function LogPage() {
  const { log } = useSimulation();
  const [level, setLevel] = useState<LevelFilter>('all');
  const [query, setQuery] = useState('');
  // Al pausar guardamos una "foto" del registro; la simulación sigue avanzando.
  const [snapshot, setSnapshot] = useState<LogEntry[] | null>(null);

  const entries = snapshot ?? log;
  const counts = useMemo(() => countByLevel(entries), [entries]);
  const visible = useMemo(() => filterLog(entries, level, query), [entries, level, query]);
  const pendingWhilePaused = snapshot ? newerEntries(log, snapshot) : 0;

  const exportCsv = () => {
    const stamp = new Date().toISOString().slice(0, 19).replaceAll(':', '-');
    downloadTextFile(`infrapulse-registro-${stamp}.csv`, logToCsv(visible), 'text/csv');
  };

  return (
    <>
      <PageHeader
        title="Registro de eventos"
        subtitle="Eventos de los servidores, del monitor de alertas y de las acciones del operador, del más reciente al más antiguo."
      />

      <div className="panel">
        <div className="log-toolbar">
          <fieldset className="segmented">
            <legend className="visually-hidden">Filtrar por nivel</legend>
            {LEVEL_OPTIONS.map(([value, label]) => (
              <label key={value} className={`segmented__option segmented__option--${value}`}>
                <input type="radio" name="level" value={value} checked={level === value} onChange={() => setLevel(value)} />
                <span>
                  {label} <span className="segmented__count num">{formatNumber(counts[value])}</span>
                </span>
              </label>
            ))}
          </fieldset>

          <label className="field field--search log-toolbar__search">
            <span className="visually-hidden">Buscar en el registro</span>
            <span className="input-icon">
              <Icon name="search" size={16} />
              <input
                type="search"
                className="input"
                placeholder="Texto, servidor u origen"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </span>
          </label>

          <div className="log-toolbar__actions">
            <button
              type="button"
              className="btn"
              aria-pressed={snapshot != null}
              onClick={() => setSnapshot(snapshot ? null : log)}
            >
              <Icon name={snapshot ? 'play' : 'pause'} size={14} />
              {snapshot ? 'Reanudar' : 'Pausar'}
            </button>
            <button type="button" className="btn" onClick={exportCsv} disabled={visible.length === 0}>
              <Icon name="download" size={14} />
              Exportar CSV
            </button>
          </div>
        </div>

        <p className="log-status" role="status">
          {snapshot ? (
            <>
              <strong>Flujo en pausa.</strong>{' '}
              {pendingWhilePaused > 0 ? `${plural(pendingWhilePaused, 'evento nuevo', 'eventos nuevos')} esperando.` : 'Sin eventos nuevos.'}
            </>
          ) : (
            <>Mostrando {plural(visible.length, 'evento', 'eventos')} · se actualiza en directo</>
          )}
        </p>

        {visible.length === 0 ? (
          <EmptyState icon="search" title="Ningún evento coincide con el filtro">
            Prueba con otro nivel o con un texto distinto.
          </EmptyState>
        ) : (
          <ol className="log">
            {visible.map((entry) => (
              <li key={entry.id} className={`log__row log__row--${entry.level}`}>
                <time className="log__time num" dateTime={new Date(entry.ts).toISOString()}>
                  {formatClock(entry.ts)}
                </time>
                <LevelBadge level={entry.level} />
                <span className="log__server num">
                  {entry.server ? <a href={routes.server(entry.server)}>{entry.server}</a> : 'sistema'}
                </span>
                <span className="log__source num">{entry.source}</span>
                <span className="log__message">{entry.message}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </>
  );
}

/** Cuántas entradas del registro en vivo son posteriores a la foto (ambas de más nueva a más antigua). */
function newerEntries(live: readonly LogEntry[], snapshot: readonly LogEntry[]): number {
  const newestSeen = snapshot[0]?.id ?? 0;
  return live.filter((entry) => entry.id > newestSeen).length;
}
