import type { LogEvent, LogSource } from "@log-aggregator/shared";

export interface ParserContext {
  filePath: string;
  source: LogSource;
}

export interface ParserResult {
  event: LogEvent;
  parserFailure: boolean;
}

export interface LogParser {
  readonly name: string;
  supports(filePath: string): boolean;
  parseLine(line: string, context: ParserContext): ParserResult;
  getFilePattern(): RegExp;
}
