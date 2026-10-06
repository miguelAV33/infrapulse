/** Tipos del dominio: servidores, métricas, alertas y eventos del registro. */

export type Role = 'web' | 'api' | 'database' | 'cache' | 'mail' | 'vpn' | 'backup' | 'ci';
export type Datacenter = 'Madrid-DC1' | 'Frankfurt-DC2';
export type OperatingSystem =
  | 'Ubuntu 24.04 LTS'
  | 'Debian 12'
  | 'Rocky Linux 9'
  | 'Windows Server 2022';

/** up: responde · down: no responde (incidente) · rebooting: reinicio solicitado por el operador. */
export type Reachability = 'up' | 'down' | 'rebooting';
export type ServiceStatus = 'running' | 'failed' | 'restarting';

/** Estado agregado que se muestra en la interfaz (ok / aviso / crítico / sin conexión). */
export type ServerStatus = 'ok' | 'warning' | 'critical' | 'offline';
export type Severity = 'warning' | 'critical';
export type LogLevel = 'info' | 'warning' | 'critical';

export interface Partition {
  mount: string;
  sizeGb: number;
  usedPct: number;
  /** Puntos porcentuales que crece por tick (copias de seguridad, datos de BD...). */
  growthPerTick: number;
  /** Al alcanzar este uso se ejecuta la limpieza/retención automática. */
  cleanupAt: number;
  /** Uso aproximado tras la limpieza. */
  cleanupTo: number;
}

export interface Service {
  name: string;
  port: number | null;
  status: ServiceStatus;
}

/** Muestra del histórico; null cuando el servidor no respondía. */
export interface Sample {
  t: number;
  cpu: number | null;
  ram: number | null;
  netIn: number | null;
  netOut: number | null;
}

export interface Metrics {
  cpu: number;
  ram: number;
  /** Mbit/s */
  netIn: number;
  netOut: number;
  /** Carga media a 1, 5 y 15 minutos (estilo `uptime`). */
  load: [number, number, number];
}

export type IncidentKind = 'cpu_spike' | 'service_crash' | 'unreachable' | 'disk_burst';

export interface Incident {
  kind: IncidentKind;
  /** Ticks hasta que el incidente se resuelve solo. */
  ticksLeft: number;
  /** Proceso, servicio o punto de montaje afectado, si aplica. */
  target: string | null;
}

export interface Server {
  name: string;
  role: Role;
  description: string;
  os: OperatingSystem;
  datacenter: Datacenter;
  ip: string;
  cores: number;
  ramGb: number;
  partitions: Partition[];
  services: Service[];
  uptimeSec: number;
  reachability: Reachability;
  /** Ticks que faltan para terminar un reinicio solicitado. */
  rebootTicks: number;
  /** Últimas métricas conocidas (se conservan aunque deje de responder). */
  metrics: Metrics;
  /** Ciclo de trabajo intensivo (CI, copias): ticks restantes. */
  jobTicks: number;
  history: Sample[];
  incident: Incident | null;
}

export type AlertRule = 'cpu' | 'ram' | 'disk' | 'service' | 'unreachable';

export interface Alert {
  id: string;
  /** Identifica la condición: "cpu@web-01", "disk:/var@web-01"... */
  key: string;
  rule: AlertRule;
  server: string;
  target: string | null;
  severity: Severity;
  /** Severidad máxima alcanzada (para el historial). */
  peakSeverity: Severity;
  message: string;
  firedAt: number;
  acknowledgedAt: number | null;
  resolvedAt: number | null;
}

export interface LogEntry {
  id: number;
  ts: number;
  level: LogLevel;
  server: string | null;
  source: string;
  message: string;
}

export interface Thresholds {
  cpuWarning: number;
  cpuCritical: number;
  ramWarning: number;
  ramCritical: number;
  diskWarning: number;
  diskCritical: number;
  /** Ticks consecutivos por encima del umbral de CPU/RAM antes de alertar. */
  consecutiveTicks: number;
}

/** Racha de ticks consecutivos por encima de cada umbral para una métrica. */
export interface Streak {
  warning: number;
  critical: number;
}

export interface SimState {
  seed: number;
  /** Estado del PRNG: continuar desde aquí hace la simulación determinista. */
  rngState: number;
  tick: number;
  /** Marca de tiempo del último tick (ms). */
  now: number;
  paused: boolean;
  servers: Server[];
  activeAlerts: Alert[];
  resolvedAlerts: Alert[];
  streaks: Record<string, Streak>;
  log: LogEntry[];
  nextLogId: number;
}
