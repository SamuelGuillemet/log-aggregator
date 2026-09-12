import { type LogEvent, logEventMessage } from "@log-aggregator/shared";

/**
 * Resolves a table column's `field` against an event. Base fields are explicit so a
 * parsed field can never shadow one.
 */
export function fieldValue(event: LogEvent, field: string): string {
  switch (field) {
    case "timestamp":
      return event.timestampText;
    case "sourceName":
      return event.sourceName;
    case "level":
      return event.level;
    case "message":
      return logEventMessage(event);
    case "filePath":
      return event.filePath;
    default:
      return event.fields[field] ?? "";
  }
}

export function formatCount(value: number): string {
  // Pinned to en-US: the interface is English, and the host locale was rendering
  // thin-space groupings that read as a typo next to the rest of the copy.
  return value.toLocaleString("en-US");
}

/** The interface speaks the logs' own dialect, not the host locale's. */
export function formatAbsoluteTime(timestampMs: number): string {
  const at = new Date(timestampMs);
  const pad = (value: number, length = 2) => String(value).padStart(length, "0");

  return (
    `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ` +
    `${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}.${pad(at.getMilliseconds(), 3)}`
  );
}

/**
 * A stream covers exactly one date, which the status bar already states, so the
 * table shows only the part that changes. Millis are split out to sit back in the
 * muted tone rather than competing with the seconds.
 */
export function splitTimestamp(timestampText: string): { time: string; millis: string } {
  const match = /(\d{2}:\d{2}:\d{2})(?:[.,](\d{1,3}))?/.exec(timestampText);

  return match ? { millis: match[2] ?? "", time: match[1] } : { millis: "", time: timestampText };
}

/**
 * `Local performance #3 (serveur)` -> `#3 serveur`. The source name is identical on
 * every row of a stream, so the column only needs the part that distinguishes them.
 */
export function compactSource(sourceName: string): string {
  const index = /#(\d+)/.exec(sourceName)?.[1];
  const kind = /\(([^)]+)\)/.exec(sourceName)?.[1];
  const compact = [index && `#${index}`, kind].filter(Boolean).join(" ");

  return compact || sourceName;
}

/** `datetime-local` input value (`YYYY-MM-DDTHH:mm`) to epoch millis. */
export function parseLocalDateTime(value: string): number | undefined {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value)) {
    return undefined;
  }

  const parsed = new Date(value).getTime();

  return Number.isNaN(parsed) ? undefined : parsed;
}

export function splitTerms(value: string): string[] {
  return value
    .split(",")
    .map((term) => term.trim())
    .filter(Boolean);
}
