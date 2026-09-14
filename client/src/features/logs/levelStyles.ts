import type { LogLevel } from "@log-aggregator/shared";

/** Severity is the only colour in the interface, so it lives in exactly one place. */
export function levelColor(level: LogLevel): string {
  return `var(--level-${level.toLowerCase()})`;
}

/**
 * Only the levels you are actually hunting get a row wash, and only enough to show
 * a cluster while scrolling fast. Tinting every level turns the table to mud.
 */
export function levelWash(level: LogLevel): string | undefined {
  if (level === "FATAL") {
    return "color-mix(in srgb, var(--level-fatal) 13%, transparent)";
  }

  if (level === "ERROR") {
    return "color-mix(in srgb, var(--level-error) 10%, transparent)";
  }

  return level === "WARN" ? "var(--wash-warn)" : undefined;
}
