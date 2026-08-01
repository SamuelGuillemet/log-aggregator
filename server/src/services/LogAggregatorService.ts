import type {
  LogEvent,
  LogFilter,
  LogHistoryQuery,
  LogPage,
  LogSnapshot,
  LogSource,
  SourceOptions,
  SourceSelection,
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
import { Parser } from "../parsers/Parser.js";
import { TailReader } from "../tail/TailReader.js";
import {
  type WatchChangeOptions,
  WatchManager,
} from "../watchers/WatchManager.js";
import { LogContinuationTracker } from "./LogContinuationTracker.js";
import { LogEventBuffer } from "./LogEventBuffer.js";
import { defaultLogFilter } from "./logFilter.js";
import { getLogEventPage } from "./logPagination.js";
import { createLogTableSchema } from "./logSchema.js";

const maxRecentEvents = Number(
  process.env.LOG_AGGREGATOR_BUFFER_SIZE ?? 10_000,
);

export class LogAggregatorService {
  readonly eventBus = new EventBus();

  private readonly matrix = loadEnvironmentMatrix();
  private readonly parser = new Parser(loadParserConfig());
  private readonly tailReader = new TailReader();
  private readonly eventBuffer = new LogEventBuffer(maxRecentEvents);
  private readonly continuationTracker = new LogContinuationTracker();
  private readonly schema = createLogTableSchema(this.parser.getFieldGroups());
  private activeSources: LogSource[] = [];
  private readonly watchManager = new WatchManager({
    onFileChanged: (source, filePath, options) =>
      this.processFile(source, filePath, options),
    onError: (message, details) =>
      this.eventBus.emit("error", { message, details }),
  });

  getOptions(): SourceOptions {
    return getSourceOptions(this.matrix);
  }

  getSnapshot(filter: LogFilter = defaultLogFilter): LogSnapshot {
    const page = this.getEventPage(filter);

    return {
      events: page.events,
      hasMore: page.hasMore,
      schema: this.schema,
      sources: this.activeSources,
    };
  }

  getEventPage(
    filter: LogFilter = defaultLogFilter,
    request: LogHistoryQuery = {},
  ): LogPage {
    return getLogEventPage(this.eventBuffer.getEvents(), filter, request);
  }

  async selectSources(selection: SourceSelection): Promise<void> {
    this.activeSources = resolveLogSources(this.matrix, selection);
    this.eventBuffer.clear();
    this.continuationTracker.clear();
    this.tailReader.reset();
    await this.watchManager.watchSources(this.activeSources);
  }

  async stop(): Promise<void> {
    this.activeSources = [];
    this.eventBuffer.clear();
    this.continuationTracker.clear();
    this.tailReader.reset();
    await this.watchManager.stop();
  }

  private async processFile(
    source: LogSource,
    filePath: string,
    options: WatchChangeOptions,
  ): Promise<void> {
    const lines = await this.tailReader.readAppendedLines(filePath);

    for (const line of lines) {
      const event = this.parser.parseLine(line, { source, filePath });

      if (!event) {
        const updatedEvent = this.continuationTracker.appendLine(
          source,
          filePath,
          line,
        );

        if (updatedEvent && options.broadcast) {
          this.eventBus.emit("log", updatedEvent);
        } else {
          console.warn(
            `Line appended to unknown log event for ${filePath}: ${line}`,
          );
        }

        continue;
      }

      this.continuationTracker.remember(source, filePath, event);
      this.recordEvent(event, options);
    }
  }

  private recordEvent(event: LogEvent, options: WatchChangeOptions): void {
    this.eventBuffer.add(event);

    if (options.broadcast) {
      this.eventBus.emit("log", event);
    }
  }
}
