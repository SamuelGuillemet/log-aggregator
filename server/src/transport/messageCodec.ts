import type { ServerMessage } from "@log-aggregator/shared";
import { type RawData, WebSocket } from "ws";

export function sendMessage(socket: WebSocket, message: ServerMessage): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

export function rawDataToString(rawMessage: RawData): string {
  if (Buffer.isBuffer(rawMessage)) {
    return rawMessage.toString("utf8");
  }

  if (rawMessage instanceof ArrayBuffer) {
    return Buffer.from(rawMessage).toString("utf8");
  }

  return Buffer.concat(rawMessage).toString("utf8");
}
