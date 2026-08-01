import { randomUUID } from "node:crypto";

import type {
  LogEvent,
  LogFieldGroup,
  LogLevel,
  LogSource,
} from "@log-aggregator/shared";

import type { ParserConfig } from "../config/configLoader.js";

export type ParserContext = {
  filePath: string;
  source: LogSource;
};

export class Parser {
  private readonly linePattern: RegExp;

  constructor(private readonly config: ParserConfig) {
    this.linePattern = new RegExp(config.linePattern);
  }

  parseLine(line: string, context: ParserContext): LogEvent | undefined {
    const match = this.linePattern.exec(line);

    if (!match?.groups) {
      return undefined;
    }

    const fields = this.parseConfiguredFields(match.groups);
    const message = match.groups[this.config.groups.message] ?? "";

    return {
      ...fields,
      id: randomUUID(),
      timestamp: normalizeTimestamp(match.groups[this.config.groups.timestamp]),
      receivedAt: new Date().toISOString(),
      sourceId: context.source.id,
      sourceName: context.source.name,
      filePath: context.filePath,
      instance: context.source.name,
      level: normalizeLevel(match.groups[this.config.groups.level]),
      message,
      raw: line,
    };
  }

  getFieldGroups(): LogFieldGroup[] {
    const fields = Object.keys(this.config.groups)
      .filter(isParserField)
      .map((field) => ({
        id: field,
        label: getFieldLabel(field),
        field,
        width: getFieldWidth(field),
        hideable: true,
      }));

    return fields.length > 0
      ? [{ id: "parser", label: "Parsed fields", fields }]
      : [];
  }

  private parseConfiguredFields(
    groups: Record<string, string>,
  ): Record<string, string> {
    const fields: Record<string, string> = {};

    for (const [field, groupName] of Object.entries(this.config.groups)) {
      if (!groupName || !isParserField(field)) {
        continue;
      }

      fields[field] = groups[groupName] ?? "";
    }

    return fields;
  }
}

function normalizeTimestamp(value: string): string {
  return value.replace(",", ".").replace(" ", "T");
}

function normalizeLevel(value: string): LogLevel {
  const levels: LogLevel[] = [
    "TRACE",
    "DEBUG",
    "INFO",
    "WARN",
    "ERROR",
    "FATAL",
  ];
  return levels.includes(value as LogLevel) ? (value as LogLevel) : "UNKNOWN";
}

function isParserField(field: string): boolean {
  return field !== "timestamp" && field !== "level" && field !== "message";
}

function getFieldLabel(field: string): string {
  return field
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function getFieldWidth(_field: string): number {
  return 160;
}
