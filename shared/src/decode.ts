/**
 * Minimal decoders for untrusted input. Every boundary (WebSocket frames, HTTP
 * bodies, config files, localStorage) goes through these instead of a cast, so a
 * malformed payload produces an error value rather than a crash deep in the code.
 */

export type Decoded<T> = { ok: true; value: T } | { ok: false; error: string };

export function ok<T>(value: T): Decoded<T> {
  return { ok: true, value };
}

export function fail<T = never>(error: string): Decoded<T> {
  return { error, ok: false };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function decodeRecord(value: unknown, path: string): Decoded<Record<string, unknown>> {
  return isRecord(value) ? ok(value) : fail(`${path} must be an object`);
}

export function decodeString(value: unknown, path: string, maxLength = 4_096): Decoded<string> {
  if (typeof value !== "string") {
    return fail(`${path} must be a string`);
  }

  return value.length > maxLength ? fail(`${path} exceeds ${maxLength} characters`) : ok(value);
}

export function decodeBoolean(value: unknown, path: string): Decoded<boolean> {
  return typeof value === "boolean" ? ok(value) : fail(`${path} must be a boolean`);
}

export function decodeInteger(
  value: unknown,
  path: string,
  min: number,
  max: number,
): Decoded<number> {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fail(`${path} must be a finite number`);
  }

  const truncated = Math.trunc(value);

  return truncated < min || truncated > max
    ? fail(`${path} must be between ${min} and ${max}`)
    : ok(truncated);
}

export function decodeArray<T>(
  value: unknown,
  path: string,
  maxLength: number,
  decodeItem: (item: unknown, itemPath: string) => Decoded<T>,
): Decoded<T[]> {
  if (!Array.isArray(value)) {
    return fail(`${path} must be an array`);
  }

  if (value.length > maxLength) {
    return fail(`${path} exceeds ${maxLength} entries`);
  }

  const items: T[] = [];

  for (const [index, item] of value.entries()) {
    const decoded = decodeItem(item, `${path}[${index}]`);

    if (!decoded.ok) {
      return decoded;
    }

    items.push(decoded.value);
  }

  return ok(items);
}

export function decodeLiteralUnion<const T extends readonly string[]>(
  value: unknown,
  path: string,
  allowed: T,
): Decoded<T[number]> {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? ok(value as T[number])
    : fail(`${path} must be one of ${allowed.join(", ")}`);
}

/** Applies a decoder only when the key is present, otherwise yields the fallback. */
export function decodeOptional<T>(
  value: unknown,
  fallback: T,
  decode: (present: unknown) => Decoded<T>,
): Decoded<T> {
  return value === undefined ? ok(fallback) : decode(value);
}

export function decodeStringMap(
  value: unknown,
  path: string,
  maxEntries = 128,
): Decoded<Record<string, string>> {
  const record = decodeRecord(value, path);

  if (!record.ok) {
    return record;
  }

  const entries = Object.entries(record.value);

  if (entries.length > maxEntries) {
    return fail(`${path} exceeds ${maxEntries} entries`);
  }

  for (const [key, entry] of entries) {
    if (typeof entry !== "string") {
      return fail(`${path}.${key} must be a string`);
    }
  }

  return ok(Object.fromEntries(entries) as Record<string, string>);
}
