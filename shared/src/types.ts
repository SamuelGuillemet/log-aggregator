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
}

export interface LogSource {
  id: string;
  name: string;
  directory: string;
  enabled: boolean;
  environment?: string;
  country?: string;
  project?: string;
  date?: string;
  tier?: ApplicationTier;
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
  [field: string]: string | undefined;
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
}

export interface LogFieldDefinition {
  id: string;
  label: string;
  field: string;
  width: number;
  hideable: boolean;
}

export interface LogFieldGroup {
  id: string;
  label: string;
  fields: LogFieldDefinition[];
}

export interface LogTableColumn extends LogFieldDefinition {
  groupId: string;
  groupLabel: string;
}

export interface LogTableSchema {
  columns: LogTableColumn[];
}

export interface LogCursor {
  id: string;
  timestamp: string;
  receivedAt: string;
  filePath: string;
}

export interface LogPageRequest {
  before?: LogCursor;
  until?: string;
  limit?: number;
}

export interface LogPage {
  append: "top" | "bottom";
  events: LogEvent[];
  hasMore: boolean;
}

export interface LogSnapshot {
  events: LogEvent[];
  sources: LogSource[];
  schema: LogTableSchema;
  hasMore: boolean;
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
  | { type: "filter"; payload: Partial<LogFilter> }
  | { type: "ping" };

export type ServerMessage =
  | { type: "connected"; payload: { options: SourceOptions } }
  | {
      type: "snapshot";
      payload: LogSnapshot;
    }
  | { type: "log"; payload: LogEvent }
  | { type: "disconnected"; payload: { reason?: string } }
  | { type: "error"; payload: { message: string; details?: string } }
  | { type: "pong"; payload: { timestamp: string } };
