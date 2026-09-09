import type { LogEvent, LogFilter, LogSnapshot } from "./logTypes.js";
import type { SourceOptions, SourceSelection } from "./sourceTypes.js";

export type ClientMessage =
  | { type: "subscribe"; payload: SourceSelection }
  | { type: "unsubscribe" }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "filter"; payload: Partial<LogFilter> }
  | { type: "ping" };

export type ServerMessage =
  | {
      type: "connected";
      payload: {
        clientId: string;
        options: SourceOptions;
        /** Absent on backends older than this negotiation feature. */
        protocolVersion?: number;
      };
    }
  | {
      type: "snapshot";
      payload: LogSnapshot;
    }
  | { type: "source-options"; payload: SourceOptions }
  | { type: "log"; payload: LogEvent }
  | { type: "disconnected"; payload: { reason?: string } }
  | { type: "error"; payload: { message: string; details?: string } }
  | { type: "pong"; payload: { timestamp: string } };
