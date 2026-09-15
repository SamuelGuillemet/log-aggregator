import type { LogSourceConfig } from "@log-aggregator/shared";

export interface ObservabilityFieldMapping {
  /** `fields` key holding the response status (e.g. from `status=[200]`). */
  statusField: string;
  /** `fields` key holding a duration in milliseconds (e.g. from `timeTakenMs=[7]`). */
  durationField: string;
  /** `fields` key holding the requested URL (e.g. from `url=[/api/users]`). Optional. */
  urlField: string;
  /** `fields` key holding the HTTP method (e.g. from `method=[GET]`). Optional. */
  methodField: string;
}

export interface ParserConfig {
  /** Regex with named groups; see `groups` for the logical-name mapping. */
  linePattern: string;
  /** Logical field name -> capture group name. `timestamp`, `level`, `message` are required. */
  groups: Record<string, string>;
  /** File-name template using `{project}` and `{date}` placeholders. */
  logFileName: string;
  /** Extracts every `key=[value]` token in the message into `fields`, merged with `groups`. */
  messageFields?: boolean;
  /** Enables the observability aggregate; absent when the log format has no such fields. */
  observability?: ObservabilityFieldMapping;
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
