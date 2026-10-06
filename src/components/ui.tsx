import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

/** Piezas de interfaz pequeñas y reutilizables. */

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-header">
      <div className="page-header__text">
        {/* tabIndex -1: el foco se mueve aquí al cambiar de página (accesibilidad). */}
        <h1 className="page-title" tabIndex={-1}>
          {title}
        </h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="page-header__actions">{actions}</div>}
    </div>
  );
}

export function Panel({
  title,
  meta,
  children,
  className,
}: {
  title: ReactNode;
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={className ? `panel ${className}` : 'panel'}>
      <header className="panel__header">
        <h2 className="panel__title">{title}</h2>
        {meta && <div className="panel__meta">{meta}</div>}
      </header>
      {children}
    </section>
  );
}

export function EmptyState({
  icon = 'info',
  title,
  children,
  tone = 'neutral',
}: {
  icon?: IconName;
  title: string;
  children?: ReactNode;
  tone?: 'neutral' | 'ok';
}) {
  return (
    <div className={`empty empty--${tone}`}>
      <span className="empty__icon">
        <Icon name={icon} size={22} />
      </span>
      <p className="empty__title">{title}</p>
      {children && <div className="empty__body">{children}</div>}
    </div>
  );
}
