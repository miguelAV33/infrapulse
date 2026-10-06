import { useMemo, useState, type MouseEvent, type ReactNode } from 'react';
import { Sparkline } from '../components/charts/Sparkline';
import { Icon } from '../components/Icon';
import { StatusPill } from '../components/StatusPill';
import { EmptyState, PageHeader } from '../components/ui';
import { UsageBar } from '../components/UsageBar';
import { useSettings } from '../context/settings';
import { useSimulation } from '../context/simulation';
import { formatBitrate, formatDuration, formatPercent, NO_DATA, plural } from '../lib/format';
import { routes } from '../lib/routes';
import { ROLE_LABELS } from '../sim/fleet';
import { fleetSummary, fullestPartition, STATUS_LABELS, statusByServer } from '../sim/selectors';
import {
  DEFAULT_DIRECTION,
  EMPTY_FILTERS,
  filterServers,
  hasActiveFilters,
  sortServers,
  type ServerFilters,
  type SortKey,
  type SortState,
} from '../sim/serverQuery';
import type { Datacenter, Role, Server, ServerStatus, Thresholds } from '../sim/types';

const STATUS_OPTIONS: ServerStatus[] = ['ok', 'warning', 'critical', 'offline'];
const DATACENTERS: Datacenter[] = ['Madrid-DC1', 'Frankfurt-DC2'];
const SORT_LABELS: Record<SortKey, string> = {
  status: 'Estado',
  name: 'Nombre',
  cpu: 'CPU',
  ram: 'Memoria',
  disk: 'Disco',
  net: 'Tráfico de red',
};

