/**
 * Store mínimo (patrón "external store"): guarda un estado inmutable, lo
 * cambia con un reducer y avisa a los suscriptores. React se conecta con
 * `useSyncExternalStore`, así que no hace falta ninguna librería de estado.
 */
export interface Store<S, A> {
  getState(): S;
  dispatch(action: A): void;
  subscribe(listener: () => void): () => void;
}

export function createStore<S, A>(reducer: (state: S, action: A) => S, initialState: S): Store<S, A> {
  let state = initialState;
  const listeners = new Set<() => void>();

  return {
    getState: () => state,
    dispatch(action) {
      const next = reducer(state, action);
      if (Object.is(next, state)) return; // nada cambió: no se re-renderiza
      state = next;
      listeners.forEach((listener) => listener());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
