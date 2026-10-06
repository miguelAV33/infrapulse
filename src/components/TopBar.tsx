import type { Route } from '../lib/routes';
import { routes } from '../lib/routes';
import { Icon, type IconName } from './Icon';

interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  isActive: (route: Route) => boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: routes.overview, label: 'Resumen', icon: 'overview', isActive: (r) => r.page === 'overview' || r.page === 'server' },
  { href: routes.alerts, label: 'Alertas', icon: 'alert', isActive: (r) => r.page === 'alerts' },
  { href: routes.log, label: 'Registro', icon: 'log', isActive: (r) => r.page === 'log' },
  { href: routes.settings, label: 'Ajustes', icon: 'settings', isActive: (r) => r.page === 'settings' },
];

interface TopBarProps {
  route: Route;
  /** Alertas activas sin reconocer (se muestran como contador en "Alertas"). */
  pendingAlerts: number;
  hasCritical: boolean;
}

/**
 * Barra superior. El enlace de marca y el de GitHub siguen la convención de
 * las demos del portfolio (sus href se sustituyen al copiar la demo).
 * En móvil la navegación pasa a una barra inferior fija (solo CSS).
 */
export function TopBar({ route, pendingAlerts, hasCritical }: TopBarProps) {
  return (
    <header className="topbar">
      <div className="topbar__inner">
        <a className="topbar__brand" href="https://tu-dominio.netlify.app/"><span className="mark">{'{ }'}</span> InfraPulse</a>

        <nav className="mainnav" aria-label="Secciones">
          <ul className="mainnav__list">
            {NAV_ITEMS.map((item) => {
              const active = item.isActive(route);
              const showBadge = item.href === routes.alerts && pendingAlerts > 0;
              return (
                <li key={item.href}>
                  <a className="mainnav__link" href={item.href} aria-current={active ? 'page' : undefined}>
                    <Icon name={item.icon} size={18} />
                    <span className="mainnav__label">{item.label}</span>
                    {showBadge && (
                      <span className={`mainnav__badge${hasCritical ? ' mainnav__badge--critical' : ''}`}>
                        <span className="num">{pendingAlerts}</span>
                        <span className="visually-hidden"> sin reconocer</span>
                      </span>
                    )}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>

        <a className="back-link" href="https://github.com/HookMike/infrapulse">Ver código en GitHub</a>
      </div>
    </header>
  );
}
