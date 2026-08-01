import type { LogCursor, LogEvent } from "@log-aggregator/shared";

export function compareLogEventsNewestFirst(
  left: LogEvent,
  right: LogEvent,
): number {
  const timestampOrder = compareTimestamp(right.timestamp, left.timestamp);

  if (timestampOrder !== 0) {
    return timestampOrder;
  }

  return (
    compareTimestamp(right.receivedAt, left.receivedAt) ||
    right.filePath.localeCompare(left.filePath) ||
    right.id.localeCompare(left.id)
  );
}

export function toLogCursor(event: LogEvent): LogCursor {
  return {
    filePath: event.filePath,
    id: event.id,
    receivedAt: event.receivedAt,
    timestamp: event.timestamp,
  };
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
