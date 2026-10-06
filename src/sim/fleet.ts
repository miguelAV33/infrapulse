import type { Rng } from '../lib/prng';
import type { Datacenter, OperatingSystem, Partition, Role, Server, Service } from './types';

/**
 * Inventario de la flota simulada y comportamiento "normal" de cada rol.
 * Es configuración, no lógica: si mañana hay un servidor nuevo, se añade aquí.
 */

export const ROLE_LABELS: Record<Role, string> = {
  web: 'Web',
  api: 'API',
  database: 'Base de datos',
  cache: 'Caché',
  mail: 'Correo',
  vpn: 'VPN',
  backup: 'Copias de seguridad',
  ci: 'Integración continua',
};

export interface RoleProfile {
  /** Valores de referencia hacia los que tiende cada métrica (%, Mbit/s). */
  cpu: number;
  ram: number;
  netIn: number;
  netOut: number;
  /** Amplitud del ruido por tick. */
  cpuJitter: number;
  ramJitter: number;
  /** Trabajos periódicos intensivos (builds de CI, copias nocturnas). */
  job?: { chancePerTick: number; minTicks: number; maxTicks: number; cpuBoost: number; netInBoost: number };
}

export const ROLE_PROFILES: Record<Role, RoleProfile> = {
  web: { cpu: 32, ram: 58, netIn: 45, netOut: 160, cpuJitter: 5, ramJitter: 0.8 },
  api: { cpu: 44, ram: 62, netIn: 70, netOut: 95, cpuJitter: 6, ramJitter: 1 },
  database: { cpu: 36, ram: 78, netIn: 35, netOut: 60, cpuJitter: 4, ramJitter: 0.5 },
  cache: { cpu: 14, ram: 71, netIn: 90, netOut: 110, cpuJitter: 3, ramJitter: 0.4 },
  mail: { cpu: 9, ram: 41, netIn: 4, netOut: 3, cpuJitter: 2, ramJitter: 0.6 },
  vpn: { cpu: 12, ram: 28, netIn: 25, netOut: 25, cpuJitter: 3, ramJitter: 0.5 },
  backup: {
    cpu: 8,
    ram: 36,
    netIn: 15,
    netOut: 4,
    cpuJitter: 2,
    ramJitter: 0.6,
    job: { chancePerTick: 0.03, minTicks: 12, maxTicks: 25, cpuBoost: 30, netInBoost: 380 },
  },
  ci: {
    cpu: 18,
    ram: 45,
    netIn: 20,
    netOut: 6,
    cpuJitter: 6,
    ramJitter: 1.2,
    job: { chancePerTick: 0.12, minTicks: 4, maxTicks: 12, cpuBoost: 45, netInBoost: 60 },
  },
};

interface PartitionSpec {
  mount: string;
  sizeGb: number;
  /** Uso inicial aproximado (se le suma algo de azar con la semilla). */
  used: number;
  growth?: number;
  cleanupAt?: number;
  cleanupTo?: number;
}

interface ServerSpec {
  name: string;
  role: Role;
  description: string;
  os: OperatingSystem;
  datacenter: Datacenter;
  ip: string;
  cores: number;
  ramGb: number;
  partitions: PartitionSpec[];
  services: [name: string, port: number | null][];
}

