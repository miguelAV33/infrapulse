/**
 * Acceso a localStorage que nunca rompe la aplicación: en modo privado,
 * con cuota llena o con el almacenamiento bloqueado, simplemente no persiste.
 */
export function readJson(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    return raw == null ? undefined : (JSON.parse(raw) as unknown);
  } catch {
    return undefined;
  }
}

export function writeJson(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
