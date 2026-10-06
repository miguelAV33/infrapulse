import { formatCapacity, formatDuration, formatNumber } from '../lib/format';
import type { Rng } from '../lib/prng';
import { isWindows } from './fleet';
import type { LogEntry, Partition, Server } from './types';

/**
 * Mensajes del día a día de un sysadmin (cron, sshd, checkpoints, builds...).
 * No afectan a la simulación: solo dan vida al registro de eventos.
 */
export type NewLogEntry = Omit<LogEntry, 'id' | 'ts'>;

type Template = (server: Server, rng: Rng) => Pick<NewLogEntry, 'source' | 'message'>;

const randomUser = (rng: Rng) => rng.pick(['deploy', 'ansible', 'mangel', 'backup', 'monitor']);
const randomAdminIp = (rng: Rng) => `10.10.0.${rng.int(20, 60)}`;

const LINUX_COMMON: Template[] = [
  (_s, rng) => ({ source: 'sshd', message: `Sesión aceptada para ${randomUser(rng)} desde ${randomAdminIp(rng)} (clave pública)` }),
  (_s, rng) => ({
    source: 'cron',
    message: rng.pick([
      'logrotate diario completado sin errores',
      'Copia de /etc a /srv/backup completada',
      'Comprobación de certificados caducados: ninguno',
      'Limpieza de /tmp: ficheros de más de 7 días eliminados',
    ]),
  }),
  (s, rng) => ({
    source: s.os.startsWith('Rocky') ? 'dnf-automatic' : 'unattended-upgrades',
    message: `${rng.int(1, 6)} actualizaciones de seguridad pendientes de instalar`,
  }),
  (_s, rng) => ({ source: 'chronyd', message: `Reloj sincronizado con ntp.rediris.es (desfase ${formatNumber(rng.range(0.1, 4), 1)} ms)` }),
];

const BY_ROLE: Partial<Record<Server['role'], Template[]>> = {
  web: [
    (_s, rng) => ({ source: 'nginx', message: `${formatNumber(rng.int(900, 4800))} peticiones/min, ${formatNumber(rng.range(0.1, 1.2), 1)} % con código 5xx` }),
    (_s, rng) => ({ source: 'certbot', message: `Certificado TLS válido durante ${rng.int(30, 85)} días más` }),
    (_s, rng) => ({ source: 'php-fpm', message: `Pool www: ${rng.int(8, 30)} procesos activos de 40` }),
  ],
  api: [
    (_s, rng) => ({ source: 'docker', message: `Contenedor api-${rng.int(1, 4)} healthcheck OK (${rng.int(4, 40)} ms)` }),
    (_s, rng) => ({ source: 'nginx', message: `Latencia p95 de la API: ${rng.int(80, 260)} ms` }),
  ],
  database: [
    (_s, rng) => ({ source: 'postgresql', message: `Checkpoint completado: ${formatNumber(rng.int(800, 9000))} búferes escritos` }),
    (_s, rng) => ({ source: 'postgresql', message: `autovacuum en tabla ${rng.pick(['pedidos', 'clientes', 'facturas', 'sesiones'])} completado` }),
    (s, rng) =>
      s.name === 'db-02'
        ? { source: 'postgresql', message: `Réplica sincronizada con db-01, retraso ${rng.int(2, 40)} ms` }
        : { source: 'pgbouncer', message: `${rng.int(40, 180)} conexiones de cliente activas` },
  ],
  cache: [
    () => ({ source: 'redis', message: 'Snapshot RDB guardado en disco' }),
    (_s, rng) => ({ source: 'redis', message: `Tasa de aciertos de caché: ${formatNumber(rng.range(91, 99), 1)} %` }),
  ],
  mail: [
    (_s, rng) => ({ source: 'postfix', message: `Cola de salida: ${rng.int(0, 12)} mensajes pendientes` }),
    (_s, rng) => ({ source: 'opendkim', message: `${rng.int(10, 90)} mensajes firmados en el último minuto` }),
  ],
  vpn: [
    (_s, rng) => ({ source: 'openvpn', message: `Cliente vpn-user-${rng.int(10, 99)} conectado (${rng.int(3, 25)} sesiones activas)` }),
    (_s, rng) => ({ source: 'fail2ban', message: `IP 185.${rng.int(10, 250)}.${rng.int(1, 254)}.${rng.int(1, 254)} bloqueada tras 5 intentos fallidos` }),
  ],
  backup: [
    (_s, rng) => ({ source: 'Veeam', message: `Trabajo «Diario-BD» completado: ${formatCapacity(rng.range(20, 90))} transferidos` }),
    (_s, rng) => ({ source: 'Veeam', message: `Verificación SureBackup correcta (${rng.int(3, 9)} máquinas)` }),
  ],
  ci: [
    (_s, rng) => ({ source: 'gitlab-runner', message: `Job #${rng.int(4000, 9999)} completado en ${formatDuration(rng.int(40, 600))}` }),
    (_s, rng) => ({ source: 'docker', message: `Imagen ${rng.pick(['node:22', 'php:8.3-fpm', 'python:3.13'])} descargada` }),
  ],
};

const WINDOWS_COMMON: Template[] = [
  () => ({ source: 'W32Time', message: 'Hora sincronizada con el controlador de dominio' }),
  (_s, rng) => ({ source: 'Security', message: `Inicio de sesión correcto de ${randomUser(rng)} por RDP (evento 4624)` }),
];

export function routineEvent(server: Server, rng: Rng): NewLogEntry {
  const common = isWindows(server) ? WINDOWS_COMMON : LINUX_COMMON;
  const own = BY_ROLE[server.role] ?? [];
  // Los mensajes propios del rol aparecen el doble que los genéricos.
  const pool = [...common, ...own, ...own];
  const { source, message } = rng.pick(pool)(server, rng);
  return { level: 'info', server: server.name, source, message };
}

/** Mensaje de limpieza automática al llenarse una partición. */
export function cleanupEvent(server: Server, partition: Partition, freedGb: number): NewLogEntry {
  const freed = formatCapacity(freedGb);
  const base = { level: 'info' as const, server: server.name };
  if (server.role === 'backup') {
    return { ...base, source: 'Veeam', message: `Política de retención: eliminados puntos de restauración antiguos en ${partition.mount} (${freed} liberados)` };
  }
  if (server.role === 'database') {
    return { ...base, source: 'postgresql', message: `Archivado de WAL y VACUUM completados en ${partition.mount} (${freed} liberados)` };
  }
  if (server.role === 'ci') {
    return { ...base, source: 'docker', message: `docker system prune: imágenes y capas sin uso eliminadas (${freed} liberados)` };
  }
  if (isWindows(server)) {
    return { ...base, source: 'cleanmgr', message: `Limpieza de archivos temporales en ${partition.mount} (${freed} liberados)` };
  }
  return { ...base, source: 'logrotate', message: `Registros comprimidos y rotados en ${partition.mount} (${freed} liberados)` };
}
