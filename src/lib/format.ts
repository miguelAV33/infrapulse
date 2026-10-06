/**
 * Formateadores de números, tamaños, tasas y duraciones en español (es-ES).
 * Los Intl.* se crean una sola vez: construirlos en cada render es caro.
 */
const LOCALE = 'es-ES';
const NBSP = '\u00a0';

const integer = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat(LOCALE, {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const upToOneDecimal = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 });
const twoDecimals = new Intl.NumberFormat(LOCALE, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const clock = new Intl.DateTimeFormat(LOCALE, {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});
const dateTime = new Intl.DateTimeFormat(LOCALE, {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** Guion largo para valores sin dato (servidor sin conexión, etc.). */
export const NO_DATA = '—';

export function formatNumber(value: number, decimals: 0 | 1 | 2 = 0): string {
  const formatter = decimals === 0 ? integer : decimals === 1 ? oneDecimal : twoDecimals;
  return formatter.format(value);
}

/** 45.26 → "45 %" (con espacio de no separación, como marca la RAE). */
export function formatPercent(value: number | null, decimals: 0 | 1 = 0): string {
  if (value == null) return NO_DATA;
  return `${formatNumber(value, decimals)}${NBSP}%`;
}

/** Tasa de red recibida en Mbit/s → "850 kbit/s", "120 Mbit/s", "1,2 Gbit/s". */
export function formatBitrate(mbps: number | null): string {
  if (mbps == null) return NO_DATA;
  if (mbps < 1) return `${formatNumber(mbps * 1000)}${NBSP}kbit/s`;
  if (mbps < 1000) return `${formatNumber(mbps, mbps < 10 ? 1 : 0)}${NBSP}Mbit/s`;
  return `${formatNumber(mbps / 1000, 1)}${NBSP}Gbit/s`;
}

/** Capacidad recibida en GB (base decimal, como los fabricantes) → "512 GB", "1,5 TB". */
export function formatCapacity(gb: number): string {
  if (gb < 10) return `${upToOneDecimal.format(gb)}${NBSP}GB`;
  if (gb < 1000) return `${formatNumber(gb)}${NBSP}GB`;
  return `${upToOneDecimal.format(gb / 1000)}${NBSP}TB`;
}

/**
 * Duración legible en segundos → "45 s", "3 min 12 s", "2 h 5 min", "3 d 4 h".
 * Se muestran como mucho dos unidades: es lo que un operador necesita de un vistazo.
 */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(s / 86_400);
  const hours = Math.floor((s % 86_400) / 3_600);
  const minutes = Math.floor((s % 3_600) / 60);
  const seconds = s % 60;

  const join = (big: string, small: number, unit: string) =>
    small > 0 ? `${big} ${small}${NBSP}${unit}` : big;

  if (days > 0) return join(`${days}${NBSP}d`, hours, 'h');
  if (hours > 0) return join(`${hours}${NBSP}h`, minutes, 'min');
  if (minutes > 0) return join(`${minutes}${NBSP}min`, seconds, 's');
  return `${seconds}${NBSP}s`;
}

/** "hace 3 min", "hace 12 s"; "ahora mismo" si han pasado menos de 2 s. */
export function formatAgo(fromMs: number, nowMs: number): string {
  const seconds = Math.max(0, (nowMs - fromMs) / 1000);
  if (seconds < 2) return 'ahora mismo';
  return `hace ${formatDuration(seconds)}`;
}

/** 14:03:22 */
export function formatClock(ms: number): string {
  return clock.format(ms);
}

/** 06/10, 14:03:22 */
export function formatDateTime(ms: number): string {
  return dateTime.format(ms);
}

/** Pluralización mínima: plural(3, 'alerta', 'alertas') → "3 alertas". */
export function plural(count: number, singular: string, pluralForm: string): string {
  return `${formatNumber(count)} ${count === 1 ? singular : pluralForm}`;
}
