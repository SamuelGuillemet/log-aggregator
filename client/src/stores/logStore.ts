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
  sourceIds: [],
  text: "",
};

interface LogStore {
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
          events: [...state.events, message.payload].slice(-10_000),
        };
      }

      if (message.type === "disconnected") {
        return {
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
  setConnected: (connected) => set({ connected }),
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
  const eventsById = new Map(currentEvents.map((event) => [event.id, event]));
  const newEvents = incomingEvents.filter((event) => !eventsById.has(event.id));

  return append === "top"
    ? [...newEvents, ...currentEvents]
    : [...currentEvents, ...newEvents];
}
