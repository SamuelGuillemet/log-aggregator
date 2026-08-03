import type { Stats } from "node:fs";
import { performance } from "node:perf_hooks";

import type {
  EnvironmentMatrixEntry,
  LogEvent,
  LogFilter,
  LogHistoryQuery,
  LogPage,
  LogSnapshot,
  LogSource,
  SourceOptions,
  SourceSelection,
} from "@log-aggregator/shared";
import { type FSWatcher, watch } from "chokidar";

import type { ParserConfig } from "../config.js";
import { LogHistoryBuffer } from "../domain/history.js";
import { LogLineParser } from "../domain/logParser.js";
import {
  findSourceForFile,
  getSourceOptions,
  listMatchingSourceFiles,
  matchesSelectedLogFile,
  resolveSources,
} from "../domain/sourceResolver.js";
import { LogStreamSession } from "./logStreamSession.js";

interface LogAggregatorServiceOptions {
  matrix: EnvironmentMatrixEntry[];
  parser: ParserConfig;
}

interface OperationalError {
  details?: string;
  message: string;
}

type LogListener = (event: LogEvent) => void;
type ErrorListener = (error: OperationalError) => void;

export class LogAggregatorService {
  readonly sourceOptions: SourceOptions;

  private activeSelection: SourceSelection | undefined;
  private readonly buffer: LogHistoryBuffer;
  private readonly errorListeners = new Set<ErrorListener>();
  private readonly pendingLiveFiles = new Set<string>();
  private readonly liveFileTasks = new Map<string, Promise<void>>();
  private readonly logListeners = new Set<LogListener>();
  private readonly parser: LogLineParser;
  private readonly streamSession: LogStreamSession;
  private sources: LogSource[] = [];
  private watcher: FSWatcher | undefined;

  constructor(private readonly options: LogAggregatorServiceOptions) {
    this.buffer = new LogHistoryBuffer();
    this.parser = new LogLineParser(options.parser);
    this.sourceOptions = getSourceOptions(options.matrix);
    this.streamSession = new LogStreamSession(this.parser, {
      onContinuationDropped: (filePath) => {
        console.warn(`Dropped continuation without log event in ${filePath}`);
      },
      onEvent: (event, emitLive) => {
        this.buffer.add(event);

        if (emitLive) {
          this.emitLog(event);
        }
      },
    });
  }

  onLog(listener: LogListener): () => void {
    this.logListeners.add(listener);

    return () => this.logListeners.delete(listener);
  }

  onError(listener: ErrorListener): () => void {
    this.errorListeners.add(listener);

    return () => this.errorListeners.delete(listener);
  }

  getSnapshot(filter?: Partial<LogFilter>): LogSnapshot {
    return this.buffer.getSnapshot(
      filter,
      this.sources,
      this.parser.getSchema(),
    );
  }

  getHistoryPage(query: LogHistoryQuery, filter?: Partial<LogFilter>): LogPage {
    return this.buffer.getPage(query, filter);
  }

  async subscribe(selection: SourceSelection): Promise<void> {
    const startedAt = performance.now();
    await this.stopWatcher();
    this.clearState();

    this.activeSelection = {
      ...selection,
      project: selection.project.trim(),
    };
    this.sources = resolveSources(this.activeSelection, this.options.matrix);

    for (const source of this.sources) {
      await this.loadExistingSource(source, this.activeSelection);
    }

    this.startWatcher();

    const durationMs = performance.now() - startedAt;
    console.info(
      `[timing] service.subscribe project=${this.activeSelection.project} sources=${this.sources.length} ms=${durationMs.toFixed(1)}`,
    );
  }

  async unsubscribe(): Promise<void> {
    await this.stopWatcher();
    this.clearState();
  }

  async shutdown(): Promise<void> {
    await this.unsubscribe();
  }

  private clearState(): void {
    this.activeSelection = undefined;
    this.buffer.clear();
    this.pendingLiveFiles.clear();
    this.liveFileTasks.clear();
    this.streamSession.clear();
    this.sources = [];
  }

  private async stopWatcher(): Promise<void> {
    const watcher = this.watcher;
    this.watcher = undefined;
    await watcher?.close();
  }

  private async loadExistingSource(
    source: LogSource,
    selection: SourceSelection,
  ): Promise<void> {
    try {
      const startedAt = performance.now();
      const files = await listMatchingSourceFiles(source, selection);

      for (const file of files) {
        await this.streamSession.processWholeFile(
          file.source,
          file.filePath,
          false,
        );
      }

      const durationMs = performance.now() - startedAt;
      console.info(
        `[timing] service.loadExistingSource source=${source.id} files=${files.length} ms=${durationMs.toFixed(1)}`,
      );
    } catch (error) {
      this.emitError(`Failed to process ${source.directory}`, error);
    }
  }

  private startWatcher(): void {
    if (!this.activeSelection || this.sources.length === 0) {
      return;
    }

    const watcher = watch(
      this.sources.map((source) => source.directory),
      {
        ignoreInitial: true,
        ignored: (filePath, stats) => this.isIgnoredWatchPath(filePath, stats),
      },
    );

    watcher.on("add", (filePath) => void this.processLiveFile(filePath));
    watcher.on("change", (filePath) => void this.processLiveFile(filePath));
    watcher.on("unlink", (filePath) => this.dropFileState(filePath));
    watcher.on("error", (error) => this.emitError("Watcher error", error));

    this.watcher = watcher;
  }

  private isIgnoredWatchPath(filePath: string, stats?: Stats): boolean {
    if (!stats || stats.isDirectory()) {
      return false;
    }

    const source = findSourceForFile(filePath, this.sources);

    return !(
      source &&
      this.activeSelection &&
      matchesSelectedLogFile(filePath, this.activeSelection)
    );
  }

  private async processLiveFile(filePath: string): Promise<void> {
    const activeTask = this.liveFileTasks.get(filePath);

    if (activeTask) {
      this.pendingLiveFiles.add(filePath);
      await activeTask;
      return;
    }

    const task = this.processQueuedLiveFile(filePath);
    this.liveFileTasks.set(filePath, task);

    try {
      await task;
    } finally {
      if (this.liveFileTasks.get(filePath) === task) {
        this.liveFileTasks.delete(filePath);
      }
    }
  }

  private async processQueuedLiveFile(filePath: string): Promise<void> {
    do {
      this.pendingLiveFiles.delete(filePath);

      const source = findSourceForFile(filePath, this.sources);

      if (
        !source ||
        !this.activeSelection ||
        !matchesSelectedLogFile(filePath, this.activeSelection)
      ) {
        return;
      }

      try {
        await this.streamSession.processTail(source, filePath, true);
      } catch (error) {
        this.emitError(`Failed to process ${filePath}`, error);
        return;
      }
    } while (this.pendingLiveFiles.has(filePath));
  }

  private dropFileState(filePath: string): void {
    const source = findSourceForFile(filePath, this.sources);
    this.pendingLiveFiles.delete(filePath);
    this.liveFileTasks.delete(filePath);

    if (source) {
      this.streamSession.removeFileState(source, filePath);
    }
  }

  private emitLog(event: LogEvent): void {
    for (const listener of this.logListeners) {
      listener(event);
    }
  }

  private emitError(message: string, error: unknown): void {
    const payload = { details: String(error), message };

    for (const listener of this.errorListeners) {
      listener(payload);
    }
  }
}
