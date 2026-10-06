import { useEffect, useRef, type MouseEvent } from 'react';
import { SimBar } from './components/SimBar';
import { TopBar } from './components/TopBar';
import { EmptyState, PageHeader } from './components/ui';
import { useSimulation } from './context/simulation';
import { useHashRoute } from './hooks/useHashRoute';
import { plural } from './lib/format';
import { routes, type Route } from './lib/routes';
import { AlertsPage } from './pages/AlertsPage';
import { LogPage } from './pages/LogPage';
import { OverviewPage } from './pages/OverviewPage';
import { ServerPage } from './pages/ServerPage';
import { SettingsPage } from './pages/SettingsPage';

function pageTitle(route: Route): string {
  switch (route.page) {
    case 'overview':
      return 'Resumen';
    case 'server':
      return route.name;
    case 'alerts':
      return 'Alertas';
    case 'log':
      return 'Registro';
    case 'settings':
      return 'Ajustes';
    case 'notFound':
      return 'Página no encontrada';
  }
}

function renderPage(route: Route) {
  switch (route.page) {
    case 'overview':
      return <OverviewPage />;
    case 'server':
      // key: al pasar de un servidor a otro se reinicia el estado local de la página.
      return <ServerPage key={route.name} name={route.name} />;
    case 'alerts':
      return <AlertsPage />;
    case 'log':
      return <LogPage />;
    case 'settings':
      return <SettingsPage />;
    case 'notFound':
      return (
        <>
          <PageHeader title="Página no encontrada" />
          <EmptyState title={`La ruta «${route.path}» no existe`}>
            <a className="btn" href={routes.overview}>
              Ir al resumen
            </a>
          </EmptyState>
        </>
      );
  }
}

export function App() {
  const route = useHashRoute();
  const { activeAlerts } = useSimulation();
  const mainRef = useRef<HTMLElement>(null);
  const isFirstRender = useRef(true);

  const critical = activeAlerts.filter((a) => a.severity === 'critical').length;
  const pending = activeAlerts.filter((a) => a.acknowledgedAt == null).length;

  useEffect(() => {
    document.title = `${pageTitle(route)} · InfraPulse`;
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    // Al cambiar de página: arriba del todo y foco en el título (lectores de pantalla).
    window.scrollTo(0, 0);
    mainRef.current?.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
  }, [route]);

  const skipToContent = (event: MouseEvent<HTMLAnchorElement>) => {
    // Con rutas por hash, un enlace "#contenido" cambiaría de página: movemos el foco a mano.
    event.preventDefault();
    mainRef.current?.focus();
  };

  return (
    <div className="app">
      <a className="skip-link" href="#contenido" onClick={skipToContent}>
        Saltar al contenido
      </a>
      <div className="masthead">
        <TopBar route={route} pendingAlerts={pending} hasCritical={critical > 0} />
        <SimBar />
      </div>
      <main id="contenido" ref={mainRef} className="main" tabIndex={-1}>
        {renderPage(route)}
      </main>
      <footer className="footer">
        <p>
          InfraPulse · proyecto de portfolio de Miguel Ángel Alonso Valhondo. Servidores, métricas y acciones son
          simulados en el navegador.
        </p>
      </footer>
      {/* Región viva: anuncia cuántas alertas críticas hay cuando cambia el número. */}
      <p className="visually-hidden" aria-live="polite" aria-atomic="true">
        {critical === 0 ? 'Sin alertas críticas activas' : plural(critical, 'alerta crítica activa', 'alertas críticas activas')}
      </p>
    </div>
  );
}
