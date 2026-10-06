import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { SettingsProvider } from './context/settings';
import { SimulationProvider } from './context/simulation';
import './styles/global.css';

const container = document.getElementById('root');
if (!container) throw new Error('No se encontró el elemento #root');

createRoot(container).render(
  <StrictMode>
    <SettingsProvider>
      <SimulationProvider>
        <App />
      </SimulationProvider>
    </SettingsProvider>
  </StrictMode>,
);
