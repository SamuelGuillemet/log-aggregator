import { randomUUID } from "node:crypto";

import type {
  ClientMessage,
  LogEvent,
  LogFilter,
} from "@log-aggregator/shared";
import type { RawData, WebSocket } from "ws";

import type { LogAggregatorService } from "../application/logAggregatorService.js";
import {
  createEventMatcher,
  defaultLogFilter,
  mergeLogFilter,
} from "../domain/history.js";
import { rawDataToString, sendMessage } from "./messageCodec.js";

export interface ClientSession {
  id: string;
  filter: LogFilter;
  filterMatcher: (event: LogEvent) => boolean;
  service: LogAggregatorService;
  stopStreaming: () => Promise<void>;
  socket: WebSocket;
}

export function createClientSession(
  socket: WebSocket,
  service: LogAggregatorService,
): ClientSession {
  return {
    id: randomUUID(),
    filter: defaultLogFilter,
    filterMatcher: createEventMatcher(defaultLogFilter),
    service,
    socket,
    stopStreaming: async () => {
      await service.shutdown();
    },
  };
}

export function bindSessionStreaming(session: ClientSession): void {
  const unsubscribeLog = session.service.onLog((event) => {
    if (session.filterMatcher(event)) {
      sendMessage(session.socket, { payload: event, type: "log" });
    }
  });

  const unsubscribeError = session.service.onError((error) => {
    sendMessage(session.socket, { payload: error, type: "error" });
  });

  session.stopStreaming = async () => {
    unsubscribeLog();
    unsubscribeError();
    await session.service.shutdown();
  };
}

export function sendSnapshot(session: ClientSession): void {
  sendMessage(session.socket, {
    payload: session.service.getSnapshot(session.filter),
    type: "snapshot",
  });
}

export async function handleClientMessage(
  session: ClientSession,
  rawMessage: RawData,
): Promise<void> {
  let message: ClientMessage;

  try {
    message = JSON.parse(rawDataToString(rawMessage)) as ClientMessage;
  } catch {
    sendMessage(session.socket, {
      payload: { message: "Invalid JSON message" },
      type: "error",
    });
    return;
  }

  const handlers: Record<ClientMessage["type"], () => Promise<void> | void> = {
    filter: () => {
      if (message.type !== "filter") {
        return;
      }

      session.filter = mergeLogFilter(session.filter, message.payload);
      session.filterMatcher = createEventMatcher(session.filter);
      sendSnapshot(session);
    },
    ping: () => {
      sendMessage(session.socket, {
        payload: { timestamp: new Date().toISOString() },
        type: "pong",
      });
    },
    subscribe: async () => {
      if (message.type !== "subscribe") {
        return;
      }

      await session.service.subscribe(message.payload);
      sendSnapshot(session);
    },
    unsubscribe: async () => {
      await session.service.unsubscribe();
      sendSnapshot(session);
    },
  };

  await handlers[message.type]();
}

export async function closeSession(session: ClientSession): Promise<void> {
  await session.stopStreaming();
}
