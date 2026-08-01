import type { LogSource } from "./sourceTypes.js";
import type { LogTableSchema } from "./tableTypes.js";

export type LogLevel =
  | "TRACE"
  | "DEBUG"
  | "INFO"
  | "WARN"
  | "ERROR"
  | "FATAL"
  | "UNKNOWN";

export interface LogEvent {
  id: string;
  timestamp: string;
  receivedAt: string;
  sourceId: string;
  sourceName: string;
  filePath: string;
  level: LogLevel;
  message: string;
  fields: Record<string, string>;
}

export interface LogCursor {
  id: string;
}

export type LogHistoryQuery =
  | {
      type: "timestamp";
      fromTimestamp: string;
    }
  | {
      type: "cursor";
      beforeCursor: LogCursor;
      limit: number;
    };

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
  levels: LogLevel[];
  text: string;
  regex: boolean;
  caseSensitive: boolean;
}
