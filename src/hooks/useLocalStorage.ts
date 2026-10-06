import { useEffect, useState } from 'react';
import { readJson, writeJson } from '../lib/storage';

/**
 * Estado de React sincronizado con localStorage.
 * `sanitize` valida lo leído: nunca nos fiamos de lo que haya guardado.
 */
export function useLocalStorage<T>(key: string, fallback: T, sanitize: (raw: unknown) => T) {
  const [value, setValue] = useState<T>(() => {
    const raw = readJson(key);
    return raw === undefined ? fallback : sanitize(raw);
  });

  useEffect(() => {
    writeJson(key, value);
  }, [key, value]);

  return [value, setValue] as const;
}
