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

  constructor(private readonly maxSize: number) {}

  add(event: LogEvent): void {
    this.events.push(event);

    this.events.sort(compareLogEventsNewestFirst);

    while (this.events.length > this.maxSize) {
      this.events.shift();
    }
  }

  clear(): void {
    this.events.length = 0;
  }

  getPage(
    query: LogHistoryQuery | undefined,
    filter: Partial<LogFilter> | undefined,
  ): LogPage {
    const events = this.events.filter((event) =>
      eventMatchesFilter(event, filter),
    );

    let page: LogEvent[] = [];

    if (query?.type === "cursor") {
      const limit = clampLimit(query.limit);
      const cursorIndex = events.findIndex(
        (event) => event.id === query.beforeCursor.id,
      );

      if (cursorIndex >= 0) {
        // Return events after the cursor.
        page = events.slice(cursorIndex + 1, cursorIndex + 1 + limit);
      }
    } else if (query?.type === "timestamp") {
      const timestamp = new Date(query.fromTimestamp).getTime();

      const startIndex = events.findIndex(
        (event) => new Date(event.timestamp).getTime() <= timestamp,
      );

      if (startIndex >= 0) {
        // Return all events from most recent to the timestamp
        page = events.slice(0, startIndex + 1);
      } else {
        // If no events are found before the timestamp, return all events.
        page = events.slice();
      }
    } else {
      // Return the most recent events if no query is provided.
      page = events.slice(0, defaultPageSize);
    }

    return {
      append: "bottom",
      events: page,
      hasMore: events.length > page.length,
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

export function eventMatchesFilter(
  event: LogEvent,
  filter: Partial<LogFilter> | undefined,
): boolean {
  const normalizedFilter = {
    ...defaultLogFilter,
    ...filter,
    levels: filter?.levels ?? [],
  };

  if (
    normalizedFilter.levels.length > 0 &&
    !normalizedFilter.levels.includes(event.level)
  ) {
    return false;
  }

  if (!normalizedFilter.text) {
    return true;
  }

  const matchesText = createTextMatcher(normalizedFilter);

  return [
    event.timestamp,
    event.sourceName,
    event.level,
    event.message,
    ...Object.values(event.fields),
  ].some(matchesText);
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
