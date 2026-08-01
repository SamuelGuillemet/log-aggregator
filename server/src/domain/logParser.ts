import { randomUUID } from "node:crypto";

import type {
  LogEvent,
  LogLevel,
  LogSource,
  LogTableColumn,
  LogTableSchema,
} from "@log-aggregator/shared";

import type { ParserConfig } from "../config.js";

const baseParserFields = new Set(["timestamp", "level", "message"]);
const logLevels: Set<LogLevel> = new Set([
  "TRACE",
  "DEBUG",
  "INFO",
  "WARN",
  "ERROR",
  "FATAL",
  "UNKNOWN",
]);

export class LogLineParser {
  private readonly linePattern: RegExp;

  constructor(private readonly config: ParserConfig) {
    this.linePattern = new RegExp(config.linePattern);
  }

  parseLine(
    line: string,
    source: LogSource,
    filePath: string,
  ): LogEvent | undefined {
    const match = this.linePattern.exec(line);

    if (!match?.groups) {
      return undefined;
    }

    const level = this.groupValue(match.groups, "level").toUpperCase();

    return {
      id: randomUUID(),
      fields: this.extraFields(match.groups),
      filePath,
      level: logLevels.has(level as LogLevel) ? (level as LogLevel) : "UNKNOWN",
      message: this.groupValue(match.groups, "message"),
      receivedAt: new Date().toISOString(),
      sourceId: source.id,
      sourceName: source.name,
      timestamp: normalizeTimestamp(this.groupValue(match.groups, "timestamp")),
    };
  }

  appendContinuation(event: LogEvent, line: string): void {
    event.message = `${event.message}\n${line}`;
  }

  getSchema(): LogTableSchema {
    return {
      columns: [
        baseColumn("timestamp", "Time", 188, false),
        baseColumn("sourceName", "Source", 240, true),
        baseColumn("level", "Level", 90, false),
        ...this.extraFieldIds().map((field) => ({
          field,
          groupId: "parsed-fields",
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

  private groupValue(groups: Record<string, string>, field: string): string {
    return groups[this.config.groups[field] ?? field] ?? "";
  }

  private extraFields(groups: Record<string, string>): Record<string, string> {
    return Object.fromEntries(
      this.extraFieldIds()
        .map((field) => [field, this.groupValue(groups, field)])
        .filter(([, value]) => value !== undefined),
    );
  }

  private extraFieldIds(): string[] {
    return Object.keys(this.config.groups).filter(
      (field) => !baseParserFields.has(field),
    );
  }
}

function normalizeTimestamp(timestamp: string): string {
  return timestamp.replace(",", ".").replace(" ", "T");
}

function baseColumn(
  field: string,
  label: string,
  width: number,
  hideable: boolean,
): LogTableColumn {
  return {
    field,
    groupId: "base",
    groupLabel: "Base",
    hideable,
    id: field,
    label,
    width,
  };
}

function toLabel(field: string): string {
  return field
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map(formatLabelWord)
    .join(" ");
}

function formatLabelWord(word: string): string {
  return word.toLowerCase() === "id"
    ? "ID"
    : `${word[0].toUpperCase()}${word.slice(1)}`;
}
