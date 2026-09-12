const TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:[.,](\d{1,9}))?(?:(Z)|([+-])(\d{2}):?(\d{2}))?$/;

/**
 * Parses a log timestamp to epoch millis exactly once, at ingest.
 *
 * `Date.parse` is deliberately avoided: it treats `2026-09-12 23:04:01` as local
 * time and `2026-09-12T23:04:01` as local too, but its handling of non-ISO shapes
 * is implementation defined, and v1 re-ran it inside a sort comparator. Timestamps
 * without an explicit offset are interpreted in the host timezone, which is what a
 * local-first log viewer wants.
 */
export function parseTimestamp(value: string): number | undefined {
  const match = TIMESTAMP_PATTERN.exec(value);

  if (!match) {
    return undefined;
  }

  const [, year, month, day, hour, minute, second, fraction, zulu, sign, offsetHour, offsetMinute] =
    match;
  const millis = fraction ? Number(fraction.slice(0, 3).padEnd(3, "0")) : 0;
  const parts = [
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
    millis,
  ] as const;

  if (!zulu && !sign) {
    const local = new Date(...parts).getTime();

    return Number.isNaN(local) ? undefined : local;
  }

  const utc = Date.UTC(...parts);

  if (zulu) {
    return utc;
  }

  const offsetMs = (Number(offsetHour) * 60 + Number(offsetMinute)) * 60_000;

  return sign === "+" ? utc - offsetMs : utc + offsetMs;
}
