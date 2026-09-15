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

/**
 * A one-shot instruction for the table to reposition its scroll, consumed and reset
 * back to "none" by whichever effect applies it. Keeping this in the store (rather
 * than inferring it from an events-array diff) is what lets a full replace (jump,
 * snapshot) request an exact position instead of the incremental "rows were added
 * above/below" adjustment a live batch needs.
 */
export type ScrollIntent = { type: "none" } | { type: "top" | "middle" | "bottom" };

const NO_SCROLL_INTENT: ScrollIntent = { type: "none" };

interface LogsStore {
  /** Newest first. Bounded by MAX_CLIENT_EVENTS. */
  events: LogEvent[];
  /** Highest `seq` held, so a live batch can skip the de-duplication scan. */
  maxSeq: number;
  /** More events exist below the loaded window (further into the past). */
  hasMoreOlder: boolean;
  /** More events exist above the loaded window (closer to "now"). */
  hasMoreNewer: boolean;
  schema: LogTableSchema | undefined;
  status: StreamStatus;
  droppedEvents: number;
  /** A history page is in flight; also the re-entrancy guard for paging. */
  loadingPage: boolean;
  /** A stream was just subscribed to and the first snapshot has not arrived yet. */
  streamLoading: boolean;
  /** Where the table should scroll to next; "none" once applied. */
  scrollIntent: ScrollIntent;
  applySnapshot: (page: LogPage, schema: LogTableSchema, status: StreamStatus) => void;
  applyStatus: (status: StreamStatus) => void;
  applyLiveEvents: (events: LogEvent[], bufferedEvents: number) => void;
  appendPage: (page: LogPage, direction: "older" | "newer") => void;
  /** Replaces the loaded window outright, for jumping to an arbitrary time. */
  applyJump: (page: LogPage) => void;
  setLoadingPage: (loadingPage: boolean) => void;
  setStreamLoading: (streamLoading: boolean) => void;
  consumeScrollIntent: () => void;
  reportLag: (droppedEvents: number) => void;
  reset: () => void;
}

export const useLogsStore = create<LogsStore>((set) => ({
  appendPage: (page, direction) =>
    set((state) => {
      if (page.events.length === 0) {
        return direction === "older"
          ? { hasMoreOlder: page.hasMoreOlder }
          : { hasMoreNewer: page.hasMoreNewer };
      }

      const merged = mergeEvents(state.events, page.events, state.maxSeq);

      // Eviction always drops from the tail (oldest first), regardless of which
      // direction just grew the array, so it only ever tells us more about the
      // older edge.
      return {
        events: merged.events,
        hasMoreNewer: direction === "newer" ? page.hasMoreNewer : state.hasMoreNewer,
        hasMoreOlder:
          direction === "older"
            ? page.hasMoreOlder || merged.trimmed
            : state.hasMoreOlder || merged.trimmed,
        maxSeq: merged.maxSeq,
      };
    }),
  applyLiveEvents: (events, bufferedEvents) =>
    set((state) => {
      const merged = mergeEvents(state.events, events, state.maxSeq);

      return {
        events: merged.events,
        // A live batch is by definition the current edge, so nothing is newer.
        hasMoreNewer: false,
        hasMoreOlder: state.hasMoreOlder || merged.trimmed,
        maxSeq: merged.maxSeq,
        status: { ...state.status, bufferedEvents },
      };
    }),
  applyJump: (page) =>
    set({
      droppedEvents: 0,
      events: page.events,
      hasMoreNewer: page.hasMoreNewer,
      hasMoreOlder: page.hasMoreOlder,
      maxSeq: highestSeq(page.events, 0),
      scrollIntent: jumpScrollIntent(page),
    }),
  applySnapshot: (page, schema, status) =>
    set({
      droppedEvents: 0,
      events: page.events,
      // A snapshot is the live edge itself, so there is nothing newer to page to.
      hasMoreNewer: false,
      hasMoreOlder: page.hasMoreOlder,
      maxSeq: highestSeq(page.events, 0),
      schema,
      // The live edge is always shown from its top, whether this is the first
      // snapshot of a new stream or the one a resume replaces the view with.
      scrollIntent: { type: "top" },
      status,
      streamLoading: false,
    }),
  applyStatus: (status) => set({ status }),
  consumeScrollIntent: () => set({ scrollIntent: NO_SCROLL_INTENT }),
  droppedEvents: 0,
  events: [],
  hasMoreNewer: false,
  hasMoreOlder: false,
  loadingPage: false,
  maxSeq: 0,
  reportLag: (droppedEvents) =>
    set((state) => ({ droppedEvents: state.droppedEvents + droppedEvents })),
  scrollIntent: NO_SCROLL_INTENT,
  setLoadingPage: (loadingPage) => set({ loadingPage }),
  setStreamLoading: (streamLoading) => set({ streamLoading }),
  reset: () =>
    set({
      droppedEvents: 0,
      events: [],
      hasMoreNewer: false,
      hasMoreOlder: false,
      loadingPage: false,
      maxSeq: 0,
      scrollIntent: NO_SCROLL_INTENT,
      status: EMPTY_STATUS,
      streamLoading: false,
    }),
  schema: undefined,
  status: EMPTY_STATUS,
  streamLoading: false,
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

/**
 * Mirrors the 3-way split the buffer used to build a jump's page: centred when both
 * edges still have more beyond the window, otherwise pinned to whichever edge it hit.
 */
function jumpScrollIntent(page: LogPage): ScrollIntent {
  if (!page.hasMoreOlder) {
    return { type: "bottom" };
  }

  if (!page.hasMoreNewer) {
    return { type: "top" };
  }

  return { type: "middle" };
}
