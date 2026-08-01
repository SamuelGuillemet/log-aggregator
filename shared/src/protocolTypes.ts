import type { LogEvent, LogFilter, LogSnapshot } from "./logTypes.js";
import type { SourceOptions, SourceSelection } from "./sourceTypes.js";

export type ClientMessage =
  | { type: "subscribe"; payload: SourceSelection }
  | { type: "unsubscribe" }
  | { type: "filter"; payload: Partial<LogFilter> }
  | { type: "ping" };

export type ServerMessage =
  | { type: "connected"; payload: { clientId: string; options: SourceOptions } }
  | {
      type: "snapshot";
      payload: LogSnapshot;
    }
  | { type: "log"; payload: LogEvent }
  | { type: "disconnected"; payload: { reason?: string } }
  | { type: "error"; payload: { message: string; details?: string } }
  | { type: "pong"; payload: { timestamp: string } };
