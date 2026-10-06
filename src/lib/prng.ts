/**
 * Generador pseudoaleatorio con semilla (algoritmo mulberry32).
 *
 * Con la misma semilla produce siempre la misma secuencia, así que la
 * simulación es reproducible (`?seed=42`) y se puede testear.
 * Todo su estado es un único entero de 32 bits: lo guardamos dentro del
 * estado de la simulación para que el reducer siga siendo una función pura.
 */
export interface Rng {
  /** Número en [0, 1). */
  next(): number;
  /** Número real en [min, max). */
  range(min: number, max: number): number;
  /** Entero en [min, max], ambos incluidos. */
  int(min: number, max: number): number;
  /** Devuelve true con probabilidad `p`. */
  chance(p: number): boolean;
  /** Elemento aleatorio de una lista no vacía. */
  pick<T>(items: readonly T[]): T;
  /** Ruido aproximadamente normal (media 0, desviación 1) acotado a [-3, 3]. */
  noise(): number;
  /** Estado interno actual, para poder continuar la secuencia más tarde. */
  readonly state: number;
}

export const MAX_SEED = 0xffffffff;

export function createRng(seed: number): Rng {
  let a = seed >>> 0;

  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    range: (min, max) => min + next() * (max - min),
    int: (min, max) => Math.floor(min + next() * (max - min + 1)),
    chance: (p) => next() < p,
    pick: (items) => items[Math.floor(next() * items.length)],
    // Suma de tres uniformes: barata, con forma de campana y sin colas infinitas.
    noise: () => (next() + next() + next() - 1.5) * 2,
    get state() {
      return a;
    },
  };
}

/** Interpreta una semilla escrita por el usuario. Devuelve null si no es válida. */
export function parseSeed(input: string | null | undefined): number | null {
  if (input == null) return null;
  const text = input.trim();
  if (!/^\d{1,10}$/.test(text)) return null;
  const value = Number(text);
  return value <= MAX_SEED ? value : null;
}

/** Semilla basada en la hora actual (comportamiento por defecto). */
export function timeBasedSeed(now: number = Date.now()): number {
  return now % (MAX_SEED + 1);
}
