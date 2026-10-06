/**
 * Geometría de las gráficas (funciones puras, sin React).
 * Los valores null (servidor sin conexión) cortan la línea en tramos.
 */
export type SeriesValues = readonly (number | null)[];

/** Tramos continuos de una serie: [{ start, values }]. */
export function continuousRuns(values: SeriesValues): { start: number; values: number[] }[] {
  const runs: { start: number; values: number[] }[] = [];
  let current: { start: number; values: number[] } | null = null;
  values.forEach((value, index) => {
    if (value == null) {
      current = null;
      return;
    }
    if (!current) {
      current = { start: index, values: [] };
      runs.push(current);
    }
    current.values.push(value);
  });
  return runs;
}

const round = (n: number) => Math.round(n * 100) / 100;

/** Atributo `d` de un <path> de línea. */
export function linePath(values: SeriesValues, x: (index: number) => number, y: (value: number) => number): string {
  return continuousRuns(values)
    .map(({ start, values: run }) => {
      const points = run.map((value, i) => `${round(x(start + i))},${round(y(value))}`);
      // Un punto aislado se dibuja como un segmento mínimo para que se vea.
      if (points.length === 1) points.push(`${round(x(start) + 0.5)},${round(y(run[0]))}`);
      return `M${points.join('L')}`;
    })
    .join('');
}

/** Atributo `d` del área rellena bajo la línea, cerrada contra `baseline`. */
export function areaPath(
  values: SeriesValues,
  x: (index: number) => number,
  y: (value: number) => number,
  baseline: number,
): string {
  return continuousRuns(values)
    .filter((run) => run.values.length > 1)
    .map(({ start, values: run }) => {
      const first = round(x(start));
      const last = round(x(start + run.length - 1));
      const top = run.map((value, i) => `${round(x(start + i))},${round(y(value))}`).join('L');
      return `M${first},${baseline}L${top}L${last},${baseline}Z`;
    })
    .join('');
}

/** Máximo "redondo" para el eje Y: 1, 2, 2,5 o 5 × 10ⁿ por encima del valor. */
export function niceMax(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((m) => m * magnitude >= value) ?? 10;
  return step * magnitude;
}
