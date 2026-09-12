import type { LogEvent, LogFilter, LogPage } from "./logs.js";
import type { LogSource, SourceOptions, SourceSelection } from "./sources.js";
import type { LogTableSchema } from "./table.js";

/**
 * Wire protocol version. v5 is the v2 rewrite: it changes the `LogEvent` shape
 * (epoch timestamps, `seq` keys, `raw` + offset) and is not backward compatible.
 * Bump on any breaking change and append to COMPATIBILITY_TABLE; never edit past
 * entries, since installed backends keep reporting them.
 *
 * This constant has exactly one definition. v1 duplicated it into the server as a
 * literal to work around packaging, which is a drift bug waiting to happen.
 */
export const PROTOCOL_VERSION = 5;

/** Oldest backend this frontend build still talks to. */
export const MIN_SUPPORTED_PROTOCOL_VERSION = 5;

export interface CompatibilityEntry {
  protocolVersion: number;
  features: readonly string[];
}

export const COMPATIBILITY_TABLE: readonly CompatibilityEntry[] = [
  {
    features: [
      "subscribe",
      "history-pagination",
      "favorites",
      "configured-sources",
      "source-groups",
      "source-config-reload",
      "application-autocomplete",
      "stream-control",
      "batched-live-streaming",
      "shared-streams",
      "lag-reporting",
    ],
    protocolVersion: 5,
  },
];

export interface StreamStatus {
  selection: SourceSelection | undefined;
  sources: LogSource[];
  /** Events currently held by the shared buffer backing this stream. */
  bufferedEvents: number;
  paused: boolean;
}

export type ClientMessage =
  | { type: "subscribe"; selection: SourceSelection }
  | { type: "unsubscribe" }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "filter"; filter: LogFilter }
  | { type: "ping" };

export type ServerMessage =
  | {
      type: "connected";
      clientId: string;
      protocolVersion: number;
      options: SourceOptions;
    }
  | { type: "source-options"; options: SourceOptions }
  | {
      type: "snapshot";
      page: LogPage;
      schema: LogTableSchema;
      status: StreamStatus;
    }
  | { type: "logs"; events: LogEvent[]; bufferedEvents: number }
  | { type: "status"; status: StreamStatus }
  /** Live events were skipped because the socket could not keep up. */
  | { type: "lagged"; droppedEvents: number }
  | { type: "error"; message: string; details?: string }
  | { type: "pong"; timestampMs: number };
