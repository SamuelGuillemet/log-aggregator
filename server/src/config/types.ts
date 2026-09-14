import type { LogSourceConfig } from "@log-aggregator/shared";

export interface ParserConfig {
  /** Regex with named groups; see `groups` for the logical-name mapping. */
  linePattern: string;
  /** Logical field name -> capture group name. `timestamp`, `level`, `message` are required. */
  groups: Record<string, string>;
  /** File-name template using `{project}` and `{date}` placeholders. */
  logFileName: string;
}

export interface ServerConfig {
  sources: LogSourceConfig[];
  sourcesFile: string;
  parser: ParserConfig;
}

export interface RuntimeOptions {
  host: string;
  port: number;
  allowedOrigins: string[];
  maxEventsPerStream: number;
  pollIntervalMs: number;
  maxLiveBatch: number;
  streamLingerMs: number;
}
