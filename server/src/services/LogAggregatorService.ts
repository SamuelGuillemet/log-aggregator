import type {
  LogEvent,
  LogSource,
  SourceOptions,
  SourceSelection,
  StatsSnapshot,
} from "@log-aggregator/shared";

import {
  loadEnvironmentMatrix,
  loadParserConfig,
} from "../config/configLoader.js";
import {
  getSourceOptions,
  resolveLogSources,
} from "../config/sourceResolver.js";
import { EventBus } from "../events/EventBus.js";
import { DefaultLogParser } from "../parsers/DefaultLogParser.js";
import type { LogParser } from "../parsers/Parser.js";
import { StatisticsEngine } from "../statistics/StatisticsEngine.js";
import { TailReader } from "../tail/TailReader.js";
import { WatchManager } from "../watchers/WatchManager.js";

const maxRecentEvents = Number(
  process.env.LOG_AGGREGATOR_BUFFER_SIZE ?? 10_000,
);

export class LogAggregatorService {
  readonly eventBus = new EventBus();

  private readonly matrix = loadEnvironmentMatrix();
  private readonly parser: LogParser = new DefaultLogParser(loadParserConfig());
  private readonly stats = new StatisticsEngine();
  private readonly tailReader = new TailReader();
  private readonly recentEvents: LogEvent[] = [];
  private activeSources: LogSource[] = [];
  private readonly watchManager = new WatchManager({
    filePattern: this.parser.getFilePattern(),
    onFileChanged: (source, filePath) => this.processFile(source, filePath),
    onWatchedFilesChanged: (count) => {
      this.stats.setWatchedFiles(count);
      this.eventBus.emit("stats", this.stats.snapshot());
    },
    onError: (message, details) =>
      this.eventBus.emit("error", { message, details }),
  });

  getOptions(): SourceOptions {
    return getSourceOptions(this.matrix);
  }

  getSnapshot(): {
    events: LogEvent[];
    stats: StatsSnapshot;
    sources: LogSource[];
  } {
    return {
      events: this.recentEvents,
      stats: this.stats.snapshot(),
      sources: this.activeSources,
    };
  }

  async selectSources(selection: SourceSelection): Promise<void> {
    this.activeSources = resolveLogSources(this.matrix, selection);
    this.recentEvents.length = 0;
    this.tailReader.reset();
    this.stats.reset(this.activeSources);
    await this.watchManager.watchSources(this.activeSources);
    this.eventBus.emit("stats", this.stats.snapshot());
  }

  async stop(): Promise<void> {
    this.activeSources = [];
    this.recentEvents.length = 0;
    this.tailReader.reset();
    this.stats.reset();
    await this.watchManager.stop();
    this.eventBus.emit("stats", this.stats.snapshot());
  }

  private async processFile(
    source: LogSource,
    filePath: string,
  ): Promise<void> {
    if (!this.parser.supports(filePath)) {
      return;
    }

    const lines = await this.tailReader.readAppendedLines(filePath);

    for (const line of lines) {
      const result = this.parser.parseLine(line, { source, filePath });

      if (result.parserFailure) {
        this.stats.recordParserFailure();
      }

      this.recordEvent(result.event);
    }

    this.eventBus.emit("stats", this.stats.snapshot());
  }

  private recordEvent(event: LogEvent): void {
    this.recentEvents.push(event);

    if (this.recentEvents.length > maxRecentEvents) {
      this.recentEvents.splice(0, this.recentEvents.length - maxRecentEvents);
    }

    this.stats.recordEvent(event);
    this.eventBus.emit("log", event);
  }
}
