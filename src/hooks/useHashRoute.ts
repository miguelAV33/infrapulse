import { useMemo, useSyncExternalStore } from 'react';
import { parseRoute, type Route } from '../lib/routes';

function subscribe(onChange: () => void) {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

const getHash = () => window.location.hash;

/** Router mínimo: la URL es la fuente de verdad y React se suscribe a sus cambios. */
export function useHashRoute(): Route {
  const hash = useSyncExternalStore(subscribe, getHash);
  return useMemo(() => parseRoute(hash), [hash]);
}