export function OverviewPage() {
  const state = useSimulation();
  const { thresholds } = useSettings().settings;
  const [filters, setFilters] = useState<ServerFilters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<SortState>({ key: 'status', direction: 'asc' });

  const statuses = useMemo(() => statusByServer(state), [state]);
  const summary = useMemo(() => fleetSummary(state), [state]);
  const rows = useMemo(
    () => sortServers(filterServers(state.servers, filters, statuses), sort, statuses),
    [state.servers, filters, sort, statuses],
  );
  const roles = useMemo(() => [...new Set(state.servers.map((s) => s.role))], [state.servers]);

  const updateFilter = <K extends keyof ServerFilters>(key: K, value: ServerFilters[K]) =>
    setFilters((current) => ({ ...current, [key]: value }));

  const sortBy = (key: SortKey) =>
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: DEFAULT_DIRECTION[key] },
    );

  const offline = summary.total - summary.online;
  const totalAlerts = summary.alerts.critical + summary.alerts.warning;

  return (
    <>
      <PageHeader
        title="Resumen de la flota"
        subtitle={`${plural(summary.total, 'servidor', 'servidores')} en 2 centros de datos · Madrid y Fráncfort`}
      />

      <section className="kpis" aria-label="Indicadores principales">
        <Kpi label="Servidores en línea" tone={offline > 0 ? 'warning' : 'ok'}>
          <p className="kpi__value num">
            {summary.online}
            <span className="kpi__unit">/ {summary.total}</span>
          </p>
          <p className="kpi__meta">{offline > 0 ? `${offline} sin conexión` : 'Todos responden'}</p>
          <div className="fleet-strip" aria-hidden="true">
            {state.servers.map((server) => (
              <span
                key={server.name}
                className={`fleet-strip__cell fleet-strip__cell--${statuses[server.name]}`}
                title={`${server.name}: ${STATUS_LABELS[statuses[server.name]]}`}
              />
            ))}
          </div>
        </Kpi>

        <Kpi
          label="Alertas activas"
          tone={summary.alerts.critical > 0 ? 'critical' : summary.alerts.warning > 0 ? 'warning' : 'ok'}
          href={routes.alerts}
        >
          <p className="kpi__value num">{totalAlerts}</p>
          <p className="kpi__meta">
            <span className={summary.alerts.critical > 0 ? 'kpi__chip kpi__chip--critical' : 'kpi__chip'}>
              <span className="num">{summary.alerts.critical}</span> {summary.alerts.critical === 1 ? 'crítica' : 'críticas'}
            </span>
            <span className={summary.alerts.warning > 0 ? 'kpi__chip kpi__chip--warning' : 'kpi__chip'}>
              <span className="num">{summary.alerts.warning}</span> {summary.alerts.warning === 1 ? 'aviso' : 'avisos'}
            </span>
          </p>
          <p className="kpi__meta">{summary.alerts.unacknowledged} sin reconocer</p>
        </Kpi>

        <Kpi label="CPU media de la flota">
          <KpiValue text={formatPercent(summary.avgCpu)} />
          <p className="kpi__meta">
            {summary.busiest ? (
              <span>
                Más alta: <span className="num">{summary.busiest.name}</span> ({formatPercent(summary.busiest.cpu)})
              </span>
            ) : (
              'Sin servidores en línea'
            )}
          </p>
          <Sparkline values={summary.avgCpuHistory} max={100} label="Evolución de la CPU media" />
        </Kpi>

        <Kpi label="Tráfico de red agregado">
          <KpiValue text={formatBitrate(summary.netIn + summary.netOut)} />
          <p className="kpi__meta num">
            <span title="Entrada">↓ {formatBitrate(summary.netIn)}</span>
            <span title="Salida">↑ {formatBitrate(summary.netOut)}</span>
          </p>
          <Sparkline values={summary.netHistory} label="Evolución del tráfico agregado" tone="warm" />
        </Kpi>
      </section>

      <section className="panel fleet" aria-labelledby="fleet-title">
        <header className="panel__header">
          <h2 className="panel__title" id="fleet-title">
            Servidores
          </h2>
          <p className="panel__meta" aria-live="polite">
            Mostrando <span className="num">{rows.length}</span> de <span className="num">{summary.total}</span>
          </p>
        </header>

        <div className="filters" role="search" aria-label="Filtrar servidores">
          <label className="field field--search">
            <span className="field__label">Buscar</span>
            <span className="input-icon">
              <Icon name="search" size={16} />
              <input
                type="search"
                className="input"
                placeholder="Nombre o IP"
                value={filters.query}
                onChange={(e) => updateFilter('query', e.target.value)}
              />
            </span>
          </label>
          <label className="field">
            <span className="field__label">Estado</span>
            <select className="select" value={filters.status} onChange={(e) => updateFilter('status', e.target.value as ServerFilters['status'])}>
              <option value="all">Todos</option>
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field__label">Rol</span>
            <select className="select" value={filters.role} onChange={(e) => updateFilter('role', e.target.value as Role | 'all')}>
              <option value="all">Todos</option>
              {roles.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field__label">Centro de datos</span>
            <select
              className="select"
              value={filters.datacenter}
              onChange={(e) => updateFilter('datacenter', e.target.value as Datacenter | 'all')}
            >
              <option value="all">Todos</option>
              {DATACENTERS.map((dc) => (
                <option key={dc} value={dc}>
                  {dc}
                </option>
              ))}
            </select>
          </label>
          <div className="field field--sort">
            <label className="field__label" htmlFor="sort-key">
              Ordenar por
            </label>
            <div className="sort-control">
              <select
                id="sort-key"
                className="select"
                value={sort.key}
                onChange={(e) => {
                  const key = e.target.value as SortKey;
                  setSort({ key, direction: DEFAULT_DIRECTION[key] });
                }}
              >
                {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                  <option key={key} value={key}>
                    {SORT_LABELS[key]}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn--icon"
                onClick={() => setSort((s) => ({ ...s, direction: s.direction === 'asc' ? 'desc' : 'asc' }))}
                aria-label={sort.direction === 'asc' ? 'Orden ascendente; cambiar a descendente' : 'Orden descendente; cambiar a ascendente'}
              >
                <Icon name={sort.direction === 'asc' ? 'chevronUp' : 'chevronDown'} size={16} />
              </button>
            </div>
          </div>
          {hasActiveFilters(filters) && (
            <button type="button" className="btn btn--ghost filters__clear" onClick={() => setFilters(EMPTY_FILTERS)}>
              <Icon name="close" size={14} />
              Limpiar filtros
            </button>
          )}
        </div>

        {rows.length === 0 ? (
          <EmptyState icon="search" title="Ningún servidor coincide con los filtros">
            <button type="button" className="btn" onClick={() => setFilters(EMPTY_FILTERS)}>
              Limpiar filtros
            </button>
          </EmptyState>
        ) : (
          <>
            <ServerTable rows={rows} statuses={statuses} thresholds={thresholds} sort={sort} onSort={sortBy} />
            <ul className="server-cards" aria-label="Servidores">
              {rows.map((server) => (
                <ServerCard key={server.name} server={server} status={statuses[server.name]} thresholds={thresholds} />
              ))}
            </ul>
          </>
        )}
      </section>
    </>
  );
}

function Kpi({
  label,
  tone,
  href,
  children,
}: {
  label: string;
  tone?: 'ok' | 'warning' | 'critical';
  href?: string;
  children: ReactNode;
}) {
  return (
    <article className={`kpi${tone ? ` kpi--${tone}` : ''}`}>
      <h2 className="kpi__label">
        {href ? (
          <a href={href} className="kpi__link">
            {label}
          </a>
        ) : (
          label
        )}
      </h2>
      {children}
    </article>
  );
}

/** Separa el número de la unidad ("1,2 Gbit/s") para mostrar la unidad más pequeña. */
function KpiValue({ text }: { text: string }) {
  const [value, ...unit] = text.split('\u00a0');
  return (
    <p className="kpi__value num">
      {value}
      {unit.length > 0 && <span className="kpi__unit">{unit.join(' ')}</span>}
    </p>
  );
}

interface RowProps {
  server: Server;
  status: ServerStatus;
  thresholds: Thresholds;
}

function cpuSeries(server: Server) {
  return server.history.map((sample) => sample.cpu);
}

/** Tabla para escritorio; en pantallas estrechas se muestra la lista de tarjetas. */
function ServerTable({
  rows,
  statuses,
  thresholds,
  sort,
  onSort,
}: {
  rows: Server[];
  statuses: Record<string, ServerStatus>;
  thresholds: Thresholds;
  sort: SortState;
  onSort: (key: SortKey) => void;
}) {
  const header = (key: SortKey, label: string, className?: string) => {
    const active = sort.key === key;
    return (
      <th
        scope="col"
        className={className}
        aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined}
      >
        <button type="button" className={`th-sort${active ? ' th-sort--active' : ''}`} onClick={() => onSort(key)}>
          {label}
          <Icon name={active && sort.direction === 'asc' ? 'chevronUp' : 'chevronDown'} size={13} />
        </button>
      </th>
    );
  };

  const openServer = (event: MouseEvent<HTMLTableRowElement>, name: string) => {
    // La fila entera es clicable con el ratón; con teclado se usa el enlace del nombre.
    if ((event.target as HTMLElement).closest('a, button')) return;
    window.location.hash = routes.server(name);
  };

  return (
    <div className="table-wrap server-table">
      <table className="table">
        <thead>
          <tr>
            {header('name', 'Servidor')}
            {header('status', 'Estado')}
            <th scope="col">Rol</th>
            {header('cpu', 'CPU', 'col-metric')}
            {header('ram', 'Memoria', 'col-metric')}
            {header('disk', 'Disco', 'col-metric')}
            <th scope="col" className="col-spark">
              CPU · 2 min
            </th>
            {header('net', 'Red', 'col-net')}
            <th scope="col">En marcha</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((server) => {
            const online = server.reachability === 'up';
            const disk = fullestPartition(server);
            return (
              <tr key={server.name} className={`row row--${statuses[server.name]}`} onClick={(e) => openServer(e, server.name)}>
                <th scope="row">
                  <a className="server-link" href={routes.server(server.name)}>
                    {server.name}
                  </a>
                  <span className="cell-sub num">{server.ip}</span>
                </th>
                <td>
                  <StatusPill status={statuses[server.name]} />
                </td>
                <td>
                  {ROLE_LABELS[server.role]}
                  <span className="cell-sub">{server.datacenter}</span>
                </td>
                <td className="col-metric">
                  <UsageBar label={`CPU de ${server.name}`} value={online ? server.metrics.cpu : null} warning={thresholds.cpuWarning} critical={thresholds.cpuCritical} />
                </td>
                <td className="col-metric">
                  <UsageBar label={`Memoria de ${server.name}`} value={online ? server.metrics.ram : null} warning={thresholds.ramWarning} critical={thresholds.ramCritical} />
                </td>
                <td className="col-metric">
                  <UsageBar label={`Disco ${disk.mount} de ${server.name}`} value={disk.usedPct} warning={thresholds.diskWarning} critical={thresholds.diskCritical} />
                  <span className="cell-sub num">{disk.mount}</span>
                </td>
                <td className="col-spark">
                  <Sparkline values={cpuSeries(server)} max={100} label={`CPU de ${server.name} en los últimos minutos`} />
                </td>
                <td className="col-net num">
                  {online ? (
                    <>
                      <span>↓ {formatBitrate(server.metrics.netIn)}</span>
                      <span className="cell-sub">↑ {formatBitrate(server.metrics.netOut)}</span>
                    </>
                  ) : (
                    NO_DATA
                  )}
                </td>
                <td className="num">{server.reachability === 'rebooting' ? 'Reiniciando…' : formatDuration(server.uptimeSec)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ServerCard({ server, status, thresholds }: RowProps) {
  const online = server.reachability === 'up';
  const disk = fullestPartition(server);
  return (
    <li className={`server-card server-card--${status}`}>
      <div className="server-card__head">
        <a className="server-link server-card__name" href={routes.server(server.name)}>
          {server.name}
        </a>
        <StatusPill status={status} />
      </div>
      <p className="server-card__meta">
        {ROLE_LABELS[server.role]} · {server.datacenter} · <span className="num">{server.ip}</span>
      </p>
      <dl className="server-card__metrics">
        <div>
          <dt>CPU</dt>
          <dd>
            <UsageBar label={`CPU de ${server.name}`} value={online ? server.metrics.cpu : null} warning={thresholds.cpuWarning} critical={thresholds.cpuCritical} />
          </dd>
        </div>
        <div>
          <dt>RAM</dt>
          <dd>
            <UsageBar label={`Memoria de ${server.name}`} value={online ? server.metrics.ram : null} warning={thresholds.ramWarning} critical={thresholds.ramCritical} />
          </dd>
        </div>
        <div>
          <dt>Disco</dt>
          <dd>
            <UsageBar label={`Disco ${disk.mount} de ${server.name}`} value={disk.usedPct} warning={thresholds.diskWarning} critical={thresholds.diskCritical} />
          </dd>
        </div>
      </dl>
      <Sparkline values={cpuSeries(server)} max={100} label={`CPU de ${server.name} en los últimos minutos`} />
      <p className="server-card__foot num">
        <span>
          {online ? `↓ ${formatBitrate(server.metrics.netIn)} · ↑ ${formatBitrate(server.metrics.netOut)}` : 'Sin datos de red'}
        </span>
        <span>{server.reachability === 'rebooting' ? 'Reiniciando…' : `En marcha ${formatDuration(server.uptimeSec)}`}</span>
      </p>
    </li>
  );
}
