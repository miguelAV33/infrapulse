import { createContext, use, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useInterval } from '../hooks/useInterval';
import { resolveSeed } from '../sim/settings';
import { createInitialState, simulationReducer, type SimAction } from '../sim/simulation';
import { createStore, type Store } from '../sim/store';
import type { SimState } from '../sim/types';
import { useSettings } from './settings';

type SimulationStore = Store<SimState, SimAction>;

const SimulationContext = createContext<SimulationStore | null>(null);

/**
 * Crea el store de la simulación una sola vez y lo hace avanzar con un
 * intervalo. Los componentes leen el estado con `useSimulation()`.
 */
export function SimulationProvider({ children }: { children: ReactNode }) {
  const { settings } = useSettings();
  const [store] = useState(() =>
    createStore(
      simulationReducer,
      createInitialState({
        seed: resolveSeed(settings.seed, window.location.search),
        now: Date.now(),
        thresholds: settings.thresholds,
        intervalMs: settings.intervalMs,
      }),
    ),
  );

  const paused = useSyncExternalStore(store.subscribe, () => store.getState().paused);

  useInterval(
    () => store.dispatch({ type: 'tick', now: Date.now(), thresholds: settings.thresholds }),
    paused ? null : settings.intervalMs,
  );

  return <SimulationContext value={store}>{children}</SimulationContext>;
}

function useSimulationStore(): SimulationStore {
  const store = use(SimulationContext);
  if (!store) throw new Error('Este hook debe usarse dentro de <SimulationProvider>');
  return store;
}

/** Estado completo de la simulación; el componente se re-renderiza en cada tick. */
export function useSimulation(): SimState {
  const store = useSimulationStore();
  return useSyncExternalStore(store.subscribe, store.getState);
}

export function useSimDispatch(): (action: SimAction) => void {
  return useSimulationStore().dispatch;
}
