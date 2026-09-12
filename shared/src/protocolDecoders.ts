import {
  type Decoded,
  decodeArray,
  decodeBoolean,
  decodeInteger,
  decodeOptional,
  decodeRecord,
  decodeString,
  fail,
  ok,
} from "./decode.js";
import {
  EMPTY_FILTER,
  LOG_LEVELS,
  type LogCursor,
  type LogFilter,
  type LogHistoryQuery,
  type LogLevel,
  MAX_PAGE_SIZE,
} from "./logs.js";
import type { ClientMessage } from "./protocol.js";
import type { SourceSelection } from "./sources.js";

const MAX_FILTER_TEXT = 1_024;
const MAX_TERMS = 64;
const MAX_TERM_LENGTH = 256;

export function decodeLogFilter(value: unknown, path = "filter"): Decoded<LogFilter> {
  const record = decodeRecord(value, path);

  if (!record.ok) {
    return record;
  }

  const text = decodeOptional(record.value.text, EMPTY_FILTER.text, (present) =>
    decodeString(present, `${path}.text`, MAX_FILTER_TEXT),
  );

  if (!text.ok) {
    return text;
  }

  const regex = decodeOptional(record.value.regex, false, (present) =>
    decodeBoolean(present, `${path}.regex`),
  );

  if (!regex.ok) {
    return regex;
  }

  const caseSensitive = decodeOptional(record.value.caseSensitive, false, (present) =>
    decodeBoolean(present, `${path}.caseSensitive`),
  );

  if (!caseSensitive.ok) {
    return caseSensitive;
  }

  const levels = decodeOptional(record.value.levels, [] as LogLevel[], (present) =>
    decodeArray(present, `${path}.levels`, LOG_LEVELS.length, (item, itemPath) =>
      typeof item === "string" && (LOG_LEVELS as readonly string[]).includes(item)
        ? ok(item as LogLevel)
        : fail<LogLevel>(`${itemPath} is not a log level`),
    ),
  );

  if (!levels.ok) {
    return levels;
  }

  const includeAny = decodeTerms(record.value.includeAny, `${path}.includeAny`);

  if (!includeAny.ok) {
    return includeAny;
  }

  const includeAll = decodeTerms(record.value.includeAll, `${path}.includeAll`);

  if (!includeAll.ok) {
    return includeAll;
  }

  const excludeAny = decodeTerms(record.value.excludeAny, `${path}.excludeAny`);

  if (!excludeAny.ok) {
    return excludeAny;
  }

  return ok({
    caseSensitive: caseSensitive.value,
    excludeAny: excludeAny.value,
    includeAll: includeAll.value,
    includeAny: includeAny.value,
    levels: [...new Set(levels.value)],
    regex: regex.value,
    text: text.value,
  });
}

function decodeTerms(value: unknown, path: string): Decoded<string[]> {
  return decodeOptional(value, [], (present) =>
    decodeArray(present, path, MAX_TERMS, (item, itemPath) =>
      decodeString(item, itemPath, MAX_TERM_LENGTH),
    ),
  );
}

export function decodeSourceSelection(
  value: unknown,
  path = "selection",
): Decoded<SourceSelection> {
  const record = decodeRecord(value, path);

  if (!record.ok) {
    return record;
  }

  const sourceId = decodeString(record.value.sourceId, `${path}.sourceId`, 128);

  if (!sourceId.ok) {
    return sourceId;
  }

  const project = decodeString(record.value.project, `${path}.project`, 256);

  if (!project.ok) {
    return project;
  }

  const date = decodeString(record.value.date, `${path}.date`, 10);

  if (!date.ok) {
    return date;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date.value)) {
    return fail(`${path}.date must be YYYY-MM-DD`);
  }

  return ok({
    date: date.value,
    project: project.value.trim(),
    sourceId: sourceId.value,
  });
}

export function decodeClientMessage(raw: string): Decoded<ClientMessage> {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return fail("message is not valid JSON");
  }

  const record = decodeRecord(parsed, "message");

  if (!record.ok) {
    return record;
  }

  switch (record.value.type) {
    case "subscribe": {
      const selection = decodeSourceSelection(record.value.selection);

      return selection.ok ? ok({ selection: selection.value, type: "subscribe" }) : selection;
    }
    case "unsubscribe":
      return ok({ type: "unsubscribe" });
    case "pause":
      return ok({ type: "pause" });
    case "resume":
      return ok({ type: "resume" });
    case "ping":
      return ok({ type: "ping" });
    case "filter": {
      const filter = decodeLogFilter(record.value.filter);

      return filter.ok ? ok({ filter: filter.value, type: "filter" }) : filter;
    }
    default:
      return fail(`unknown message type: ${describeType(record.value.type)}`);
  }
}

export function decodeLogCursor(value: unknown, path = "cursor"): Decoded<LogCursor> {
  const record = decodeRecord(value, path);

  if (!record.ok) {
    return record;
  }

  const timestampMs = decodeInteger(
    record.value.timestampMs,
    `${path}.timestampMs`,
    0,
    Number.MAX_SAFE_INTEGER,
  );

  if (!timestampMs.ok) {
    return timestampMs;
  }

  const sourceId = decodeString(record.value.sourceId, `${path}.sourceId`, 128);

  if (!sourceId.ok) {
    return sourceId;
  }

  const sourceSeq = decodeInteger(
    record.value.sourceSeq,
    `${path}.sourceSeq`,
    0,
    Number.MAX_SAFE_INTEGER,
  );

  if (!sourceSeq.ok) {
    return sourceSeq;
  }

  return ok({
    sourceId: sourceId.value,
    sourceSeq: sourceSeq.value,
    timestampMs: timestampMs.value,
  });
}

export function decodeHistoryQuery(value: unknown, path = "query"): Decoded<LogHistoryQuery> {
  const record = decodeRecord(value, path);

  if (!record.ok) {
    return record;
  }

  const limit = decodeInteger(record.value.limit, `${path}.limit`, 1, MAX_PAGE_SIZE);

  if (!limit.ok) {
    return limit;
  }

  switch (record.value.type) {
    case "before": {
      const cursor = decodeLogCursor(record.value.cursor, `${path}.cursor`);

      return cursor.ok ? ok({ cursor: cursor.value, limit: limit.value, type: "before" }) : cursor;
    }
    case "until": {
      const timestampMs = decodeInteger(
        record.value.timestampMs,
        `${path}.timestampMs`,
        0,
        Number.MAX_SAFE_INTEGER,
      );

      return timestampMs.ok
        ? ok({ limit: limit.value, timestampMs: timestampMs.value, type: "until" })
        : timestampMs;
    }
    default:
      return fail(`${path}.type must be "before" or "until"`);
  }
}

function describeType(value: unknown): string {
  return typeof value === "string" ? JSON.stringify(value.slice(0, 64)) : typeof value;
}
