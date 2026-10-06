import { describe, expect, it } from 'vitest';
import { createRng, parseSeed, timeBasedSeed } from './prng';

const sequence = (seed: number, length: number) => {
  const rng = createRng(seed);
  return Array.from({ length }, () => rng.next());
};

describe('createRng (mulberry32)', () => {
  it('produce la misma secuencia con la misma semilla', () => {
    expect(sequence(42, 100)).toEqual(sequence(42, 100));
  });

  it('produce secuencias distintas con semillas distintas', () => {
    expect(sequence(1, 20)).not.toEqual(sequence(2, 20));
  });

  it('genera valores en [0, 1)', () => {
    for (const value of sequence(123, 10_000)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('puede continuar la secuencia desde su estado guardado', () => {
    const original = createRng(7);
    original.next();
    original.next();
    const resumed = createRng(original.state);
    expect(resumed.next()).toBe(original.next());
    expect(resumed.next()).toBe(original.next());
  });

  it('respeta los límites de int, range y noise', () => {
    const rng = createRng(99);
    for (let i = 0; i < 5_000; i++) {
      const n = rng.int(3, 6);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(6);
      const r = rng.range(-2, 2);
      expect(r).toBeGreaterThanOrEqual(-2);
      expect(r).toBeLessThan(2);
      expect(Math.abs(rng.noise())).toBeLessThanOrEqual(3);
    }
  });

  it('pick devuelve siempre un elemento de la lista', () => {
    const rng = createRng(5);
    const items = ['a', 'b', 'c'] as const;
    for (let i = 0; i < 200; i++) expect(items).toContain(rng.pick(items));
  });
});

describe('parseSeed', () => {
  it('acepta enteros de 32 bits sin signo', () => {
    expect(parseSeed('0')).toBe(0);
    expect(parseSeed(' 42 ')).toBe(42);
    expect(parseSeed('4294967295')).toBe(4294967295);
  });

  it('rechaza valores no válidos', () => {
    expect(parseSeed(null)).toBeNull();
    expect(parseSeed('')).toBeNull();
    expect(parseSeed('-1')).toBeNull();
    expect(parseSeed('1.5')).toBeNull();
    expect(parseSeed('abc')).toBeNull();
    expect(parseSeed('4294967296')).toBeNull();
  });
});

describe('timeBasedSeed', () => {
  it('devuelve un entero de 32 bits derivado de la hora', () => {
    const seed = timeBasedSeed(1_760_000_000_123);
    expect(Number.isInteger(seed)).toBe(true);
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThanOrEqual(0xffffffff);
  });
});
