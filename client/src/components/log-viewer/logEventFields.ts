import type { LogEvent } from "@log-aggregator/shared";

const sourceFileTokenPattern = /-(serveur|fwk|ui)\.\d{4}-\d{2}-\d{2}(?:-\d+)?\.log$/i;

export function getLogEventFieldValue(event: LogEvent, field: string): string {
  return getBaseFieldValue(event, field) ?? event.fields[field] ?? "";
}

export function getSourceFileToken(filePath: string): string | undefined {
  const fileName = filePath.split(/[\\/]/).pop() ?? filePath;

  return sourceFileTokenPattern.exec(fileName)?.[1]?.toLowerCase();
}

export function getSourceDisplayValue(event: LogEvent): string {
  const token = getSourceFileToken(event.filePath);

  return token ? `${event.sourceName} (${token})` : event.sourceName;
}

function getBaseFieldValue(event: LogEvent, field: string): string | undefined {
  const baseFields: Record<string, string> = {
    filePath: event.filePath,
    id: event.id,
    level: event.level,
    message: event.message,
    receivedAt: event.receivedAt,
    sourceId: event.sourceId,
    sourceName: event.sourceName,
    timestamp: event.timestamp,
  };

  return baseFields[field];
}
