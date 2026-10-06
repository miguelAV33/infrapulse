/**
 * Rutas basadas en el hash (#/alertas). Funcionan desde una subcarpeta y
 * abriendo el index.html con doble clic (file://), porque el navegador
 * nunca pide al servidor la parte que va detrás de "#".
 */
export type Route =
  | { page: 'overview' }
  | { page: 'server'; name: string }
  | { page: 'alerts' }
  | { page: 'log' }
  | { page: 'settings' }
  | { page: 'notFound'; path: string };

export const routes = {
  overview: '#/',
  server: (name: string) => `#/servidor/${encodeURIComponent(name)}`,
  alerts: '#/alertas',
  log: '#/registro',
  settings: '#/ajustes',
} as const;

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, '').split('?')[0];
  const segments = path.split('/').filter(Boolean);

  if (segments.length === 0) return { page: 'overview' };
  const [first, second] = segments;

  if (segments.length === 1) {
    if (first === 'alertas') return { page: 'alerts' };
    if (first === 'registro') return { page: 'log' };
    if (first === 'ajustes') return { page: 'settings' };
  }
  if (segments.length === 2 && first === 'servidor') {
    try {
      return { page: 'server', name: decodeURIComponent(second) };
    } catch {
      // Codificación inválida en la URL: se trata como ruta inexistente.
    }
  }
  return { page: 'notFound', path: path || '/' };
}
