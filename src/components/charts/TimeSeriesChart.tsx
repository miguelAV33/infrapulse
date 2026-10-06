import { useId, useState, type PointerEvent } from 'react';
import { useElementWidth } from '../../hooks/useElementWidth';
import { formatClock } from '../../lib/format';
import { areaPath, linePath, niceMax, type SeriesValues } from './paths';

export interface ChartSeries {
  id: string;
  label: string;
  values: SeriesValues;
  tone: 'accent' | 'warm';
  /** Rellena el área bajo la línea (útil con una sola serie). */
  area?: boolean;
}

export interface ChartThreshold {
  value: number;
  tone: 'warning' | 'critical';
}

interface TimeSeriesChartProps {
  title: string;
  series: ChartSeries[];
  /** Marca de tiempo de cada muestra (mismo largo que las series). */
  times: readonly number[];
  /** Máximo fijo del eje Y (100 para %); si se omite se calcula. */
  max?: number;
  format: (value: number | null) => string;
  /** Formato de las etiquetas del eje Y (más corto que `format` si hace falta). */
  axisFormat?: (value: number) => string;
  /** Unidad que se muestra junto al título cuando el eje no la incluye. */
  unit?: string;
  thresholds?: ChartThreshold[];
  height?: number;
  emptyMessage?: string;
}

const PAD = { top: 10, right: 10, bottom: 26, left: 48 };
const GRID_STEPS = [0, 0.25, 0.5, 0.75, 1];

/**
 * Gráfica de líneas/área en SVG hecha a mano: rejilla, umbrales, varias
 * series y lectura del valor al pasar el ratón (o el dedo) por encima.
 */
export function TimeSeriesChart({
  title,
  series,
  times,
  max,
  format,
  axisFormat = format,
  unit,
  thresholds = [],
  height = 190,
  emptyMessage = 'Sin datos disponibles',
}: TimeSeriesChartProps) {
  const [containerRef, width] = useElementWidth<HTMLDivElement>();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const gradientPrefix = useId();

  const count = times.length;
  const present = series.flatMap((s) => s.values.filter((v): v is number => v != null));
  const hasData = present.length > 0;
  const top = max ?? niceMax(Math.max(0, ...present) * 1.1);

  const plotWidth = Math.max(0, width - PAD.left - PAD.right);
  const plotHeight = height - PAD.top - PAD.bottom;
  const baseline = PAD.top + plotHeight;
  const x = (i: number) => PAD.left + (count <= 1 ? plotWidth : (i / (count - 1)) * plotWidth);
  const y = (v: number) => baseline - (Math.min(Math.max(v, 0), top) / top) * plotHeight;

  const index = hoverIndex ?? count - 1;
  const xLabels = count > 1 ? [0, Math.floor((count - 1) / 2), count - 1] : [];

  const summary = series
    .map((s) => {
      const values = s.values.filter((v): v is number => v != null);
      const peak = values.length ? Math.max(...values) : null;
      return `${s.label}: actual ${format(s.values[count - 1] ?? null)}, máximo ${format(peak)}`;
    })
    .join('; ');

  function handlePointerMove(event: PointerEvent<SVGRectElement>) {
    if (count < 2) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    setHoverIndex(Math.min(count - 1, Math.max(0, Math.round(ratio * (count - 1)))));
  }

  return (
    <figure className="chart">
      <figcaption className="chart__header">
        <span className="chart__title">
          {title}
          {unit && <span className="chart__unit"> · {unit}</span>}
        </span>
        <span className="chart__time num">{hoverIndex == null || count === 0 ? 'ahora' : formatClock(times[index])}</span>
        <span className="chart__legend">
          {series.map((s) => (
            <span key={s.id} className={`chart__key chart__key--${s.tone}`}>
              <span className="chart__swatch" aria-hidden="true" />
              {s.label}
              <strong className="num">{format(s.values[index] ?? null)}</strong>
            </span>
          ))}
        </span>
      </figcaption>

      <div ref={containerRef} className="chart__canvas" style={{ height }}>
        {width > 0 && (
          <svg width={width} height={height} role="img" aria-label={`${title}. ${summary}`}>
            <defs>
              {series.map((s) => (
                <linearGradient key={s.id} id={`${gradientPrefix}${s.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" className={`chart__stop--${s.tone}`} stopOpacity="0.3" />
                  <stop offset="100%" className={`chart__stop--${s.tone}`} stopOpacity="0" />
                </linearGradient>
              ))}
            </defs>

            {GRID_STEPS.map((step) => {
              const value = step * top;
              return (
                <g key={step} className="chart__grid">
                  <line x1={PAD.left} x2={PAD.left + plotWidth} y1={y(value)} y2={y(value)} />
                  <text x={PAD.left - 8} y={y(value)} dy="0.32em" textAnchor="end">
                    {axisFormat(value)}
                  </text>
                </g>
              );
            })}

            {thresholds.map((t) => (
              <line
                key={t.tone}
                className={`chart__threshold chart__threshold--${t.tone}`}
                x1={PAD.left}
                x2={PAD.left + plotWidth}
                y1={y(t.value)}
                y2={y(t.value)}
              />
            ))}

            {series.map((s) => (
              <g key={s.id}>
                {s.area && <path d={areaPath(s.values, x, y, baseline)} fill={`url(#${gradientPrefix}${s.id})`} />}
                <path className={`chart__line chart__line--${s.tone}`} d={linePath(s.values, x, y)} />
              </g>
            ))}

            {xLabels.map((i, n) => (
              <text
                key={i}
                className="chart__axis-label"
                x={x(i)}
                y={height - 6}
                textAnchor={n === 0 ? 'start' : n === xLabels.length - 1 ? 'end' : 'middle'}
              >
                {formatClock(times[i])}
              </text>
            ))}

            {hoverIndex != null && (
              <g className="chart__cursor">
                <line x1={x(index)} x2={x(index)} y1={PAD.top} y2={baseline} />
                {series.map((s) => {
                  const value = s.values[index];
                  return value == null ? null : (
                    <circle key={s.id} className={`chart__dot chart__dot--${s.tone}`} cx={x(index)} cy={y(value)} r={3.5} />
                  );
                })}
              </g>
            )}

            <rect
              className="chart__hit"
              x={PAD.left}
              y={PAD.top}
              width={plotWidth}
              height={plotHeight}
              onPointerMove={handlePointerMove}
              onPointerLeave={() => setHoverIndex(null)}
            />
          </svg>
        )}
        {!hasData && <p className="chart__empty">{emptyMessage}</p>}
      </div>
    </figure>
  );
}
