import { useRef, useState, type FormEvent } from 'react';
import { Icon } from '../components/Icon';
import { PageHeader, Panel } from '../components/ui';
import { useSettings } from '../context/settings';
import { useSimDispatch, useSimulation } from '../context/simulation';
import {
  DEFAULT_SETTINGS,
  INTERVAL_OPTIONS,
  resolveSeed,
  seedFromUrl,
  toDraft,
  validateDraft,
  type DraftErrors,
  type SettingsDraft,
} from '../sim/settings';

type DraftKey = keyof SettingsDraft;

export function SettingsPage() {
  const { settings, saveSettings } = useSettings();
  const { seed: currentSeed } = useSimulation();
  const dispatch = useSimDispatch();
  const formRef = useRef<HTMLFormElement>(null);

  const [draft, setDraft] = useState<SettingsDraft>(() => toDraft(settings));
  const [errors, setErrors] = useState<DraftErrors>({});
  const [message, setMessage] = useState('');
  const [resetMessage, setResetMessage] = useState('');

  const urlSeed = seedFromUrl(window.location.search);
  const saved = toDraft(settings);
  const dirty = (Object.keys(draft) as DraftKey[]).some((key) => draft[key] !== saved[key]);

  const update = (key: DraftKey, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setMessage('');
  };

  const restartSimulation = () => {
    const seed = resolveSeed(settings.seed, window.location.search);
    dispatch({ type: 'reset', seed, now: Date.now(), thresholds: settings.thresholds, intervalMs: settings.intervalMs });
    setResetMessage(`Simulación reiniciada con la semilla ${seed}.`);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const result = validateDraft(draft);
    if (!result.ok) {
      setErrors(result.errors);
      setMessage('Hay campos con errores; revisa los valores marcados.');
      // Llevamos el foco al primer campo con error.
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    setErrors({});
    const seedChanged = result.settings.seed !== settings.seed;
    saveSettings(result.settings);
    setDraft(toDraft(result.settings));
    if (seedChanged && result.settings.seed != null && urlSeed == null) {
      const seed = result.settings.seed;
      dispatch({ type: 'reset', seed, now: Date.now(), thresholds: result.settings.thresholds, intervalMs: result.settings.intervalMs });
      setMessage(`Ajustes guardados. Simulación reiniciada con la semilla ${seed}.`);
    } else {
      setMessage('Ajustes guardados en este navegador.');
    }
  };

  const field = (key: DraftKey) => ({
    id: `f-${key}`,
    value: draft[key],
    error: errors[key],
    onChange: (value: string) => update(key, value),
  });

  return (
    <>
      <PageHeader
        title="Ajustes"
        subtitle="Se guardan en el almacenamiento local de este navegador (localStorage); no se envían a ningún servidor."
      />

      <form ref={formRef} className="settings" onSubmit={handleSubmit} noValidate>
        <Panel title="Simulación">
          <div className="form-grid">
            <div className="field">
              <label className="field__label" htmlFor="f-intervalMs">
                Intervalo de actualización
              </label>
              <select
                id="f-intervalMs"
                className="select"
                value={draft.intervalMs}
                onChange={(e) => update('intervalMs', e.target.value)}
                aria-invalid={errors.intervalMs ? true : undefined}
              >
                {INTERVAL_OPTIONS.map((ms) => (
                  <option key={ms} value={ms}>
                    Cada {ms / 1000} s
                  </option>
                ))}
              </select>
              <p className="field__hint">Cada cuánto avanza un tick de la simulación.</p>
            </div>

            <TextField
              {...field('seed')}
              label="Semilla"
              placeholder="Vacía: aleatoria según la hora"
              hint={`Misma semilla, misma simulación. En uso ahora: ${currentSeed}.`}
            />
          </div>
          {urlSeed != null && (
            <p className="banner banner--info">
              <Icon name="info" size={16} />
              <span>
                La URL incluye <code>?seed={urlSeed}</code>: tiene prioridad sobre la semilla guardada.
              </span>
            </p>
          )}
        </Panel>

        <Panel title="Umbrales de alerta">
          <div className="threshold-grid">
            <ThresholdRow name="CPU" warning={field('cpuWarning')} critical={field('cpuCritical')} />
            <ThresholdRow name="Memoria" warning={field('ramWarning')} critical={field('ramCritical')} />
            <ThresholdRow name="Disco" warning={field('diskWarning')} critical={field('diskCritical')} />
          </div>
          <div className="form-grid">
            <TextField
              {...field('consecutiveTicks')}
              label="Ticks consecutivos (CPU y memoria)"
              hint="Cuántos ticks seguidos por encima del umbral hacen falta para alertar. Evita falsos positivos por picos puntuales."
              inputMode="numeric"
            />
          </div>
        </Panel>

        <div className="form-actions">
          <button type="submit" className="btn btn--primary" disabled={!dirty}>
            <Icon name="check" size={15} />
            Guardar cambios
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              setDraft(toDraft(DEFAULT_SETTINGS));
              setErrors({});
              setMessage('Valores por defecto cargados. Pulsa «Guardar cambios» para aplicarlos.');
            }}
          >
            Restaurar valores por defecto
          </button>
          <p
            className={`form-actions__status${Object.keys(errors).length > 0 ? ' form-actions__status--error' : ''}`}
            role="status"
          >
            {message}
          </p>
        </div>
      </form>

      <Panel title="Reiniciar la simulación" className="panel--danger">
        <p className="panel__text">
          Vuelve a generar la flota, las alertas y el registro desde cero con la semilla configurada
          {settings.seed == null && urlSeed == null ? ' (al estar vacía, se usará una nueva basada en la hora)' : ''}.
        </p>
        <div className="form-actions">
          <button type="button" className="btn btn--danger" onClick={restartSimulation}>
            <Icon name="restart" size={15} />
            Reiniciar simulación
          </button>
          <p className="form-actions__status" role="status">
            {resetMessage}
          </p>
        </div>
      </Panel>
    </>
  );
}

interface FieldProps {
  id: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
}

function TextField({
  id,
  value,
  error,
  onChange,
  label,
  hint,
  placeholder,
  suffix,
  inputMode = 'numeric',
}: FieldProps & {
  label: string;
  hint?: string;
  placeholder?: string;
  suffix?: string;
  inputMode?: 'numeric' | 'text';
}) {
  const describedBy = [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className={`field${error ? ' field--invalid' : ''}`}>
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <span className={suffix ? 'input-suffix' : undefined}>
        <input
          id={id}
          className="input num"
          type="text"
          inputMode={inputMode}
          autoComplete="off"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
        />
        {suffix && <span className="input-suffix__text" aria-hidden="true">{suffix}</span>}
      </span>
      {error && (
        <p className="field__error" id={`${id}-error`}>
          {error}
        </p>
      )}
      {hint && (
        <p className="field__hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
    </div>
  );
}

function ThresholdRow({ name, warning, critical }: { name: string; warning: FieldProps; critical: FieldProps }) {
  return (
    <fieldset className="threshold-row">
      <legend className="threshold-row__legend">{name}</legend>
      <TextField {...warning} label="Aviso" suffix="%" />
      <TextField {...critical} label="Crítico" suffix="%" />
    </fieldset>
  );
}
