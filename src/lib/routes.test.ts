import { describe, expect, it } from 'vitest';
import { parseRoute, routes } from './routes';

describe('parseRoute', () => {
  it('reconoce el resumen con o sin barra', () => {
    expect(parseRoute('')).toEqual({ page: 'overview' });
    expect(parseRoute('#')).toEqual({ page: 'overview' });
    expect(parseRoute('#/')).toEqual({ page: 'overview' });
  });

  it('reconoce las secciones', () => {
    expect(parseRoute('#/alertas')).toEqual({ page: 'alerts' });
    expect(parseRoute('#/registro/')).toEqual({ page: 'log' });
    expect(parseRoute('#/ajustes')).toEqual({ page: 'settings' });
  });

  it('extrae el nombre del servidor', () => {
    expect(parseRoute('#/servidor/web-01')).toEqual({ page: 'server', name: 'web-01' });
    expect(parseRoute(routes.server('ci-runner-01'))).toEqual({ page: 'server', name: 'ci-runner-01' });
  });

  it('ignora la parte de consulta dentro del hash', () => {
    expect(parseRoute('#/alertas?x=1')).toEqual({ page: 'alerts' });
  });

  it('devuelve notFound para rutas desconocidas o mal formadas', () => {
    expect(parseRoute('#/nada')).toEqual({ page: 'notFound', path: '/nada' });
    expect(parseRoute('#/servidor')).toEqual({ page: 'notFound', path: '/servidor' });
    expect(parseRoute('#/servidor/%E0%A4%A')).toEqual({ page: 'notFound', path: '/servidor/%E0%A4%A' });
  });
});
