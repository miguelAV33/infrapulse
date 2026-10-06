import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, resolveSeed, sanitizeSettings, toDraft, validateDraft } from './settings';

describe('validateDraft', () => {
  it('acepta los valores por defecto', () => {
    expect(validateDraft(toDraft(DEFAULT_SETTINGS))).toEqual({ ok: true, settings: DEFAULT_SETTINGS });
  });

  it('convierte una semilla vacía en null y una numérica en número', () => {
    const draft = toDraft(DEFAULT_SETTINGS);
    const empty = validateDraft({ ...draft, seed: '  ' });
    const fixed = validateDraft({ ...draft, seed: '123' });
    expect(empty.ok && empty.settings.seed).toBeNull();
    expect(fixed.ok && fixed.settings.seed).toBe(123);
  });

  it('exige que el aviso sea menor que el crítico', () => {
    const result = validateDraft({ ...toDraft(DEFAULT_SETTINGS), cpuWarning: '90', cpuCritical: '90' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.cpuWarning).toMatch(/menor que el crítico/);
  });

  it('rechaza valores fuera de rango, decimales y texto', () => {
    const result = validateDraft({
      ...toDraft(DEFAULT_SETTINGS),
      ramWarning: '0',
      diskCritical: '101',
      consecutiveTicks: '2.5',
      seed: 'abc',
      intervalMs: '1234',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Object.keys(result.errors).sort()).toEqual(
        ['consecutiveTicks', 'diskCritical', 'intervalMs', 'ramWarning', 'seed'].sort(),
      );
    }
  });
});

describe('sanitizeSettings', () => {
  it('vuelve a los valores por defecto si lo guardado no es válido', () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings('texto')).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings({ intervalMs: 5000, thresholds: { cpuWarning: 95, cpuCritical: 90 } })).toEqual(
      DEFAULT_SETTINGS,
    );
  });

  it('completa campos que falten con los valores por defecto', () => {
    expect(sanitizeSettings({ intervalMs: 5000, seed: 7 })).toEqual({ ...DEFAULT_SETTINGS, intervalMs: 5000, seed: 7 });
  });
});

describe('resolveSeed', () => {
  it('prioriza ?seed= en la URL, luego los ajustes y por último la hora', () => {
    expect(resolveSeed(10, '?seed=99', 5)).toBe(99);
    expect(resolveSeed(10, '?seed=no-valida', 5)).toBe(10);
    expect(resolveSeed(null, '', 5)).toBe(5);
  });
});
