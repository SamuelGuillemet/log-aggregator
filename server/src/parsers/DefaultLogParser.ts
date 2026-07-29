import { randomUUID } from "node:crypto";
import path from "node:path";

import type { LogEvent, LogLevel } from "@log-aggregator/shared";

import type { ParserConfig } from "../config/configLoader.js";
import type { LogParser, ParserContext, ParserResult } from "./Parser.js";

export class DefaultLogParser implements LogParser {
  readonly name: string;
  private readonly supportedFilePattern: RegExp;
  private readonly linePattern: RegExp;

  constructor(private readonly config: ParserConfig) {
    this.name = config.name;
    this.supportedFilePattern = new RegExp(config.filePattern, "i");
    this.linePattern = new RegExp(config.linePattern);
  }

  supports(filePath: string): boolean {
    return this.supportedFilePattern.test(path.basename(filePath));
  }

  parseLine(line: string, context: ParserContext): ParserResult {
    const match = this.linePattern.exec(line);

    if (!match?.groups) {
      return {
        parserFailure: true,
        event: this.createEvent(context, {
          timestamp: new Date().toISOString(),
          level: "WARN",
          message: `Malformed log line: ${line}`,
          raw: line,
        }),
      };
    }

    const message = match.groups[this.config.groups.message] ?? "";

    return {
      parserFailure: false,
      event: this.createEvent(context, {
        timestamp: normalizeTimestamp(
          match.groups[this.config.groups.timestamp],
        ),
        level: normalizeLevel(match.groups[this.config.groups.level]),
        thread: getOptionalGroup(match.groups, this.config.groups.thread),
        logger: getOptionalGroup(match.groups, this.config.groups.logger),
        message,
        raw: line,
      }),
    };
  }

  getFilePattern(): RegExp {
    return this.supportedFilePattern;
  }

  private createEvent(
    context: ParserContext,
    input: Partial<LogEvent> &
      Pick<LogEvent, "timestamp" | "level" | "message" | "raw">,
  ): LogEvent {
    return {
      id: randomUUID(),
      timestamp: input.timestamp,
      receivedAt: new Date().toISOString(),
      sourceId: context.source.id,
      sourceName: context.source.name,
      filePath: context.filePath,
      instance: context.source.name,
      level: input.level,
      thread: input.thread,
      logger: input.logger,
      message: input.message,
      raw: input.raw,
      parser: this.name,
    };
  }
}

function normalizeTimestamp(value: string): string {
  return new Date(value.replace(",", ".").replace(" ", "T")).toISOString();
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

function getOptionalGroup(
  groups: Record<string, string>,
  key: string | undefined,
): string | undefined {
  return key ? groups[key] : undefined;
}
