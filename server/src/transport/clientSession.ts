import { randomUUID } from "node:crypto";
import type { ClientMessage, LogEvent, LogFilter } from "@log-aggregator/shared";
import type { RawData, WebSocket } from "ws";
import type { LogAggregatorService } from "../application/logAggregatorService.js";
import { createEventMatcher, defaultLogFilter, mergeLogFilter } from "../domain/history.js";
import { rawDataToString, sendMessage } from "./messageCodec.js";

const defaultLiveBatchIntervalMs = 100;
const liveBatchIntervalMs = readLiveBatchInterval();

export interface ClientSession {
  id: string;
  filter: LogFilter;
  filterMatcher: (event: LogEvent) => boolean;
  streamingPaused: boolean;
  service: LogAggregatorService;
  stopStreaming: () => Promise<void>;
  socket: WebSocket;
  pendingLiveEvents: LogEvent[];
  liveBatchTimer: NodeJS.Timeout | undefined;
}

export function createClientSession(
  socket: WebSocket,
  service: LogAggregatorService,
): ClientSession {
  return {
    id: randomUUID(),
    filter: defaultLogFilter,
    filterMatcher: createEventMatcher(defaultLogFilter),
    streamingPaused: false,
    service,
    socket,
    pendingLiveEvents: [],
    liveBatchTimer: undefined,
    stopStreaming: async () => {
      await service.shutdown();
    },
  };
}

export function bindSessionStreaming(session: ClientSession): void {
  const unsubscribeLog = session.service.onLog((event) => {
    if (session.streamingPaused) {
      return;
    }

    session.pendingLiveEvents.push(event);

    session.liveBatchTimer ??= setTimeout(() => flushLiveEvents(session), liveBatchIntervalMs);
  });

  const unsubscribeError = session.service.onError((error) => {
    sendMessage(session.socket, { payload: error, type: "error" });
  });

  session.stopStreaming = async () => {
    unsubscribeLog();
    unsubscribeError();
    clearLiveBatch(session);
    await session.service.shutdown();
  };
}

function flushLiveEvents(session: ClientSession): void {
  session.liveBatchTimer = undefined;

  const events = session.pendingLiveEvents.filter((event) => session.filterMatcher(event));
  session.pendingLiveEvents = [];

  if (!session.streamingPaused && events.length > 0) {
    sendMessage(session.socket, { payload: events, type: "logs" });
  }
}

export function clearLiveBatch(session: ClientSession): void {
  if (session.liveBatchTimer) {
    clearTimeout(session.liveBatchTimer);
    session.liveBatchTimer = undefined;
  }

  session.pendingLiveEvents = [];
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
    pause: () => {
      session.streamingPaused = true;
      clearLiveBatch(session);
    },
    resume: () => {
      session.streamingPaused = false;
      sendSnapshot(session);
    },
    subscribe: async () => {
      if (message.type !== "subscribe") {
        return;
      }

      clearLiveBatch(session);
      await session.service.subscribe(message.payload);
      sendSnapshot(session);
    },
    unsubscribe: async () => {
      clearLiveBatch(session);
      await session.service.unsubscribe();
      sendSnapshot(session);
    },
  };

  await handlers[message.type]();
}

function readLiveBatchInterval(): number {
  const configuredInterval = Number(process.env.LOG_AGGREGATOR_LIVE_BATCH_INTERVAL_MS);

  return Number.isFinite(configuredInterval) && configuredInterval > 0
    ? configuredInterval
    : defaultLiveBatchIntervalMs;
}

export async function closeSession(session: ClientSession): Promise<void> {
  await session.stopStreaming();
}
