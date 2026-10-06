import { useMemo } from 'react';
import { Icon } from '../components/Icon';
import { SeverityPill } from '../components/StatusPill';
import { EmptyState, PageHeader, Panel } from '../components/ui';
import { useSettings } from '../context/settings';
import { useSimDispatch, useSimulation } from '../context/simulation';
import { formatAgo, formatClock, formatDateTime, formatDuration, formatPercent, plural } from '../lib/format';
import { routes } from '../lib/routes';
import { alertDurationSec, RULE_LABELS } from '../sim/alerts';
import type { Alert } from '../sim/types';

/** Primero lo que requiere atención: sin reconocer, crítico y más antiguo. */
function byUrgency(a: Alert, b: Alert): number {
  const ackDiff = Number(a.acknowledgedAt != null) - Number(b.acknowledgedAt != null);
  if (ackDiff !== 0) return ackDiff;
  const sevDiff = Number(b.severity === 'critical') - Number(a.severity === 'critical');
  if (sevDiff !== 0) return sevDiff;
  return a.firedAt - b.firedAt;
}

export function AlertsPage() {
  const { activeAlerts, resolvedAlerts, now } = useSimulation();
  const dispatch = useSimDispatch();
  const { thresholds: t } = useSettings().settings;

  const sorted = useMemo(() => [...activeAlerts].sort(byUrgency), [activeAlerts]);
  const critical = activeAlerts.filter((a) => a.severity === 'critical').length;
  const unacknowledged = activeAlerts.filter((a) => a.acknowledgedAt == null).length;

  return (
    <>
      <PageHeader
        title="Alertas"
        subtitle={
          activeAlerts.length === 0
            ? 'Ninguna regla se está incumpliendo ahora mismo.'
            : `${plural(activeAlerts.length, 'activa', 'activas')} · ${plural(critical, 'crítica', 'críticas')} · ${unacknowledged} sin reconocer`
        }
      />

      <div className="alerts-layout">
        <Panel title="Alertas activas" meta={<span className="num">{activeAlerts.length}</span>} className="alerts-active">
          {sorted.length === 0 ? (
            <EmptyState icon="check" tone="ok" title="Todo en orden">
              Todos los servidores están dentro de los umbrales configurados.
            </EmptyState>
          ) : (
            <ul className="alert-list">
              {sorted.map((alert) => (
                <li key={alert.id} className={`alert-item alert-item--${alert.severity}${alert.acknowledgedAt != null ? ' alert-item--ack' : ''}`}>
                  <div className="alert-item__main">
                    <div className="alert-item__head">
                      <SeverityPill severity={alert.severity} />
                      <span className="alert-item__rule">{RULE_LABELS[alert.rule]}</span>
                      <a className="server-link num" href={routes.server(alert.server)}>
                        {alert.server}
                      </a>
                    </div>
                    <p className="alert-item__message">{alert.message}</p>
                    <p className="alert-item__meta">
                      Activa desde las <span className="num">{formatClock(alert.firedAt)}</span> · hace{' '}
                      <span className="num">{formatDuration(alertDurationSec(alert, now))}</span>
                      {alert.peakSeverity === 'critical' && alert.severity === 'warning' && ' · llegó a crítico'}
                    </p>
                  </div>
                  <div className="alert-item__action">
                    {alert.acknowledgedAt != null ? (
                      <span className="ack-note">
                        <Icon name="check" size={14} />
                        Reconocida {formatAgo(alert.acknowledgedAt, now)}
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="btn"
                        onClick={() => dispatch({ type: 'acknowledgeAlert', id: alert.id, now: Date.now() })}
                        aria-label={`Reconocer alerta: ${RULE_LABELS[alert.rule]} en ${alert.server}`}
                      >
                        <Icon name="check" size={14} />
                        Reconocer
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Reglas en vigor" meta={<a href={routes.settings}>Editar umbrales</a>} className="alerts-rules">
          <dl className="rules">
            <div className="rule">
              <dt>{RULE_LABELS.cpu}</dt>
              <dd>
                Aviso &gt; {formatPercent(t.cpuWarning)}, crítico &gt; {formatPercent(t.cpuCritical)} durante{' '}
                {plural(t.consecutiveTicks, 'tick', 'ticks')} seguidos
              </dd>
            </div>
            <div className="rule">
              <dt>{RULE_LABELS.ram}</dt>
              <dd>
                Aviso &gt; {formatPercent(t.ramWarning)}, crítico &gt; {formatPercent(t.ramCritical)} durante{' '}
                {plural(t.consecutiveTicks, 'tick', 'ticks')} seguidos
              </dd>
            </div>
            <div className="rule">
              <dt>{RULE_LABELS.disk}</dt>
              <dd>
                Aviso &gt; {formatPercent(t.diskWarning)}, crítico &gt; {formatPercent(t.diskCritical)} en cualquier partición
              </dd>
            </div>
            <div className="rule">
              <dt>{RULE_LABELS.service}</dt>
              <dd>Crítico en cuanto un servicio deja de estar activo</dd>
            </div>
            <div className="rule">
              <dt>{RULE_LABELS.unreachable}</dt>
              <dd>Crítico si no responde a ping ni a SSH</dd>
            </div>
          </dl>
          <p className="panel__note">
            Si una alerta reconocida sube a crítico, vuelve a quedar pendiente de reconocer. Mientras un servidor no
            responde, sus demás alertas se congelan en lugar de darse por resueltas.
          </p>
        </Panel>
      </div>

      <Panel title="Historial de alertas resueltas" meta={plural(resolvedAlerts.length, 'alerta', 'alertas')}>
        {resolvedAlerts.length === 0 ? (
          <EmptyState title="Aún no se ha resuelto ninguna alerta">
            Cuando una condición deje de cumplirse, la alerta aparecerá aquí con su duración.
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table table--compact table--stack">
              <thead>
                <tr>
                  <th scope="col">Severidad máx.</th>
                  <th scope="col">Regla</th>
                  <th scope="col">Servidor</th>
                  <th scope="col">Detalle</th>
                  <th scope="col">Inicio</th>
                  <th scope="col">Fin</th>
                  <th scope="col">Duración</th>
                </tr>
              </thead>
              <tbody>
                {resolvedAlerts.map((alert) => (
                  <tr key={alert.id}>
                    <td data-label="Severidad máx.">
                      <SeverityPill severity={alert.peakSeverity} />
                    </td>
                    <td data-label="Regla">{RULE_LABELS[alert.rule]}</td>
                    <td data-label="Servidor">
                      <a className="server-link num" href={routes.server(alert.server)}>
                        {alert.server}
                      </a>
                    </td>
                    <td data-label="Detalle" className="num">
                      {alert.target ?? '—'}
                    </td>
                    <td data-label="Inicio" className="num">
                      {formatDateTime(alert.firedAt)}
                    </td>
                    <td data-label="Fin" className="num">
                      {alert.resolvedAt != null ? formatDateTime(alert.resolvedAt) : '—'}
                    </td>
                    <td data-label="Duración" className="num">
                      {formatDuration(alertDurationSec(alert, now))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
