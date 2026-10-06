import { useState } from 'react';
import { TimeSeriesChart } from '../components/charts/TimeSeriesChart';
import { Icon } from '../components/Icon';
import { LevelBadge, ServiceStatusPill, SeverityPill, StatusPill } from '../components/StatusPill';
import { EmptyState, PageHeader, Panel } from '../components/ui';
import { UsageBar } from '../components/UsageBar';
import { useSettings } from '../context/settings';
import { useSimDispatch, useSimulation } from '../context/simulation';
import {
  formatAgo,
  formatBitrate,
  formatCapacity,
  formatClock,
  formatDuration,
  formatNumber,
  formatPercent,
} from '../lib/format';
import { routes } from '../lib/routes';
import { alertDurationSec, RULE_LABELS } from '../sim/alerts';
import { ROLE_LABELS } from '../sim/fleet';
import { serverStatus } from '../sim/selectors';
import type { Server } from '../sim/types';

const RECENT_EVENTS = 12;

export function ServerPage({ name }: { name: string }) {
  const state = useSimulation();
  const dispatch = useSimDispatch();
  const { thresholds } = useSettings().settings;
  const [confirmingReboot, setConfirmingReboot] = useState(false);

  const server = state.servers.find((s) => s.name === name);
  if (!server) {
    return (
      <>
        <PageHeader title="Servidor no encontrado" />
        <EmptyState icon="server" title={`No hay ningún servidor llamado «${name}»`}>
          <a className="btn" href={routes.overview}>
            <Icon name="arrowLeft" size={14} /> Volver al resumen
          </a>
        </EmptyState>
      </>
    );
  }

  const status = serverStatus(server, state.activeAlerts);
  const alerts = state.activeAlerts.filter((a) => a.server === name);
  const events = state.log.filter((e) => e.server === name).slice(0, RECENT_EVENTS);
  const times = server.history.map((sample) => sample.t);
  const unreachableSince = alerts.find((a) => a.rule === 'unreachable')?.firedAt;
  const [load1, load5, load15] = server.metrics.load;

  const reboot = () => {
    dispatch({ type: 'rebootServer', server: name, now: Date.now() });
    setConfirmingReboot(false);
  };

  return (
    <>
      <nav className="breadcrumb" aria-label="Ruta de navegación">
        <a href={routes.overview}>Resumen</a>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{server.name}</span>
      </nav>

      <PageHeader
        title={
          <>
            <span className="num">{server.name}</span> <StatusPill status={status} />
          </>
        }
        subtitle={server.description}
        actions={
          confirmingReboot ? (
            <div className="confirm" role="group" aria-label="Confirmar reinicio">
              <span className="confirm__text">¿Reiniciar {server.name}? (simulado)</span>
              <button type="button" className="btn btn--danger" onClick={reboot}>
                Confirmar
              </button>
              <button type="button" className="btn btn--ghost" onClick={() => setConfirmingReboot(false)}>
                Cancelar
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn"
              onClick={() => setConfirmingReboot(true)}
              disabled={server.reachability === 'rebooting'}
            >
              <Icon name="power" size={15} />
              {server.reachability === 'down' ? 'Forzar reinicio (IPMI)' : 'Reiniciar servidor'}
            </button>
          )
        }
      />

      {server.reachability === 'down' && (
        <p className="banner banner--critical" role="status">
          <Icon name="alert" size={16} />
          <span>
            Sin respuesta {unreachableSince ? formatAgo(unreachableSince, state.now) : ''}. Se muestran los últimos
            valores conocidos; las gráficas tienen un hueco mientras no hay datos.
          </span>
        </p>
      )}
      {server.reachability === 'rebooting' && (
        <p className="banner banner--warning" role="status">
          <Icon name="restart" size={16} />
          <span>Reinicio simulado en curso: el servidor volverá en unos segundos.</span>
        </p>
      )}

      <dl className="meta-grid">
        <Meta label="Rol" value={ROLE_LABELS[server.role]} />
        <Meta label="Sistema operativo" value={server.os} />
        <Meta label="Centro de datos" value={server.datacenter} />
        <Meta label="IP privada" value={server.ip} mono />
        <Meta label="CPU" value={`${server.cores} núcleos`} />
        <Meta label="Memoria" value={formatCapacity(server.ramGb)} />
        <Meta label="En marcha" value={server.reachability === 'rebooting' ? 'Reiniciando…' : formatDuration(server.uptimeSec)} mono />
        <Meta
          label="Carga media (1 · 5 · 15 min)"
          value={`${formatNumber(load1, 2)} · ${formatNumber(load5, 2)} · ${formatNumber(load15, 2)}`}
          hint={`${formatPercent((load1 / server.cores) * 100)} de ${server.cores} núcleos`}
          mono
        />
      </dl>

      <div className="charts-grid">
        <section className="panel" aria-label="Gráfica de CPU">
          <TimeSeriesChart
            title="CPU"
            series={[{ id: 'cpu', label: 'Uso', tone: 'accent', area: true, values: server.history.map((s) => s.cpu) }]}
            times={times}
            max={100}
            format={(v) => formatPercent(v)}
            thresholds={[
              { value: thresholds.cpuWarning, tone: 'warning' },
              { value: thresholds.cpuCritical, tone: 'critical' },
            ]}
            emptyMessage="Sin datos: el servidor no responde"
          />
        </section>
        <section className="panel" aria-label="Gráfica de memoria">
          <TimeSeriesChart
            title="Memoria"
            series={[{ id: 'ram', label: 'Uso', tone: 'accent', area: true, values: server.history.map((s) => s.ram) }]}
            times={times}
            max={100}
            format={(v) => formatPercent(v)}
            thresholds={[
              { value: thresholds.ramWarning, tone: 'warning' },
              { value: thresholds.ramCritical, tone: 'critical' },
            ]}
            emptyMessage="Sin datos: el servidor no responde"
          />
        </section>
        <section className="panel" aria-label="Gráfica de red">
          <TimeSeriesChart
            title="Red"
            series={[
              { id: 'in', label: 'Entrada', tone: 'accent', area: true, values: server.history.map((s) => s.netIn) },
              { id: 'out', label: 'Salida', tone: 'warm', values: server.history.map((s) => s.netOut) },
            ]}
            times={times}
            format={formatBitrate}
            axisFormat={(v) => formatNumber(v)}
            unit="Mbit/s"
            emptyMessage="Sin datos: el servidor no responde"
          />
        </section>
      </div>
      <p className="chart-note">
        Últimas {server.history.length} muestras. Las líneas discontinuas marcan los umbrales de aviso y crítico; pasa el
        cursor por una gráfica para ver valores anteriores.
      </p>

      <div className="detail-grid">
        <Panel title="Particiones" meta={`${server.partitions.length} montadas`}>
          <ul className="partitions">
            {server.partitions.map((p) => (
              <li key={p.mount} className="partition">
                <div className="partition__head">
                  <span className="num partition__mount">{p.mount}</span>
                  <span className="partition__size">
                    {formatCapacity(((100 - p.usedPct) / 100) * p.sizeGb)} libres de {formatCapacity(p.sizeGb)}
                  </span>
                </div>
                <UsageBar
                  label={`Uso de ${p.mount}`}
                  value={p.usedPct}
                  warning={thresholds.diskWarning}
                  critical={thresholds.diskCritical}
                />
              </li>
            ))}
          </ul>
        </Panel>

        <ServicesPanel server={server} onRestart={(service) => dispatch({ type: 'restartService', server: name, service, now: Date.now() })} />

        <Panel title="Alertas activas" meta={<a href={routes.alerts}>Ver todas</a>}>
          {alerts.length === 0 ? (
            <EmptyState icon="check" tone="ok" title="Sin alertas activas en este servidor" />
          ) : (
            <ul className="mini-alerts">
              {alerts.map((alert) => (
                <li key={alert.id} className={`mini-alert mini-alert--${alert.severity}`}>
                  <SeverityPill severity={alert.severity} />
                  <div>
                    <p className="mini-alert__title">
                      {RULE_LABELS[alert.rule]}
                      {alert.acknowledgedAt != null && <span className="tag">Reconocida</span>}
                    </p>
                    <p className="mini-alert__text">{alert.message}</p>
                    <p className="mini-alert__meta">
                      Activa desde hace <span className="num">{formatDuration(alertDurationSec(alert, state.now))}</span>
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Eventos recientes" meta={<a href={routes.log}>Registro completo</a>}>
          {events.length === 0 ? (
            <EmptyState title="Todavía no hay eventos de este servidor" />
          ) : (
            <ol className="event-list">
              {events.map((event) => (
                <li key={event.id} className="event">
                  <time className="event__time num" dateTime={new Date(event.ts).toISOString()}>
                    {formatClock(event.ts)}
                  </time>
                  <LevelBadge level={event.level} />
                  <p className="event__text">
                    <span className="event__source">{event.source}</span> {event.message}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>
    </>
  );
}

function Meta({ label, value, hint, mono }: { label: string; value: string; hint?: string; mono?: boolean }) {
  return (
    <div className="meta">
      <dt>{label}</dt>
      <dd className={mono ? 'num' : undefined}>
        {value}
        {hint && <span className="meta__hint">{hint}</span>}
      </dd>
    </div>
  );
}

function ServicesPanel({ server, onRestart }: { server: Server; onRestart: (service: string) => void }) {
  const online = server.reachability === 'up';
  const failed = server.services.filter((s) => s.status === 'failed').length;
  return (
    <Panel title="Servicios" meta={online ? (failed > 0 ? `${failed} detenido${failed > 1 ? 's' : ''}` : 'Todos activos') : 'Estado desconocido'}>
      <ul className="services">
        {server.services.map((service) => (
          <li key={service.name} className="service">
            <div className="service__name">
              <span className="num">{service.name}</span>
              <span className="service__port num">{service.port ? `:${service.port}` : 'sin puerto'}</span>
            </div>
            <ServiceStatusPill status={online ? service.status : 'unknown'} />
            <button
              type="button"
              className="btn btn--small"
              onClick={() => onRestart(service.name)}
              disabled={!online || service.status === 'restarting'}
              aria-label={`Reiniciar ${service.name} (simulado)`}
            >
              <Icon name="restart" size={14} />
              Reiniciar
            </button>
          </li>
        ))}
      </ul>
      <p className="panel__note">Los reinicios son simulados: solo cambian la simulación y dejan constancia en el registro.</p>
    </Panel>
  );
}
