export type LogLevel =
  | "TRACE"
  | "DEBUG"
  | "INFO"
  | "WARN"
  | "ERROR"
  | "FATAL"
  | "UNKNOWN";

export type ApplicationTier = "back" | "front";

export type ConnectionStatus =
  | "connected"
  | "disconnected"
  | "watching"
  | "error";

export interface EnvironmentMatrixEntry {
  environment: string;
  country: string;
  code: string;
  host: string;
  shares: string[];
}

export interface ResolvedLogDirectory {
  id: string;
  environment: string;
  country: string;
  code: string;
  host: string;
  share: string;
  project: string;
  date: string;
  tier: ApplicationTier;
  path: string;
  filePattern: string;
}

export interface LogSource {
  id: string;
  name: string;
  directory: string;
  parser: string;
  enabled: boolean;
  environment?: string;
  country?: string;
  project?: string;
  date?: string;
  tier?: ApplicationTier;
  filePattern?: string;
}

export interface SourceSelection {
  environment: string;
  country: string;
  tier: ApplicationTier;
  project: string;
  date: string;
}

export interface SourceOptions {
  environments: string[];
  countriesByEnvironment: Record<string, string[]>;
  tiers: ApplicationTier[];
}

export interface LogEvent {
  id: string;
  timestamp: string;
  receivedAt: string;
  sourceId: string;
  sourceName: string;
  filePath: string;
  instance: string;
  level: LogLevel;
  thread?: string;
  logger?: string;
  message: string;
  raw: string;
  parser: string;
}

export interface StatsSnapshot {
  eventsPerSecond: number;
  warnings: number;
  errors: number;
  activeInstances: number;
  watchedFiles: number;
  parserFailures: number;
  memoryUsageMb: number;
}

export interface LogFilter {
  sourceIds: string[];
  levels: LogLevel[];
  text: string;
  regex: boolean;
  caseSensitive: boolean;
}

export type ClientMessage =
  | { type: "subscribe"; payload: SourceSelection }
  | { type: "unsubscribe" }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "filter"; payload: Partial<LogFilter> }
  | { type: "ping" };

export type ServerMessage =
  | { type: "connected"; payload: { options: SourceOptions } }
  | {
      type: "snapshot";
      payload: {
        events: LogEvent[];
        stats: StatsSnapshot;
        sources: LogSource[];
      };
    }
  | { type: "log"; payload: LogEvent }
  | { type: "stats"; payload: StatsSnapshot }
  | { type: "disconnected"; payload: { reason?: string } }
  | { type: "error"; payload: { message: string; details?: string } }
  | { type: "pong"; payload: { timestamp: string } };
