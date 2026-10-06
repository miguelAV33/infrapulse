import { SEVERITY_LABELS } from '../sim/alerts';
import { STATUS_LABELS } from '../sim/selectors';
import type { LogLevel, ServerStatus, ServiceStatus, Severity } from '../sim/types';

/** Píldora de estado: el color siempre va acompañado de texto (no solo color). */
export function StatusPill({ status, label }: { status: ServerStatus; label?: string }) {
  return (
    <span className={`pill pill--${status}`}>
      <span className="pill__dot" aria-hidden="true" />
      {label ?? STATUS_LABELS[status]}
    </span>
  );
}

export function SeverityPill({ severity }: { severity: Severity }) {
  return <StatusPill status={severity} label={SEVERITY_LABELS[severity]} />;
}

const LEVEL_LABELS: Record<LogLevel, string> = { info: 'Info', warning: 'Aviso', critical: 'Crítico' };

export function LevelBadge({ level }: { level: LogLevel }) {
  return <span className={`level level--${level}`}>{LEVEL_LABELS[level]}</span>;
}

const SERVICE_LABELS: Record<ServiceStatus | 'unknown', [string, ServerStatus]> = {
  running: ['Activo', 'ok'],
  restarting: ['Reiniciando', 'warning'],
  failed: ['Detenido', 'critical'],
  unknown: ['Desconocido', 'offline'],
};

export function ServiceStatusPill({ status }: { status: ServiceStatus | 'unknown' }) {
  const [label, tone] = SERVICE_LABELS[status];
  return <StatusPill status={tone} label={label} />;
}
