export const LOG_LEVELS = ["TRACE", "DEBUG", "INFO", "WARN", "ERROR", "FATAL", "UNKNOWN"] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

/** Levels a user can filter on. `UNKNOWN` is an ingest fallback, not a choice. */
export const SELECTABLE_LOG_LEVELS = LOG_LEVELS.filter((level) => level !== "UNKNOWN");

export interface LogEvent {
  /** Globally monotonic within a stream. Stable row key, no per-line UUID cost. */
  seq: number;
  /** Bumped when continuation lines extend an already-published event. */
  revision: number;
  /** Epoch millis, parsed once at ingest. Never re-parse the text downstream. */
  timestampMs: number;
  /** Original timestamp token, kept so display never round-trips through a Date. */
  timestampText: string;
  sourceId: string;
  sourceName: string;
  filePath: string;
  level: LogLevel;
  /** Full original line, plus any continuation lines. */
  raw: string;
  /** `raw.slice(messageOffset)` is the message; avoids storing the text twice. */
  messageOffset: number;
  fields: Record<string, string>;
  /** Appearance order within the owning source, for stable ties on equal timestamps. */
  sourceSeq: number;
}

export function logEventMessage(event: LogEvent): string {
  return event.raw.slice(event.messageOffset);
}

/**
 * Total order over events, newest first. Timestamps alone are not unique across a
 * cluster, so ties fall back to the source and its append order.
 */
export function compareEventsNewestFirst(left: LogEvent, right: LogEvent): number {
  return -compareEventsOldestFirst(left, right);
}

export function compareEventsOldestFirst(left: LogEvent, right: LogEvent): number {
  if (left.timestampMs !== right.timestampMs) {
    return left.timestampMs - right.timestampMs;
  }

  if (left.sourceId !== right.sourceId) {
    return left.sourceId < right.sourceId ? -1 : 1;
  }

  return left.sourceSeq - right.sourceSeq;
}

/** Position in the total order. Locating it is a binary search, not a scan by id. */
export interface LogCursor {
  timestampMs: number;
  sourceId: string;
  sourceSeq: number;
}

export function toLogCursor(event: LogEvent): LogCursor {
  return {
    sourceId: event.sourceId,
    sourceSeq: event.sourceSeq,
    timestampMs: event.timestampMs,
  };
}

export const MAX_PAGE_SIZE = 2_000;
export const DEFAULT_PAGE_SIZE = 200;

export type LogHistoryQuery =
  | { type: "before"; cursor: LogCursor; limit: number }
  | { type: "until"; timestampMs: number; limit: number };

export interface LogPage {
  events: LogEvent[];
  hasMore: boolean;
}

export interface LogFilter {
  levels: LogLevel[];
  text: string;
  regex: boolean;
  caseSensitive: boolean;
  /** Match when the line contains any of these terms. */
  includeAny: string[];
  /** Match when the line contains all of these terms. */
  includeAll: string[];
  /** Reject when the line contains any of these terms. */
  excludeAny: string[];
}

export const EMPTY_FILTER: LogFilter = Object.freeze({
  caseSensitive: false,
  excludeAny: [],
  includeAll: [],
  includeAny: [],
  levels: [],
  regex: false,
  text: "",
});

export function isEmptyFilter(filter: LogFilter): boolean {
  return (
    filter.levels.length === 0 &&
    filter.text.length === 0 &&
    filter.includeAny.length === 0 &&
    filter.includeAll.length === 0 &&
    filter.excludeAny.length === 0
  );
}
