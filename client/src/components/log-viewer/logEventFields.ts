import type { LogEvent } from "@log-aggregator/shared";

export function getLogEventFieldValue(event: LogEvent, field: string): string {
  return getBaseFieldValue(event, field) ?? event.fields[field] ?? "";
}

function getBaseFieldValue(event: LogEvent, field: string): string | undefined {
  const baseFields: Record<string, string> = {
    filePath: event.filePath,
    id: event.id,
    level: event.level,
    message: event.message,
    raw: event.raw,
    receivedAt: event.receivedAt,
    sourceId: event.sourceId,
    sourceName: event.sourceName,
    timestamp: event.timestamp,
  };

  return baseFields[field];
}
