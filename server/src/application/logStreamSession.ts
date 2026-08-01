import { open, readFile, stat } from "node:fs/promises";

import type { LogEvent, LogSource } from "@log-aggregator/shared";

import type { LogLineParser } from "../domain/logParser.js";

export interface StreamSessionCallbacks {
  onContinuationDropped: (filePath: string) => void;
  onEvent: (event: LogEvent, emitLive: boolean) => void;
}

export class LogStreamSession {
  private readonly lastEventsByFile = new Map<string, LogEvent>();
  private readonly positions = new Map<string, number>();

  constructor(
    private readonly parser: LogLineParser,
    private readonly callbacks: StreamSessionCallbacks,
  ) {}

  clear(): void {
    this.lastEventsByFile.clear();
    this.positions.clear();
  }

  removeFileState(source: LogSource, filePath: string): void {
    this.positions.delete(filePath);
    this.lastEventsByFile.delete(fileStateKey(source, filePath));
  }

  async processWholeFile(
    source: LogSource,
    filePath: string,
    emitLive: boolean,
  ): Promise<void> {
    const content = await readFile(filePath, "utf8");
    const fileStats = await stat(filePath);

    this.processContent(source, filePath, content, emitLive);
    this.positions.set(filePath, fileStats.size);
  }

  async processTail(
    source: LogSource,
    filePath: string,
    emitLive: boolean,
  ): Promise<void> {
    const fileStats = await stat(filePath);
    const previousPosition = this.positions.get(filePath) ?? 0;
    const start = fileStats.size >= previousPosition ? previousPosition : 0;

    if (fileStats.size === start) {
      this.positions.set(filePath, fileStats.size);
      return;
    }

    const fileHandle = await open(filePath, "r");

    try {
      const buffer = Buffer.alloc(fileStats.size - start);
      await fileHandle.read(buffer, 0, buffer.length, start);
      this.processContent(source, filePath, buffer.toString("utf8"), emitLive);
      this.positions.set(filePath, fileStats.size);
    } finally {
      await fileHandle.close();
    }
  }

  private processContent(
    source: LogSource,
    filePath: string,
    content: string,
    emitLive: boolean,
  ): void {
    for (const line of splitLogLines(content)) {
      this.processLine(source, filePath, line, emitLive);
    }
  }

  private processLine(
    source: LogSource,
    filePath: string,
    line: string,
    emitLive: boolean,
  ): void {
    const event = this.parser.parseLine(line, source, filePath);
    const stateKey = fileStateKey(source, filePath);

    if (event) {
      this.lastEventsByFile.set(stateKey, event);
      this.callbacks.onEvent(event, emitLive);
      return;
    }

    const previousEvent = this.lastEventsByFile.get(stateKey);

    if (!previousEvent) {
      this.callbacks.onContinuationDropped(filePath);
      return;
    }

    this.parser.appendContinuation(previousEvent, line);
    this.callbacks.onEvent(previousEvent, emitLive);
  }
}

function splitLogLines(content: string): string[] {
  const lines = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");

  if (lines.at(-1) === "") {
    lines.pop();
  }

  return lines;
}

function fileStateKey(source: LogSource, filePath: string): string {
  return `${source.id}:${filePath}`;
}
