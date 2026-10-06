import { useId } from 'react';
import { areaPath, linePath, niceMax, type SeriesValues } from './paths';

interface SparklineProps {
  values: SeriesValues;
  /** Máximo fijo (100 para porcentajes) o automático si se omite. */
  max?: number;
  label: string;
  tone?: 'accent' | 'warm';
}

const WIDTH = 120;
const HEIGHT = 32;

/**
 * Mini-gráfica sin ejes. Usa viewBox fijo + preserveAspectRatio="none" para
 * estirarse al ancho disponible; `non-scaling-stroke` mantiene el grosor.
 */
export function Sparkline({ values, max, label, tone = 'accent' }: SparklineProps) {
  const gradientId = useId();
  const top = max ?? niceMax(Math.max(0, ...values.filter((v): v is number => v != null)));
  const x = (i: number) => (values.length <= 1 ? WIDTH : (i / (values.length - 1)) * WIDTH);
  const y = (v: number) => HEIGHT - 1 - (Math.min(v, top) / top) * (HEIGHT - 2);

  return (
    <svg
      className={`sparkline sparkline--${tone}`}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath(values, x, y, HEIGHT)} fill={`url(#${gradientId})`} />
      <path
        d={linePath(values, x, y)}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
