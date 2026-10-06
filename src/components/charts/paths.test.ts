import { describe, expect, it } from 'vitest';
import { areaPath, continuousRuns, linePath, niceMax } from './paths';

const x = (i: number) => i * 10;
const y = (v: number) => 100 - v;

describe('continuousRuns', () => {
  it('parte la serie en tramos separados por null', () => {
    expect(continuousRuns([1, 2, null, null, 5, 6, 7, null])).toEqual([
      { start: 0, values: [1, 2] },
      { start: 4, values: [5, 6, 7] },
    ]);
    expect(continuousRuns([null, null])).toEqual([]);
  });
});

describe('linePath', () => {
  it('dibuja una línea continua', () => {
    expect(linePath([10, 20, 30], x, y)).toBe('M0,90L10,80L20,70');
  });

  it('empieza un subtrazo nuevo tras cada hueco', () => {
    const d = linePath([10, null, 30, 40], x, y);
    expect(d.match(/M/g)).toHaveLength(2);
    expect(d).toBe('M0,90L0.5,90M20,70L30,60');
  });
});

describe('areaPath', () => {
  it('cierra el área contra la línea base e ignora puntos aislados', () => {
    expect(areaPath([10, 20], x, y, 100)).toBe('M0,100L0,90L10,80L10,100Z');
    expect(areaPath([10, null, 5], x, y, 100)).toBe('');
  });
});

describe('niceMax', () => {
  it.each([
    [0, 1],
    [0.7, 1],
    [1.3, 2],
    [2.2, 2.5],
    [37, 50],
    [180, 200],
    [740, 1000],
  ])('%s → %s', (value, expected) => {
    expect(niceMax(value)).toBe(expected);
  });
});
