import type { LogEvent, LogSource } from "@log-aggregator/shared";

export class LogContinuationTracker {
  private readonly latestEventsByFile = new Map<string, LogEvent>();

  appendLine(
    source: LogSource,
    filePath: string,
    line: string,
  ): LogEvent | undefined {
    const event = this.latestEventsByFile.get(getFileKey(source, filePath));

    if (!event) {
      return undefined;
    }

    event.message = `${event.message}\n${line}`;
    event.raw = `${event.raw}\n${line}`;
    event.receivedAt = new Date().toISOString();

    return event;
  }

  clear(): void {
    this.latestEventsByFile.clear();
  }

  remember(source: LogSource, filePath: string, event: LogEvent): void {
    this.latestEventsByFile.set(getFileKey(source, filePath), event);
  }
}

function getFileKey(source: LogSource, filePath: string): string {
  return `${source.id}\u0000${filePath}`;
}
