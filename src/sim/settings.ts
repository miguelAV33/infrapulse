import { MAX_SEED, parseSeed, timeBasedSeed } from '../lib/prng';
import type { Thresholds } from './types';

/** Ajustes del usuario: se guardan en localStorage y se validan al cargar y al guardar. */
export interface Settings {
  intervalMs: number;
  /** null = semilla nueva basada en la hora en cada arranque. */
  seed: number | null;
  thresholds: Thresholds;
}

export const INTERVAL_OPTIONS = [1000, 2000, 3000, 5000, 10000] as const;

export const DEFAULT_THRESHOLDS: Thresholds = {
  cpuWarning: 80,
  cpuCritical: 90,
  ramWarning: 85,
  ramCritical: 95,
  diskWarning: 85,
  diskCritical: 95,
  consecutiveTicks: 3,
};

export const DEFAULT_SETTINGS: Settings = {
  intervalMs: 2000,
  seed: null,
  thresholds: DEFAULT_THRESHOLDS,
};

/** Valores tal cual vienen del formulario (texto). */
export type SettingsDraft = Record<'intervalMs' | 'seed' | keyof Thresholds, string>;
export type DraftErrors = Partial<Record<keyof SettingsDraft, string>>;

export function toDraft(settings: Settings): SettingsDraft {
  const t = settings.thresholds;
  return {
    intervalMs: String(settings.intervalMs),
    seed: settings.seed == null ? '' : String(settings.seed),
    cpuWarning: String(t.cpuWarning),
    cpuCritical: String(t.cpuCritical),
    ramWarning: String(t.ramWarning),
    ramCritical: String(t.ramCritical),
    diskWarning: String(t.diskWarning),
    diskCritical: String(t.diskCritical),
    consecutiveTicks: String(t.consecutiveTicks),
  };
}

function parseIntInRange(text: string, min: number, max: number): number | null {
  if (!/^\d+$/.test(text.trim())) return null;
  const value = Number(text);
  return value >= min && value <= max ? value : null;
}

const THRESHOLD_PAIRS = [
  ['cpuWarning', 'cpuCritical'],
  ['ramWarning', 'ramCritical'],
  ['diskWarning', 'diskCritical'],
] as const;

export type ValidationResult =
  | { ok: true; settings: Settings }
  | { ok: false; errors: DraftErrors };

/** Valida el borrador del formulario y, si todo es correcto, lo convierte en Settings. */
export function validateDraft(draft: SettingsDraft): ValidationResult {
  const errors: DraftErrors = {};

  const intervalMs = Number(draft.intervalMs);
  if (!INTERVAL_OPTIONS.some((option) => option === intervalMs)) {
    errors.intervalMs = 'Elige uno de los intervalos disponibles.';
  }

  let seed: number | null = null;
  if (draft.seed.trim() !== '') {
    seed = parseSeed(draft.seed);
    if (seed == null) {
      errors.seed = `Debe ser un número entero entre 0 y ${MAX_SEED.toLocaleString('es-ES')}, o quedar vacío.`;
    }
  }

  const thresholds = { ...DEFAULT_THRESHOLDS };
  for (const [warningKey, criticalKey] of THRESHOLD_PAIRS) {
    const warning = parseIntInRange(draft[warningKey], 1, 99);
    const critical = parseIntInRange(draft[criticalKey], 2, 100);
    if (warning == null) errors[warningKey] = 'Entero entre 1 y 99.';
    if (critical == null) errors[criticalKey] = 'Entero entre 2 y 100.';
    if (warning != null && critical != null && warning >= critical) {
      errors[warningKey] = 'El aviso debe ser menor que el crítico.';
    }
    if (warning != null) thresholds[warningKey] = warning;
    if (critical != null) thresholds[criticalKey] = critical;
  }

  const ticks = parseIntInRange(draft.consecutiveTicks, 1, 10);
  if (ticks == null) errors.consecutiveTicks = 'Entero entre 1 y 10.';
  else thresholds.consecutiveTicks = ticks;

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, settings: { intervalMs, seed, thresholds } };
}

/**
 * Comprueba lo que venga de localStorage (puede estar corrupto o ser de una
 * versión antigua). Si algo no cuadra, se vuelve a los valores por defecto.
 */
export function sanitizeSettings(raw: unknown): Settings {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_SETTINGS;
  const candidate = raw as Partial<Settings>;
  const thresholds = (candidate.thresholds ?? {}) as Partial<Record<keyof Thresholds, unknown>>;
  const text = (value: unknown, fallback: number) =>
    typeof value === 'number' || typeof value === 'string' ? String(value) : String(fallback);

  const result = validateDraft({
    intervalMs: text(candidate.intervalMs, DEFAULT_SETTINGS.intervalMs),
    seed: candidate.seed == null ? '' : text(candidate.seed, 0),
    cpuWarning: text(thresholds.cpuWarning, DEFAULT_THRESHOLDS.cpuWarning),
    cpuCritical: text(thresholds.cpuCritical, DEFAULT_THRESHOLDS.cpuCritical),
    ramWarning: text(thresholds.ramWarning, DEFAULT_THRESHOLDS.ramWarning),
    ramCritical: text(thresholds.ramCritical, DEFAULT_THRESHOLDS.ramCritical),
    diskWarning: text(thresholds.diskWarning, DEFAULT_THRESHOLDS.diskWarning),
    diskCritical: text(thresholds.diskCritical, DEFAULT_THRESHOLDS.diskCritical),
    consecutiveTicks: text(thresholds.consecutiveTicks, DEFAULT_THRESHOLDS.consecutiveTicks),
  });
  return result.ok ? result.settings : DEFAULT_SETTINGS;
}

/** Semilla del parámetro `?seed=` de la URL, si es válida. */
export function seedFromUrl(search: string): number | null {
  return parseSeed(new URLSearchParams(search).get('seed'));
}

/** Prioridad: `?seed=` en la URL → semilla de ajustes → basada en la hora. */
export function resolveSeed(settingsSeed: number | null, search: string, now = Date.now()): number {
  return seedFromUrl(search) ?? settingsSeed ?? timeBasedSeed(now);
}
