import type {
  LogEvent,
  LogFilter,
  LogLevel,
  LogPage,
  LogSource,
  LogTableSchema,
  ServerMessage,
} from "@log-aggregator/shared";
import { create } from "zustand";

export const defaultFilter: LogFilter = {
  caseSensitive: false,
  levels: [],
  regex: false,
  text: "",
};

interface LogStore {
  clientId: string | undefined;
  connected: boolean;
  events: LogEvent[];
  hasMore: boolean;
  schema: LogTableSchema | undefined;
  sources: LogSource[];
  filter: LogFilter;
  error: string | undefined;
  appendLogPage: (page: LogPage) => void;
  setConnected: (connected: boolean) => void;
  setError: (error: string | undefined) => void;
  setFilter: (filter: Partial<LogFilter>) => void;
  handleServerMessage: (message: ServerMessage) => void;
}

export const useLogStore = create<LogStore>((set) => ({
  clientId: undefined,
  connected: false,
  events: [],
  hasMore: false,
  schema: undefined,
  sources: [],
  filter: defaultFilter,
  error: undefined,
  appendLogPage: (page) =>
    set((state) => ({
      error: undefined,
      events: mergeEvents(state.events, page.events, page.append),
      hasMore: page.hasMore,
    })),
  handleServerMessage: (message) =>
    set((state) => {
      if (message.type === "connected") {
        return { clientId: message.payload.clientId };
      }

      if (message.type === "snapshot") {
        return {
          error: undefined,
          events: message.payload.events,
          hasMore: message.payload.hasMore,
          schema: message.payload.schema,
          sources: message.payload.sources,
        };
      }

      if (message.type === "log") {
        const existingIndex = state.events.findIndex(
          (event) => event.id === message.payload.id,
        );

        if (existingIndex >= 0) {
          const events = [...state.events];
          events[existingIndex] = message.payload;

          return { error: undefined, events };
        }

        return {
          error: undefined,
          events: mergeEvents(state.events, [message.payload], "top"),
        };
      }

      if (message.type === "disconnected") {
        return {
          clientId: undefined,
          connected: false,
          error: message.payload.reason,
          sources: [],
        };
      }

      if (message.type === "error") {
        return { error: message.payload.message };
      }

      return state;
    }),
  setConnected: (connected) =>
    set(connected ? { connected } : { clientId: undefined, connected }),
  setError: (error) => set({ error }),
  setFilter: (filter) =>
    set((state) => ({ filter: { ...state.filter, ...filter } })),
}));

export function toggleLevel(levels: LogLevel[], level: LogLevel): LogLevel[] {
  return levels.includes(level)
    ? levels.filter((candidate) => candidate !== level)
    : [...levels, level];
}

function mergeEvents(
  currentEvents: LogEvent[],
  incomingEvents: LogEvent[],
  append: "top" | "bottom",
): LogEvent[] {
  if (incomingEvents.length === 0) {
    return currentEvents;
  }

  const existingIds = new Set(currentEvents.map((event) => event.id));
  const newEvents = incomingEvents.filter(
    (event) => !existingIds.has(event.id),
  );

  if (newEvents.length === 0) {
    return currentEvents;
  }

  if (append === "top") {
    return mergeSortedDesc(newEvents, currentEvents);
  }

  return mergeSortedDesc(currentEvents, newEvents);
}

function mergeSortedDesc(left: LogEvent[], right: LogEvent[]): LogEvent[] {
  const merged: LogEvent[] = [];
  let leftIndex = 0;
  let rightIndex = 0;

  while (leftIndex < left.length && rightIndex < right.length) {
    if (compareNewestFirst(left[leftIndex], right[rightIndex]) <= 0) {
      merged.push(left[leftIndex]);
      leftIndex += 1;
    } else {
      merged.push(right[rightIndex]);
      rightIndex += 1;
    }
  }

  if (leftIndex < left.length) {
    merged.push(...left.slice(leftIndex));
  }

  if (rightIndex < right.length) {
    merged.push(...right.slice(rightIndex));
  }

  return merged;
}

function compareNewestFirst(left: LogEvent, right: LogEvent): number {
  return Date.parse(right.timestamp) - Date.parse(left.timestamp);
}
