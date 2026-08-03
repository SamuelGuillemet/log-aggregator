import type {
  LogEvent,
  LogFilter,
  LogHistoryQuery,
  LogPage,
  LogSnapshot,
  LogSource,
  LogTableSchema,
} from "@log-aggregator/shared";

const defaultPageSize = 50;

export const defaultLogFilter: LogFilter = {
  caseSensitive: false,
  levels: [],
  regex: false,
  text: "",
};

export class LogHistoryBuffer {
  private readonly events: LogEvent[] = [];
  private readonly eventsById = new Map<string, LogEvent>();
  private isSorted = true;

  add(event: LogEvent): void {
    const existing = this.eventsById.get(event.id);

    if (existing) {
      if (existing !== event) {
        Object.assign(existing, event);
      }

      return;
    }

    this.events.push(event);
    this.eventsById.set(event.id, event);
    this.isSorted = false;
  }

  clear(): void {
    this.events.length = 0;
    this.eventsById.clear();
    this.isSorted = true;
  }

  getPage(
    query: LogHistoryQuery | undefined,
    filter: Partial<LogFilter> | undefined,
  ): LogPage {
    this.ensureSorted();
    const matchesEvent = createEventMatcher(filter);
    const events = this.events.filter(matchesEvent);

    let page: LogEvent[] = [];
    let hasMore = false;

    if (query?.type === "cursor") {
      const limit = clampLimit(query.limit);
      const cursorIndex = events.findIndex(
        (event) => event.id === query.beforeCursor.id,
      );

      if (cursorIndex >= 0) {
        // Return events after the cursor.
        page = events.slice(cursorIndex + 1, cursorIndex + 1 + limit);
        hasMore = cursorIndex + 1 + page.length < events.length;
      }
    } else if (query?.type === "timestamp") {
      const timestamp = new Date(query.fromTimestamp).getTime();

      const startIndex = events.findIndex(
        (event) => new Date(event.timestamp).getTime() <= timestamp,
      );

      if (startIndex >= 0) {
        // Return all events from most recent to the timestamp
        page = events.slice(0, startIndex + 1);
        hasMore = startIndex + 1 < events.length;
      } else {
        // If no events are found before the timestamp, return all events.
        page = events.slice();
        hasMore = false;
      }
    } else {
      // Return the most recent events if no query is provided.
      page = events.slice(0, defaultPageSize);
      hasMore = events.length > page.length;
    }

    return {
      append: "bottom",
      events: page,
      hasMore,
    };
  }

  getSnapshot(
    filter: Partial<LogFilter> | undefined,
    sources: LogSource[],
    schema: LogTableSchema,
  ): LogSnapshot {
    const page = this.getPage(undefined, filter);

    return {
      events: page.events,
      hasMore: page.hasMore,
      schema,
      sources,
    };
  }

  private ensureSorted(): void {
    if (this.isSorted) {
      return;
    }

    this.events.sort(compareLogEventsNewestFirst);
    this.isSorted = true;
  }
}

export function mergeLogFilter(
  currentFilter: LogFilter,
  nextFilter: Partial<LogFilter>,
): LogFilter {
  return {
    ...defaultLogFilter,
    ...currentFilter,
    ...nextFilter,
    levels: nextFilter?.levels ?? [],
  };
}

export function createEventMatcher(
  filter: Partial<LogFilter> | undefined,
): (event: LogEvent) => boolean {
  const normalizedFilter = {
    ...defaultLogFilter,
    ...filter,
    levels: filter?.levels ?? [],
  };
  const hasLevelFilter = normalizedFilter.levels.length > 0;

  if (!normalizedFilter.text) {
    return (event) =>
      !hasLevelFilter || normalizedFilter.levels.includes(event.level);
  }

  const matchesText = createTextMatcher(normalizedFilter);

  return (event) => {
    if (hasLevelFilter && !normalizedFilter.levels.includes(event.level)) {
      return false;
    }

    const fullText = [
      event.timestamp,
      event.sourceName,
      event.level,
      event.message,
      ...Object.values(event.fields),
    ].join(" ");

    return matchesText(fullText);
  };
}

function createTextMatcher(filter: LogFilter): (value: string) => boolean {
  if (filter.regex) {
    try {
      const regex = new RegExp(filter.text, filter.caseSensitive ? "" : "i");
      return (value) => regex.test(value);
    } catch {
      // Fall back to plain text includes when regex is invalid.
    }
  }

  const text = filter.caseSensitive ? filter.text : filter.text.toLowerCase();

  return (value) =>
    (filter.caseSensitive ? value : value.toLowerCase()).includes(text);
}

function clampLimit(limit: number | undefined): number {
  return Math.max(1, Math.min(1_000, Math.trunc(limit ?? defaultPageSize)));
}

function compareLogEventsNewestFirst(left: LogEvent, right: LogEvent): number {
  return compareTimestamp(right.timestamp, left.timestamp);
}

function compareTimestamp(left: string, right: string): number {
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);

  return leftTime - rightTime;
}