const FLEET: ServerSpec[] = [
  {
    name: 'web-01',
    role: 'web',
    description: 'Frontal web (nginx + PHP-FPM)',
    os: 'Ubuntu 24.04 LTS',
    datacenter: 'Madrid-DC1',
    ip: '10.10.1.11',
    cores: 8,
    ramGb: 16,
    partitions: [
      { mount: '/', sizeGb: 80, used: 41 },
      { mount: '/var', sizeGb: 200, used: 52, growth: 0.004 },
    ],
    services: [['nginx', 443], ['php-fpm', 9000], ['sshd', 22], ['fail2ban', null]],
  },
  {
    name: 'web-02',
    role: 'web',
    description: 'Frontal web (nginx + PHP-FPM)',
    os: 'Ubuntu 24.04 LTS',
    datacenter: 'Frankfurt-DC2',
    ip: '10.20.1.11',
    cores: 8,
    ramGb: 16,
    partitions: [
      { mount: '/', sizeGb: 80, used: 38 },
      { mount: '/var', sizeGb: 200, used: 47, growth: 0.004 },
    ],
    services: [['nginx', 443], ['php-fpm', 9000], ['sshd', 22], ['fail2ban', null]],
  },
  {
    name: 'api-01',
    role: 'api',
    description: 'API REST en contenedores Docker',
    os: 'Debian 12',
    datacenter: 'Madrid-DC1',
    ip: '10.10.2.21',
    cores: 16,
    ramGb: 32,
    partitions: [
      { mount: '/', sizeGb: 100, used: 36 },
      { mount: '/var/lib/docker', sizeGb: 500, used: 58, growth: 0.006 },
    ],
    services: [['docker', null], ['nginx', 443], ['sshd', 22]],
  },
  {
    name: 'db-01',
    role: 'database',
    description: 'PostgreSQL principal',
    os: 'Rocky Linux 9',
    datacenter: 'Madrid-DC1',
    ip: '10.10.3.31',
    cores: 32,
    ramGb: 128,
    partitions: [
      { mount: '/', sizeGb: 100, used: 29 },
      { mount: '/var/lib/pgsql', sizeGb: 2000, used: 74, growth: 0.02, cleanupAt: 93, cleanupTo: 78 },
    ],
    services: [['postgresql', 5432], ['pgbouncer', 6432], ['sshd', 22]],
  },
  {
    name: 'db-02',
    role: 'database',
    description: 'PostgreSQL réplica de lectura',
    os: 'Rocky Linux 9',
    datacenter: 'Frankfurt-DC2',
    ip: '10.20.3.31',
    cores: 32,
    ramGb: 128,
    partitions: [
      { mount: '/', sizeGb: 100, used: 27 },
      { mount: '/var/lib/pgsql', sizeGb: 2000, used: 72, growth: 0.02, cleanupAt: 93, cleanupTo: 77 },
    ],
    services: [['postgresql', 5432], ['sshd', 22]],
  },
  {
    name: 'cache-01',
    role: 'cache',
    description: 'Redis para sesiones y caché',
    os: 'Debian 12',
    datacenter: 'Madrid-DC1',
    ip: '10.10.4.41',
    cores: 8,
    ramGb: 64,
    partitions: [{ mount: '/', sizeGb: 120, used: 33 }],
    services: [['redis', 6379], ['sshd', 22]],
  },
  {
    name: 'mail-01',
    role: 'mail',
    description: 'Correo saliente y buzones',
    os: 'Debian 12',
    datacenter: 'Madrid-DC1',
    ip: '10.10.5.51',
    cores: 4,
    ramGb: 8,
    partitions: [
      { mount: '/', sizeGb: 60, used: 35 },
      { mount: '/var/mail', sizeGb: 500, used: 61, growth: 0.003 },
    ],
    services: [['postfix', 25], ['dovecot', 993], ['opendkim', 8891], ['sshd', 22]],
  },
  {
    name: 'vpn-01',
    role: 'vpn',
    description: 'Acceso remoto OpenVPN',
    os: 'Ubuntu 24.04 LTS',
    datacenter: 'Madrid-DC1',
    ip: '10.10.0.5',
    cores: 2,
    ramGb: 4,
    partitions: [{ mount: '/', sizeGb: 40, used: 31 }],
    services: [['openvpn', 1194], ['sshd', 22], ['fail2ban', null]],
  },
  {
    name: 'backup-01',
    role: 'backup',
    description: 'Repositorio de copias (Veeam)',
    os: 'Windows Server 2022',
    datacenter: 'Frankfurt-DC2',
    ip: '10.20.6.61',
    cores: 8,
    ramGb: 32,
    partitions: [
      { mount: 'C:\\', sizeGb: 120, used: 48 },
      { mount: 'D:\\', sizeGb: 8000, used: 84, growth: 0.06, cleanupAt: 97, cleanupTo: 71 },
    ],
    services: [['VeeamBackupSvc', 9392], ['WinRM', 5985], ['TermService', 3389]],
  },
  {
    name: 'ci-runner-01',
    role: 'ci',
    description: 'Runner de GitLab CI con Docker',
    os: 'Ubuntu 24.04 LTS',
    datacenter: 'Frankfurt-DC2',
    ip: '10.20.7.71',
    cores: 16,
    ramGb: 32,
    partitions: [
      { mount: '/', sizeGb: 100, used: 44 },
      { mount: '/var/lib/docker', sizeGb: 500, used: 63, growth: 0.01, cleanupAt: 88, cleanupTo: 55 },
    ],
    services: [['gitlab-runner', null], ['docker', null], ['sshd', 22]],
  },
];

/** Construye la flota inicial; la semilla decide los valores de arranque. */
export function createFleet(rng: Rng): Server[] {
  return FLEET.map((spec) => {
    const profile = ROLE_PROFILES[spec.role];
    const partitions: Partition[] = spec.partitions.map((p) => ({
      mount: p.mount,
      sizeGb: p.sizeGb,
      usedPct: p.used + rng.range(-1, 1.5),
      growthPerTick: p.growth ?? 0.001,
      cleanupAt: p.cleanupAt ?? 90,
      cleanupTo: p.cleanupTo ?? p.used - 8,
    }));
    const services: Service[] = spec.services.map(([name, port]) => ({
      name,
      port,
      status: 'running',
    }));
    const cpu = profile.cpu + rng.noise() * profile.cpuJitter;
    const load = (cpu / 100) * spec.cores;

    return {
      name: spec.name,
      role: spec.role,
      description: spec.description,
      os: spec.os,
      datacenter: spec.datacenter,
      ip: spec.ip,
      cores: spec.cores,
      ramGb: spec.ramGb,
      partitions,
      services,
      uptimeSec: rng.int(3, 160) * 86_400 + rng.int(0, 86_399),
      reachability: 'up',
      rebootTicks: 0,
      metrics: {
        cpu,
        ram: profile.ram + rng.noise() * 2,
        netIn: profile.netIn,
        netOut: profile.netOut,
        load: [load, load, load],
      },
      jobTicks: 0,
      history: [],
      incident: null,
    } satisfies Server;
  });
}

export function isWindows(server: Pick<Server, 'os'>): boolean {
  return server.os.startsWith('Windows');
}
