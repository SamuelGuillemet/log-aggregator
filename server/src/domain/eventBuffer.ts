import {
  type LogCursor,
  type LogEvent,
  type LogPage,
  compareEventsOldestFirst,
} from "@log-aggregator/shared";

/**
 * Internal wrapper around a published event. Keeps a lazily computed lowercase
 * projection so a case-insensitive scan allocates once per event for the lifetime
 * of the buffer, instead of twice per event per query as v1 did.
 */
export interface StoredEvent {
  event: LogEvent;
  lowerRaw: string | undefined;
}

export type EventPredicate = (stored: StoredEvent) => boolean;

export const MATCH_ALL: EventPredicate = () => true;

/**
 * Bounded, ordered event store.
 *
 * Events are kept oldest-first under the total order (timestampMs, sourceId,
 * sourceSeq). Queries walk backwards from a binary-searched anchor and stop as soon
 * as they have enough matches, so the buffer is never filtered or re-sorted in full.
 *
 * A cold load merges every rotation file of a selection at once, so out-of-order
 * arrivals across files are common (not the exception the live tail sees). Those
 * appends are pushed in O(1) and flagged dirty instead of insertion-sorted in place,
 * so a first load of N events costs one O(N log N) sort instead of an O(N) shift per
 * out-of-order event (O(N^2) overall).
 */
export class EventBuffer {
  private readonly events: StoredEvent[] = [];
  private readonly evictChunk: number;
  private sorted = true;

  constructor(private readonly capacity: number) {
    this.evictChunk = Math.max(1, Math.floor(capacity / 10));
  }

  get size(): number {
    this.ensureSorted();
    return this.events.length;
  }

  clear(): void {
    this.events.length = 0;
    this.sorted = true;
  }

  append(event: LogEvent): StoredEvent {
    const stored: StoredEvent = { event, lowerRaw: undefined };
    const last = this.events.at(-1);

    // Appends dominate: a live tail is already in order, so the common case is O(1)
    // and eviction can run immediately without disturbing order.
    if (!last || compareEventsOldestFirst(last.event, event) <= 0) {
      this.events.push(stored);
      this.evictOverflow();
    } else {
      this.events.push(stored);
    }
    this.sorted = false;

    return stored;
  }

  /**
   * Publishes a new revision of an already-stored event. The previous object is
   * left untouched because it may already be serialized on a socket; v1 mutated it
   * in place via `Object.assign`, which lost continuations on the pagination path.
   */
  update(stored: StoredEvent, event: LogEvent): void {
    stored.event = event;
    stored.lowerRaw = undefined;
  }

  latest(limit: number, match: EventPredicate): LogPage {
    this.ensureSorted();

    return this.collect(0, this.events.length, limit, match);
  }

  before(cursor: LogCursor, limit: number, match: EventPredicate): LogPage {
    this.ensureSorted();

    return this.collect(0, this.cursorIndex(cursor), limit, match);
  }

  /** The next events strictly after `cursor`, for paging forward toward "now". */
  after(cursor: LogCursor, limit: number, match: EventPredicate): LogPage {
    this.ensureSorted();

    return this.collectForward(this.cursorIndex(cursor) + 1, this.events.length, limit, match);
  }

  /** A window anchored at `timestampMs`, for jumping straight to a point in the day. */
  until(timestampMs: number, limit: number, match: EventPredicate): LogPage {
    this.ensureSorted();

    const floor = this.timestampIndex(timestampMs);
    const page = this.collectForward(floor, this.events.length, limit, match);

    // hasMore here means "more older entries below the window", matching what before()
    // means by it, so the client's generic "load older" affordance keeps working.
    return { events: page.events, hasMore: floor > 0 };
  }

  /** Applies every deferred out-of-order append at once, then evicts down to capacity. */
  private ensureSorted(): void {
    if (this.sorted) {
      return;
    }

    this.events.sort((left, right) => compareEventsOldestFirst(left.event, right.event));
    this.sorted = true;
    this.evictOverflow();
  }

  /** Walks `[floor, end)` backwards, newest first, under a bounded scan budget. */
  private collect(floor: number, end: number, limit: number, match: EventPredicate): LogPage {
    const events: LogEvent[] = [];
    let index = end - 1;
    // Caps the work a single highly selective query can do, so a filter that matches
    // nothing cannot walk millions of events on the event loop.
    let budget = Math.max(limit * 50, 10_000);

    while (index >= floor && events.length < limit && budget > 0) {
      const stored = this.events[index];
      budget -= 1;

      if (match(stored)) {
        events.push(stored.event);
      }

      index -= 1;
    }

    return { events, hasMore: index >= floor };
  }

  /** Walks `[floor, end)` forwards, oldest first, then reverses to the newest-first contract. */
  private collectForward(
    floor: number,
    end: number,
    limit: number,
    match: EventPredicate,
  ): LogPage {
    const events: LogEvent[] = [];
    let index = floor;
    let budget = Math.max(limit * 50, 10_000);

    while (index < end && events.length < limit && budget > 0) {
      const stored = this.events[index];
      budget -= 1;

      if (match(stored)) {
        events.push(stored.event);
      }

      index += 1;
    }

    events.reverse();

    return { events, hasMore: index < end };
  }

  private evictOverflow(): void {
    if (this.events.length <= this.capacity) {
      return;
    }

    this.events.splice(0, this.events.length - this.capacity + this.evictChunk);
  }

  /** First index at or after the cursor position. */
  private cursorIndex(cursor: LogCursor): number {
    let low = 0;
    let high = this.events.length;

    while (low < high) {
      const middle = (low + high) >>> 1;

      if (compareToCursor(this.events[middle].event, cursor) < 0) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }

    return low;
  }

  /** First index whose timestamp is at or after `timestampMs`. */
  private timestampIndex(timestampMs: number): number {
    let low = 0;
    let high = this.events.length;

    while (low < high) {
      const middle = (low + high) >>> 1;

      if (this.events[middle].event.timestampMs < timestampMs) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }

    return low;
  }
}

function compareToCursor(event: LogEvent, cursor: LogCursor): number {
  if (event.timestampMs !== cursor.timestampMs) {
    return event.timestampMs - cursor.timestampMs;
  }

  if (event.sourceId !== cursor.sourceId) {
    return event.sourceId < cursor.sourceId ? -1 : 1;
  }

  return event.sourceSeq - cursor.sourceSeq;
}
