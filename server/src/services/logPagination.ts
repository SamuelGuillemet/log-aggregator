import type {
  LogCursor,
  LogEvent,
  LogFilter,
  LogHistoryQuery,
  LogPage,
} from "@log-aggregator/shared";

import { defaultLogFilter, filterLogEvents } from "./logFilter.js";

const defaultPageSize = 50;
const maxPageSize = 1_000;

export function getLogEventPage(
  events: readonly LogEvent[],
  filter: LogFilter = defaultLogFilter,
  request: LogHistoryQuery = {},
): LogPage {
  const limit = getPageLimit(request.limit);
  const matchingEvents = filterLogEvents(events, filter)
    .filter((event) => matchesPageRequest(event, request))
    .sort(compareLogEventsDescending);
  const pageEvents = matchingEvents.slice(0, limit);
  const lastEvent = pageEvents.at(-1);
  const hasMore = lastEvent
    ? matchingEvents.some((event) =>
        isOlderThanCursor(event, toCursor(lastEvent)),
      )
    : false;

  return {
    append: "bottom",
    events: pageEvents,
    hasMore,
  };
}

function getPageLimit(limit: number | undefined): number {
  if (typeof limit !== "number" || !Number.isFinite(limit)) {
    return defaultPageSize;
  }

  return Math.min(maxPageSize, Math.max(1, Math.floor(limit)));
}

function matchesPageRequest(
  event: LogEvent,
  request: LogHistoryQuery,
): boolean {
  if (request.beforeCursor && !isOlderThanCursor(event, request.beforeCursor)) {
    return false;
  }

  if (
    request.fromTimestamp &&
    !isAtOrAfterTimestamp(event.timestamp, request.fromTimestamp)
  ) {
    return false;
  }

  return true;
}

function toCursor(event: LogEvent): LogCursor {
  return {
    filePath: event.filePath,
    id: event.id,
    receivedAt: event.receivedAt,
    timestamp: event.timestamp,
  };
}

function isOlderThanCursor(event: LogEvent, cursor: LogCursor): boolean {
  return compareEventToCursor(event, cursor) < 0;
}

function compareLogEventsDescending(left: LogEvent, right: LogEvent): number {
  return -compareLogEventsAscending(left, right);
}

function compareLogEventsAscending(left: LogEvent, right: LogEvent): number {
  return (
    compareTimestamp(left.timestamp, right.timestamp) ||
    compareTimestamp(left.receivedAt, right.receivedAt) ||
    left.filePath.localeCompare(right.filePath) ||
    left.id.localeCompare(right.id)
  );
}

function compareEventToCursor(event: LogEvent, cursor: LogCursor): number {
  return (
    compareTimestamp(event.timestamp, cursor.timestamp) ||
    compareTimestamp(event.receivedAt, cursor.receivedAt) ||
    event.filePath.localeCompare(cursor.filePath) ||
    event.id.localeCompare(cursor.id)
  );
}

function isAtOrAfterTimestamp(timestamp: string, minimum: string): boolean {
  const timestampTime = Date.parse(timestamp);
  const minimumTime = Date.parse(minimum);

  if (Number.isFinite(timestampTime) && Number.isFinite(minimumTime)) {
    return timestampTime >= minimumTime;
  }

  return timestamp >= minimum;
}

function compareTimestamp(left: string, right: string): number {
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);
  const leftValid = Number.isFinite(leftTime);
  const rightValid = Number.isFinite(rightTime);

  if (leftValid && rightValid) {
    return leftTime - rightTime;
  }

  if (leftValid !== rightValid) {
    return leftValid ? -1 : 1;
  }

  return left.localeCompare(right);
}
