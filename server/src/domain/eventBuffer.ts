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

/** Result of a single directional scan, before it is translated into a public LogPage. */
interface ScanResult {
  events: LogEvent[];
  hasMore: boolean;
}

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

    const page = this.collect(0, this.events.length, limit, match);

    // The live edge: nothing is newer than "now".
    return { events: page.events, hasMoreNewer: false, hasMoreOlder: page.hasMore };
  }

  before(cursor: LogCursor, limit: number, match: EventPredicate): LogPage {
    this.ensureSorted();

    const page = this.collect(0, this.cursorIndex(cursor), limit, match);

    // The cursor's own event (and everything above it) is always newer than this window.
    return { events: page.events, hasMoreNewer: true, hasMoreOlder: page.hasMore };
  }

  /** The next events strictly after `cursor`, for paging forward toward "now". */
  after(cursor: LogCursor, limit: number, match: EventPredicate): LogPage {
    this.ensureSorted();

    const page = this.collectForward(
      this.cursorIndex(cursor) + 1,
      this.events.length,
      limit,
      match,
    );

    // The cursor's own event (and everything below it) is always older than this window.
    return { events: page.events, hasMoreNewer: page.hasMore, hasMoreOlder: true };
  }

  /**
   * A window centred on `timestampMs`, for jumping straight to a point in time instead
   * of paging into it. Splits `limit` evenly between the newer and older halves; if one
   * side runs dry (the anchor sits at either edge of the buffer) the other side takes
   * the leftover, so a jump into empty space still returns up to `limit` events from
   * whichever edge is closest.
   */
  until(timestampMs: number, limit: number, match: EventPredicate): LogPage {
    this.ensureSorted();

    const anchor = this.timestampIndex(timestampMs);
    const newerLimit = Math.ceil(limit / 2);
    const olderLimit = limit - newerLimit;

    const newer = this.collectForward(anchor, this.events.length, newerLimit, match);
    const olderBudget = olderLimit + (newerLimit - newer.events.length);
    const older = this.collect(0, anchor, olderBudget, match);
    const newerSpare = olderBudget - older.events.length;
    const filledNewer =
      newerSpare > 0
        ? this.collectForward(anchor, this.events.length, newerLimit + newerSpare, match)
        : newer;

    return {
      events: [...filledNewer.events, ...older.events],
      hasMoreNewer: filledNewer.hasMore,
      hasMoreOlder: older.hasMore,
    };
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

  /** Walks `[floor, end)` backwards, newest first. */
  private collect(floor: number, end: number, limit: number, match: EventPredicate): ScanResult {
    const events: LogEvent[] = [];
    let index = end - 1;

    while (index >= floor && events.length < limit) {
      const stored = this.events[index];

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
  ): ScanResult {
    const events: LogEvent[] = [];
    let index = floor;

    while (index < end && events.length < limit) {
      const stored = this.events[index];

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
