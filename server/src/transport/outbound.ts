import type { ServerMessage } from "@log-aggregator/shared";
import type { WebSocket } from "ws";

/**
 * Above this, the client is not draining fast enough. v1 had no such check, so a
 * backgrounded tab during a log burst buffered unboundedly in server memory.
 */
const MAX_BUFFERED_BYTES = 4 * 1_024 * 1_024;

export interface SendOptions {
  /** Live data that can be skipped under backpressure; the client can page it back. */
  droppable?: boolean;
}

export function send(
  socket: WebSocket,
  message: ServerMessage,
  options: SendOptions = {},
): boolean {
  if (socket.readyState !== socket.OPEN) {
    return false;
  }

  if (options.droppable && socket.bufferedAmount > MAX_BUFFERED_BYTES) {
    return false;
  }

  socket.send(JSON.stringify(message));

  return true;
}
