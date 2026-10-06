import { createContext, use, useMemo, type ReactNode } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { DEFAULT_SETTINGS, sanitizeSettings, type Settings } from '../sim/settings';

const STORAGE_KEY = 'infrapulse:ajustes';

interface SettingsContextValue {
  settings: Settings;
  saveSettings: (settings: Settings) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, saveSettings] = useLocalStorage(STORAGE_KEY, DEFAULT_SETTINGS, sanitizeSettings);
  const value = useMemo(() => ({ settings, saveSettings }), [settings, saveSettings]);
  return <SettingsContext value={value}>{children}</SettingsContext>;
}

export function useSettings(): SettingsContextValue {
  const value = use(SettingsContext);
  if (!value) throw new Error('useSettings debe usarse dentro de <SettingsProvider>');
  return value;
}
