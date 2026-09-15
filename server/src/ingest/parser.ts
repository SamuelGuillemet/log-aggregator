import {
  LOG_LEVELS,
  type LogLevel,
  type LogTableColumn,
  type LogTableSchema,
} from "@log-aggregator/shared";
import type { ParserConfig } from "../config/types.js";
import { parseTimestamp } from "./timestamp.js";

const BASE_FIELDS = new Set(["timestamp", "level", "message"]);
const KNOWN_LEVELS = new Set<string>(LOG_LEVELS);
/** Matches tokens like `status=[200]` or `timeTakenMs=[7]` anywhere in a message. */
const MESSAGE_FIELD_PATTERN = /([A-Za-z0-9_-]{1,64})=\[([^[\]]{0,4096})\]/g;

export interface ParsedLine {
  /** Undefined when the timestamp token is unparseable; the caller supplies a fallback. */
  timestampMs: number | undefined;
  timestampText: string;
  level: LogLevel;
  /** Byte-agnostic index of the message within the original line. */
  messageOffset: number;
  fields: Record<string, string>;
}

export class LogParser {
  private readonly linePattern: RegExp;
  private readonly extraFields: string[];

  constructor(private readonly config: ParserConfig) {
    // The `d` flag yields match indices, which give the message offset for free and
    // remove the need to store the message as a second copy of the line.
    this.linePattern = new RegExp(config.linePattern, "d");
    this.extraFields = Object.keys(config.groups).filter((field) => !BASE_FIELDS.has(field));
  }

  get observability(): ParserConfig["observability"] {
    return this.config.observability;
  }

  parse(line: string): ParsedLine | undefined {
    const match = this.linePattern.exec(line);

    if (!match?.groups) {
      return undefined;
    }

    const timestampText = this.groupValue(match.groups, "timestamp");
    const level = this.groupValue(match.groups, "level").toUpperCase();
    const messageOffset = this.messageOffset(match);
    const fields = this.readExtraFields(match.groups);

    if (this.config.messageFields) {
      // Named groups win: a line's structured columns are more trustworthy than a
      // same-named token that happens to appear in free-form message text.
      for (const [key, value] of extractMessageFields(line.slice(messageOffset))) {
        if (!(key in fields)) {
          fields[key] = value;
        }
      }
    }

    return {
      fields,
      level: KNOWN_LEVELS.has(level) ? (level as LogLevel) : "UNKNOWN",
      messageOffset,
      timestampMs: parseTimestamp(timestampText),
      timestampText,
    };
  }

  schema(): LogTableSchema {
    return {
      columns: [
        baseColumn("timestamp", "Time", 188, false),
        baseColumn("sourceName", "Source", 240, true),
        baseColumn("level", "Level", 90, false),
        ...this.extraFields.map((field): LogTableColumn => ({
          field,
          groupId: "parsed",
          groupLabel: "Parsed fields",
          hideable: true,
          id: field,
          label: toLabel(field),
          width: 180,
        })),
        baseColumn("message", "Message", 520, false),
      ],
    };
  }

  private messageOffset(match: RegExpExecArray): number {
    const groupName = this.config.groups.message ?? "message";

    return match.indices?.groups?.[groupName]?.[0] ?? 0;
  }

  private groupValue(groups: Record<string, string | undefined>, field: string): string {
    return groups[this.config.groups[field] ?? field] ?? "";
  }

  private readExtraFields(groups: Record<string, string | undefined>): Record<string, string> {
    const fields: Record<string, string> = {};

    for (const field of this.extraFields) {
      const value = this.groupValue(groups, field);

      if (value) {
        fields[field] = value;
      }
    }

    return fields;
  }
}

function baseColumn(
  field: string,
  label: string,
  width: number,
  hideable: boolean,
): LogTableColumn {
  return { field, groupId: "base", groupLabel: "Base", hideable, id: field, label, width };
}

/** Every `key=[value]` token in `message`, in order of appearance. */
function extractMessageFields(message: string): Array<[string, string]> {
  return [...message.matchAll(MESSAGE_FIELD_PATTERN)].map((match) => [match[1], match[2]]);
}

function toLabel(field: string): string {
  return field
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => (word.toLowerCase() === "id" ? "ID" : word[0].toUpperCase() + word.slice(1)))
    .join(" ");
}
