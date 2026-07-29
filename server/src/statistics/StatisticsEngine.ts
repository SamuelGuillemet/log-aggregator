import type {
  LogEvent,
  LogSource,
  StatsSnapshot,
} from "@log-aggregator/shared";

export class StatisticsEngine {
  private eventTimes: number[] = [];
  private warnings = 0;
  private errors = 0;
  private parserFailures = 0;
  private sources: LogSource[] = [];
  private watchedFiles = 0;

  setSources(sources: LogSource[]): void {
    this.sources = sources;
  }

  reset(sources: LogSource[] = []): void {
    this.eventTimes = [];
    this.warnings = 0;
    this.errors = 0;
    this.parserFailures = 0;
    this.sources = sources;
    this.watchedFiles = 0;
  }

  setWatchedFiles(count: number): void {
    this.watchedFiles = count;
  }

  recordEvent(event: LogEvent): void {
    const now = Date.now();
    this.eventTimes.push(now);
    this.eventTimes = this.eventTimes.filter(
      (eventTime) => now - eventTime <= 1_000,
    );

    if (event.level === "WARN") {
      this.warnings += 1;
    }

    if (event.level === "ERROR" || event.level === "FATAL") {
      this.errors += 1;
    }
  }

  recordParserFailure(): void {
    this.parserFailures += 1;
  }

  snapshot(): StatsSnapshot {
    return {
      eventsPerSecond: this.eventTimes.length,
      warnings: this.warnings,
      errors: this.errors,
      activeInstances: this.sources.length,
      watchedFiles: this.watchedFiles,
      parserFailures: this.parserFailures,
      memoryUsageMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    };
  }
}
