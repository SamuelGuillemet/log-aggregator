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

  parse(line: string): ParsedLine | undefined {
    const match = this.linePattern.exec(line);

    if (!match?.groups) {
      return undefined;
    }

    const timestampText = this.groupValue(match.groups, "timestamp");
    const level = this.groupValue(match.groups, "level").toUpperCase();

    return {
      fields: this.readExtraFields(match.groups),
      level: KNOWN_LEVELS.has(level) ? (level as LogLevel) : "UNKNOWN",
      messageOffset: this.messageOffset(match),
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

function toLabel(field: string): string {
  return field
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => (word.toLowerCase() === "id" ? "ID" : word[0].toUpperCase() + word.slice(1)))
    .join(" ");
}
