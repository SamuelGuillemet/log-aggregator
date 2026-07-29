import type {
  LogEvent,
  LogFilter,
  LogLevel,
  LogSource,
  ServerMessage,
  StatsSnapshot,
} from "@log-aggregator/shared";
import { create } from "zustand";

const emptyStats: StatsSnapshot = {
  eventsPerSecond: 0,
  warnings: 0,
  errors: 0,
  activeInstances: 0,
  memoryUsageMb: 0,
  parserFailures: 0,
  watchedFiles: 0,
};

export const defaultFilter: LogFilter = {
  caseSensitive: false,
  levels: [],
  regex: false,
  sourceIds: [],
  text: "",
};

interface LogStore {
  connected: boolean;
  paused: boolean;
  events: LogEvent[];
  stats: StatsSnapshot;
  sources: LogSource[];
  filter: LogFilter;
  error: string | undefined;
  setConnected: (connected: boolean) => void;
  setPaused: (paused: boolean) => void;
  setFilter: (filter: Partial<LogFilter>) => void;
  clear: () => void;
  handleServerMessage: (message: ServerMessage) => void;
}

export const useLogStore = create<LogStore>((set) => ({
  connected: false,
  paused: false,
  events: [],
  stats: emptyStats,
  sources: [],
  filter: defaultFilter,
  error: undefined,
  clear: () => set({ error: undefined, events: [], stats: emptyStats }),
  handleServerMessage: (message) =>
    set((state) => {
      if (message.type === "snapshot") {
        return {
          error: undefined,
          events: message.payload.events,
          sources: message.payload.sources,
          stats: message.payload.stats,
        };
      }

      if (message.type === "log") {
        return {
          error: undefined,
          events: [...state.events, message.payload].slice(-10_000),
        };
      }

      if (message.type === "stats") {
        return { stats: message.payload };
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
  setFilter: (filter) =>
    set((state) => ({ filter: { ...state.filter, ...filter } })),
  setPaused: (paused) => set({ paused }),
}));

export function applyLogFilter(
  events: LogEvent[],
  filter: LogFilter,
): LogEvent[] {
  let textPattern: RegExp | undefined;

  if (filter.text && filter.regex) {
    try {
      // react-doctor-disable-next-line react-doctor/no-unescaped-dynamic-string-in-regexp
      textPattern = new RegExp(filter.text, filter.caseSensitive ? "" : "i");
    } catch {
      textPattern = undefined;
    }
  }

  const sourceIdSet =
    filter.sourceIds.length > 0 ? new Set(filter.sourceIds) : undefined;
  const levelSet =
    filter.levels.length > 0 ? new Set(filter.levels) : undefined;
  const containsText = filter.caseSensitive
    ? containsCaseSensitive
    : containsCaseInsensitive;

  return events.filter((event) => {
    if (sourceIdSet && !sourceIdSet.has(event.sourceId)) {
      return false;
    }

    if (levelSet && !levelSet.has(event.level)) {
      return false;
    }

    if (!filter.text) {
      return true;
    }

    const searchable = `${event.timestamp} ${event.sourceName} ${event.instance} ${event.level} ${event.thread ?? ""} ${event.logger ?? ""} ${event.message}`;
    return textPattern
      ? textPattern.test(searchable)
      : containsText(searchable, filter.text);
  });
}

export function toggleLevel(levels: LogLevel[], level: LogLevel): LogLevel[] {
  return levels.includes(level)
    ? levels.filter((candidate) => candidate !== level)
    : [...levels, level];
}

function containsCaseSensitive(value: string, needle: string): boolean {
  return value.includes(needle);
}

function containsCaseInsensitive(value: string, needle: string): boolean {
  return value.toLowerCase().includes(needle.toLowerCase());
}
