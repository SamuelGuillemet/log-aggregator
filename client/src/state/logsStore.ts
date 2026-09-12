import {
  type LogEvent,
  type LogPage,
  type LogTableSchema,
  type StreamStatus,
  compareEventsNewestFirst,
} from "@log-aggregator/shared";
import { create } from "zustand";
import { MAX_CLIENT_EVENTS } from "@/lib/env";

const EMPTY_STATUS: StreamStatus = {
  bufferedEvents: 0,
  paused: false,
  selection: undefined,
  sources: [],
};

interface LogsStore {
  /** Newest first. Bounded by MAX_CLIENT_EVENTS. */
  events: LogEvent[];
  /** Highest `seq` held, so a live batch can skip the de-duplication scan. */
  maxSeq: number;
  hasMore: boolean;
  schema: LogTableSchema | undefined;
  status: StreamStatus;
  droppedEvents: number;
  /** A history page is in flight; also the re-entrancy guard for paging. */
  loadingPage: boolean;
  applySnapshot: (page: LogPage, schema: LogTableSchema, status: StreamStatus) => void;
  applyStatus: (status: StreamStatus) => void;
  applyLiveEvents: (events: LogEvent[], bufferedEvents: number) => void;
  appendPage: (page: LogPage) => void;
  setLoadingPage: (loadingPage: boolean) => void;
  reportLag: (droppedEvents: number) => void;
  reset: () => void;
}

export const useLogsStore = create<LogsStore>((set) => ({
  appendPage: (page) =>
    set((state) => {
      if (page.events.length === 0) {
        return { hasMore: page.hasMore };
      }

      const merged = mergeEvents(state.events, page.events, state.maxSeq);

      return {
        events: merged.events,
        hasMore: page.hasMore || merged.trimmed,
        maxSeq: merged.maxSeq,
      };
    }),
  applyLiveEvents: (events, bufferedEvents) =>
    set((state) => {
      const merged = mergeEvents(state.events, events, state.maxSeq);

      return {
        events: merged.events,
        hasMore: state.hasMore || merged.trimmed,
        maxSeq: merged.maxSeq,
        status: { ...state.status, bufferedEvents },
      };
    }),
  applySnapshot: (page, schema, status) =>
    set({
      droppedEvents: 0,
      events: page.events,
      hasMore: page.hasMore,
      maxSeq: highestSeq(page.events, 0),
      schema,
      status,
    }),
  applyStatus: (status) => set({ status }),
  droppedEvents: 0,
  events: [],
  hasMore: false,
  loadingPage: false,
  maxSeq: 0,
  reportLag: (droppedEvents) =>
    set((state) => ({ droppedEvents: state.droppedEvents + droppedEvents })),
  setLoadingPage: (loadingPage) => set({ loadingPage }),
  reset: () =>
    set({
      droppedEvents: 0,
      events: [],
      hasMore: false,
      loadingPage: false,
      maxSeq: 0,
      status: EMPTY_STATUS,
    }),
  schema: undefined,
  status: EMPTY_STATUS,
}));

interface MergeResult {
  events: LogEvent[];
  maxSeq: number;
  trimmed: boolean;
}

/**
 * v1 rebuilt a Map from every retained event and re-sorted the whole array on every
 * live batch, ten times a second. Here the incoming batch is sorted on its own (it is
 * small), the retained array is only rescanned when a revision could collide with it,
 * and the result is a linear merge.
 */
function mergeEvents(current: LogEvent[], incoming: LogEvent[], maxSeq: number): MergeResult {
  const sorted = [...incoming].sort(compareEventsNewestFirst);
  const lowestIncomingSeq = sorted.reduce(
    (lowest, event) => Math.min(lowest, event.seq),
    Number.POSITIVE_INFINITY,
  );
  // `seq` is monotonic per stream, so anything above the retained maximum is new and
  // cannot be a revision of something already held.
  const base =
    lowestIncomingSeq > maxSeq
      ? current
      : dropSuperseded(current, new Set(sorted.map((event) => event.seq)));
  const merged = mergeNewestFirst(sorted, base);
  const trimmed = merged.length > MAX_CLIENT_EVENTS;

  return {
    events: trimmed ? merged.slice(0, MAX_CLIENT_EVENTS) : merged,
    maxSeq: highestSeq(sorted, maxSeq),
    trimmed,
  };
}

function dropSuperseded(events: LogEvent[], supersededSeqs: Set<number>): LogEvent[] {
  return events.filter((event) => !supersededSeqs.has(event.seq));
}

function mergeNewestFirst(left: LogEvent[], right: LogEvent[]): LogEvent[] {
  if (left.length === 0) {
    return right;
  }

  if (right.length === 0) {
    return left;
  }

  const merged: LogEvent[] = [];
  let leftIndex = 0;
  let rightIndex = 0;

  while (leftIndex < left.length && rightIndex < right.length) {
    if (compareEventsNewestFirst(left[leftIndex], right[rightIndex]) <= 0) {
      merged.push(left[leftIndex++]);
    } else {
      merged.push(right[rightIndex++]);
    }
  }

  for (; leftIndex < left.length; leftIndex += 1) {
    merged.push(left[leftIndex]);
  }

  for (; rightIndex < right.length; rightIndex += 1) {
    merged.push(right[rightIndex]);
  }

  return merged;
}

function highestSeq(events: LogEvent[], initial: number): number {
  return events.reduce((highest, event) => Math.max(highest, event.seq), initial);
}
