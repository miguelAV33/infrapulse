import { useEffect, useRef } from 'react';

/**
 * setInterval declarativo. Con `delayMs = null` se detiene (pausa).
 * El callback se guarda en una ref para usar siempre la última versión
 * sin reiniciar el temporizador en cada render.
 */
export function useInterval(callback: () => void, delayMs: number | null): void {
  const savedCallback = useRef(callback);

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (delayMs == null) return;
    const id = window.setInterval(() => savedCallback.current(), delayMs);
    return () => window.clearInterval(id);
  }, [delayMs]);
}
