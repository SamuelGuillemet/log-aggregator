import type {
  LogCursor,
  LogEvent,
  LogFieldGroup,
  LogFilter,
  LogPage,
  LogPageRequest,
  LogSnapshot,
  LogSource,
  LogTableSchema,
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
import { defaultLogFilter, filterLogEvents } from "./logFilter.js";

const maxRecentEvents = Number(
  process.env.LOG_AGGREGATOR_BUFFER_SIZE ?? 10_000,
);
const defaultPageSize = 50;
const maxPageSize = 1_000;

export class LogAggregatorService {
  readonly eventBus = new EventBus();

  private readonly matrix = loadEnvironmentMatrix();
  private readonly parser = new Parser(loadParserConfig());
  private readonly tailReader = new TailReader();
  private readonly recentEvents: LogEvent[] = [];
  private readonly latestEventsByFile = new Map<string, LogEvent>();
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
    request: LogPageRequest = {},
  ): LogPage {
    const limit = getPageLimit(request.limit);
    const events = filterLogEvents(this.recentEvents, filter)
      .filter((event) => matchesPageRequest(event, request))
      .sort(compareLogEventsDescending);
    const pageEvents = events.slice(0, limit);
    const lastEvent = pageEvents.at(-1);
    const hasMore = lastEvent
      ? events.some((event) => isOlderThanCursor(event, toCursor(lastEvent)))
      : false;

    return {
      append: "bottom",
      events: pageEvents,
      hasMore,
    };
  }

  async selectSources(selection: SourceSelection): Promise<void> {
    this.activeSources = resolveLogSources(this.matrix, selection);
    this.recentEvents.length = 0;
    this.latestEventsByFile.clear();
    this.tailReader.reset();
    await this.watchManager.watchSources(this.activeSources);
  }

  async stop(): Promise<void> {
    this.activeSources = [];
    this.recentEvents.length = 0;
    this.latestEventsByFile.clear();
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
        this.appendContinuationLine(source, filePath, line, options);
        continue;
      }

      this.latestEventsByFile.set(getFileKey(source, filePath), event);
      this.recordEvent(event, options);
    }
  }

  private appendContinuationLine(
    source: LogSource,
    filePath: string,
    line: string,
    options: WatchChangeOptions,
  ): void {
    const event = this.latestEventsByFile.get(getFileKey(source, filePath));

    if (!event) {
      return;
    }

    event.message = `${event.message}\n${line}`;
    event.raw = `${event.raw}\n${line}`;
    event.receivedAt = new Date().toISOString();

    if (options.broadcast) {
      this.eventBus.emit("log", event);
    }
  }

  private recordEvent(event: LogEvent, options: WatchChangeOptions): void {
    this.recentEvents.push(event);

    if (this.recentEvents.length > maxRecentEvents) {
      this.recentEvents.splice(0, this.recentEvents.length - maxRecentEvents);
    }

    if (options.broadcast) {
      this.eventBus.emit("log", event);
    }
  }
}

function getFileKey(source: LogSource, filePath: string): string {
  return `${source.id}\u0000${filePath}`;
}

function createLogTableSchema(fieldGroups: LogFieldGroup[]): LogTableSchema {
  const baseGroup: LogFieldGroup = {
    id: "base",
    label: "Base",
    fields: [
      {
        id: "timestamp",
        label: "Time",
        field: "timestamp",
        width: 188,
        hideable: false,
      },
      {
        id: "sourceName",
        label: "Source",
        field: "sourceName",
        width: 240,
        hideable: true,
      },
      {
        id: "level",
        label: "Level",
        field: "level",
        width: 90,
        hideable: false,
      },
    ],
  };
  const messageGroup: LogFieldGroup = {
    id: "message",
    label: "Message",
    fields: [
      {
        id: "message",
        label: "Message",
        field: "message",
        width: 520,
        hideable: false,
      },
    ],
  };

  return {
    columns: [baseGroup, ...fieldGroups, messageGroup].flatMap((group) =>
      group.fields.map((field) => ({
        ...field,
        groupId: group.id,
        groupLabel: group.label,
      })),
    ),
  };
}

function getPageLimit(limit: number | undefined): number {
  if (typeof limit !== "number" || !Number.isFinite(limit)) {
    return defaultPageSize;
  }

  return Math.min(maxPageSize, Math.max(1, Math.floor(limit)));
}

function matchesPageRequest(event: LogEvent, request: LogPageRequest): boolean {
  if (request.before && !isOlderThanCursor(event, request.before)) {
    return false;
  }

  if (request.until && !isAtOrAfterTimestamp(event.timestamp, request.until)) {
    return false;
  }

  return true;
}

function toCursor(event: LogEvent): LogCursor {
  return {
    filePath: event.filePath,
    id: event.id,
    receivedAt: event.receivedAt,
    timestamp: event.timestamp,
  };
}

function isOlderThanCursor(event: LogEvent, cursor: LogCursor): boolean {
  return compareEventToCursor(event, cursor) < 0;
}

function compareLogEventsDescending(left: LogEvent, right: LogEvent): number {
  return -compareLogEventsAscending(left, right);
}

function compareLogEventsAscending(left: LogEvent, right: LogEvent): number {
  return (
    compareTimestamp(left.timestamp, right.timestamp) ||
    compareTimestamp(left.receivedAt, right.receivedAt) ||
    left.filePath.localeCompare(right.filePath) ||
    left.id.localeCompare(right.id)
  );
}

function compareEventToCursor(event: LogEvent, cursor: LogCursor): number {
  return (
    compareTimestamp(event.timestamp, cursor.timestamp) ||
    compareTimestamp(event.receivedAt, cursor.receivedAt) ||
    event.filePath.localeCompare(cursor.filePath) ||
    event.id.localeCompare(cursor.id)
  );
}

function isAtOrAfterTimestamp(timestamp: string, minimum: string): boolean {
  const timestampTime = Date.parse(timestamp);
  const minimumTime = Date.parse(minimum);

  if (Number.isFinite(timestampTime) && Number.isFinite(minimumTime)) {
    return timestampTime >= minimumTime;
  }

  return timestamp >= minimum;
}

function compareTimestamp(left: string, right: string): number {
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);
  const leftValid = Number.isFinite(leftTime);
  const rightValid = Number.isFinite(rightTime);

  if (leftValid && rightValid) {
    return leftTime - rightTime;
  }

  if (leftValid !== rightValid) {
    return leftValid ? -1 : 1;
  }

  return left.localeCompare(right);
}
