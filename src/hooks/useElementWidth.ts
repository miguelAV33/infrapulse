import { useLayoutEffect, useRef, useState } from 'react';

/**
 * Ancho de un elemento en píxeles, actualizado con ResizeObserver.
 * Las gráficas lo usan para dibujar en coordenadas reales y que el texto
 * del SVG no se deforme al cambiar el tamaño de la ventana.
 */
export function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    setWidth(element.clientWidth);
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, width] as const;
}
