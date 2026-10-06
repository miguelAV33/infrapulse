import { useSettings } from '../context/settings';
import { useSimDispatch, useSimulation } from '../context/simulation';
import { formatNumber } from '../lib/format';
import { Icon } from './Icon';

/**
 * Franja con el aviso de datos simulados (siempre visible) y los controles
 * de la simulación: estado, tick actual, semilla y pausa/reanudar.
 */
export function SimBar() {
  const { tick, seed, paused } = useSimulation();
  const dispatch = useSimDispatch();
  const { settings } = useSettings();

  return (
    <div className="simbar">
      <div className="simbar__inner">
        <p className="simbar__notice">
          <Icon name="info" size={15} />
          <span>Datos simulados en el navegador — demo de interfaz</span>
        </p>
        <div className="simbar__controls">
          <span className={`live${paused ? ' live--paused' : ''}`}>
            <span className="live__dot" aria-hidden="true" />
            {paused ? 'En pausa' : 'En directo'}
          </span>
          <span className="simbar__meta num" title="Número de actualizaciones de la simulación">
            tick {formatNumber(tick)}
          </span>
          <span className="simbar__meta simbar__meta--wide num" title="Semilla del generador pseudoaleatorio">
            semilla {seed}
          </span>
          <span className="simbar__meta simbar__meta--wide num">cada {formatNumber(settings.intervalMs / 1000)} s</span>
          <button
            type="button"
            className="btn btn--small"
            onClick={() => dispatch({ type: 'setPaused', paused: !paused })}
            aria-pressed={paused}
          >
            <Icon name={paused ? 'play' : 'pause'} size={14} />
            {paused ? 'Reanudar' : 'Pausar'}
          </button>
        </div>
      </div>
    </div>
  );
}
