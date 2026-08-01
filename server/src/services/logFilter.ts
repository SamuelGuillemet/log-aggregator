import type { LogEvent, LogFilter, LogLevel } from "@log-aggregator/shared";

export const defaultLogFilter: LogFilter = {
  caseSensitive: false,
  levels: [],
  regex: false,
  sourceIds: [],
  text: "",
};

export function mergeLogFilter(
  filter: LogFilter,
  update: Partial<LogFilter>,
): LogFilter {
  return { ...filter, ...update };
}

export function filterLogEvents(
  events: readonly LogEvent[],
  filter: LogFilter,
): LogEvent[] {
  return events.filter((event) => matchesLogFilter(event, filter));
}

export function matchesLogFilter(event: LogEvent, filter: LogFilter): boolean {
  if (
    filter.sourceIds.length > 0 &&
    !filter.sourceIds.includes(event.sourceId)
  ) {
    return false;
  }

  if (filter.levels.length > 0 && !matchesLevel(event.level, filter.levels)) {
    return false;
  }

  if (!filter.text) {
    return true;
  }

  const searchable = getSearchableText(event);

  if (filter.regex) {
    try {
      return new RegExp(filter.text, filter.caseSensitive ? "" : "i").test(
        searchable,
      );
    } catch {
      return containsText(searchable, filter.text, filter.caseSensitive);
    }
  }

  return containsText(searchable, filter.text, filter.caseSensitive);
}

function matchesLevel(level: LogLevel, levels: LogLevel[]): boolean {
  return levels.includes(level);
}

function getSearchableText(event: LogEvent): string {
  return [
    event.timestamp,
    event.sourceName,
    event.level,
    event.message,
    ...Object.values(event.fields),
  ].join(" ");
}

function containsText(
  value: string,
  needle: string,
  caseSensitive: boolean,
): boolean {
  return caseSensitive
    ? value.includes(needle)
    : value.toLowerCase().includes(needle.toLowerCase());
}
