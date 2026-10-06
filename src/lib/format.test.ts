import { describe, expect, it } from 'vitest';
import { escapeCsvField, toCsv } from './csv';
import {
  formatAgo,
  formatBitrate,
  formatCapacity,
  formatDuration,
  formatNumber,
  formatPercent,
  plural,
} from './format';

// Los formateadores usan espacios de no separación; para comparar los pasamos a espacios normales.
const NBSP = String.fromCharCode(0xa0);
const plain = (text: string) => text.replaceAll(NBSP, ' ');

describe('formatNumber / formatPercent', () => {
  it('usa la coma decimal y el punto de miles de es-ES', () => {
    expect(formatNumber(12345)).toBe('12.345');
    expect(formatNumber(3.14159, 2)).toBe('3,14');
    expect(formatNumber(0.5, 1)).toBe('0,5');
  });

  it('formatea porcentajes con espacio irrompible antes de %', () => {
    expect(formatPercent(45.26)).toBe(`45${NBSP}%`);
    expect(plain(formatPercent(45.26, 1))).toBe('45,3 %');
  });

  it('muestra un guion cuando no hay dato', () => {
    expect(formatPercent(null)).toBe('—');
    expect(formatBitrate(null)).toBe('—');
  });
});

describe('formatBitrate', () => {
  it('elige la unidad adecuada', () => {
    expect(plain(formatBitrate(0.5))).toBe('500 kbit/s');
    expect(plain(formatBitrate(5.25))).toBe('5,3 Mbit/s');
    expect(plain(formatBitrate(120.4))).toBe('120 Mbit/s');
    expect(plain(formatBitrate(1240))).toBe('1,2 Gbit/s');
  });
});

describe('formatCapacity', () => {
  it('usa GB por debajo de 1000 y TB por encima', () => {
    expect(plain(formatCapacity(4.25))).toBe('4,3 GB');
    expect(plain(formatCapacity(512))).toBe('512 GB');
    expect(plain(formatCapacity(1500))).toBe('1,5 TB');
    expect(plain(formatCapacity(8000))).toBe('8 TB');
  });
});

describe('formatDuration', () => {
  it.each([
    [0, '0 s'],
    [45, '45 s'],
    [59.9, '59 s'],
    [180, '3 min'],
    [192, '3 min 12 s'],
    [7_500, '2 h 5 min'],
    [3 * 86_400 + 4 * 3_600 + 59, '3 d 4 h'],
    [-10, '0 s'],
  ])('%s s → "%s"', (seconds, expected) => {
    expect(plain(formatDuration(seconds))).toBe(expected);
  });
});

describe('formatAgo', () => {
  it('dice "ahora mismo" para menos de 2 segundos', () => {
    expect(formatAgo(1_000, 2_500)).toBe('ahora mismo');
  });

  it('usa formatDuration para el resto', () => {
    expect(plain(formatAgo(0, 125_000))).toBe('hace 2 min 5 s');
  });
});

describe('plural', () => {
  it('concuerda en número', () => {
    expect(plural(1, 'alerta', 'alertas')).toBe('1 alerta');
    expect(plural(0, 'alerta', 'alertas')).toBe('0 alertas');
    expect(plural(3, 'alerta', 'alertas')).toBe('3 alertas');
  });
});

describe('CSV', () => {
  it('entrecomilla solo cuando hace falta', () => {
    expect(escapeCsvField('nginx')).toBe('nginx');
    expect(escapeCsvField('a;b')).toBe('"a;b"');
    expect(escapeCsvField('dice "hola"')).toBe('"dice ""hola"""');
    expect(escapeCsvField('dos\nlíneas')).toBe('"dos\nlíneas"');
  });

  it('une filas con CRLF y columnas con punto y coma', () => {
    expect(toCsv([['a', 'b'], ['1', '2;3']])).toBe('a;b\r\n1;"2;3"');
  });
});
