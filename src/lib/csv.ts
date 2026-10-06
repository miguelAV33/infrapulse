/**
 * Exportación a CSV pensada para abrirse en Excel con configuración española:
 * separador ";" (la coma es el separador decimal) y BOM UTF-8 para los acentos.
 */
export const CSV_SEPARATOR = ';';

/** Escapa un campo: lo entrecomilla si contiene separador, comillas o saltos de línea. */
export function escapeCsvField(value: string, separator = CSV_SEPARATOR): string {
  const needsQuotes =
    value.includes(separator) || value.includes('"') || value.includes('\n') || value.includes('\r');
  return needsQuotes ? `"${value.replaceAll('"', '""')}"` : value;
}

export function toCsv(rows: readonly (readonly string[])[], separator = CSV_SEPARATOR): string {
  return rows.map((row) => row.map((field) => escapeCsvField(field, separator)).join(separator)).join('\r\n');
}

/** Descarga un texto como fichero sin pasar por ningún servidor. */
export function downloadTextFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob(['\ufeff', content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  // Se libera un poco después para no cortar la descarga en algunos navegadores.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
