import { formatPercent } from '../lib/format';

interface UsageBarProps {
  label: string;
  value: number | null;
  warning: number;
  critical: number;
  /** Muestra el porcentaje a la derecha de la barra. */
  showValue?: boolean;
}

/** Barra de uso con color según umbrales. Usa role="meter" para lectores de pantalla. */
export function UsageBar({ label, value, warning, critical, showValue = true }: UsageBarProps) {
  const level = value == null ? 'none' : value > critical ? 'critical' : value > warning ? 'warning' : 'ok';
  const width = value == null ? 0 : Math.min(100, Math.max(0, value));

  return (
    <div className="usage">
      <div
        className="usage__track"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value == null ? undefined : Math.round(value)}
        aria-valuetext={value == null ? 'Sin datos' : formatPercent(value)}
      >
        <div className={`usage__fill usage__fill--${level}`} style={{ width: `${width}%` }} />
      </div>
      {showValue && <span className="usage__value num">{formatPercent(value)}</span>}
    </div>
  );
}
