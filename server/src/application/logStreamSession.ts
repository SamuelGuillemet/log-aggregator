import { createReadStream } from "node:fs";
import { open, stat } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { createInterface } from "node:readline";

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
    const startedAt = performance.now();
    const readStream = createReadStream(filePath, { encoding: "utf8" });
    const reader = createInterface({
      crlfDelay: Number.POSITIVE_INFINITY,
      input: readStream,
    });
    let lineCount = 0;

    try {
      for await (const line of reader) {
        lineCount += 1;
        this.processLine(source, filePath, line, emitLive);
      }
    } finally {
      reader.close();
      readStream.destroy();
    }

    const fileStats = await stat(filePath);
    this.positions.set(filePath, fileStats.size);

    const durationMs = performance.now() - startedAt;
    console.info(
      `[timing] stream.processWholeFile file=${filePath} lines=${lineCount} bytes=${fileStats.size} ms=${durationMs.toFixed(1)}`,
    );
  }

  async processTail(
    source: LogSource,
    filePath: string,
    emitLive: boolean,
  ): Promise<void> {
    const startedAt = performance.now();
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
      const processedLines = this.processContent(
        source,
        filePath,
        buffer.toString("utf8"),
        emitLive,
      );
      this.positions.set(filePath, fileStats.size);

      const durationMs = performance.now() - startedAt;
      console.info(
        `[timing] stream.processTail file=${filePath} bytes=${buffer.length} lines=${processedLines} ms=${durationMs.toFixed(1)}`,
      );
    } finally {
      await fileHandle.close();
    }
  }

  private processContent(
    source: LogSource,
    filePath: string,
    content: string,
    emitLive: boolean,
  ): number {
    const lines = splitLogLines(content);

    for (const line of lines) {
      this.processLine(source, filePath, line, emitLive);
    }

    return lines.length;
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
