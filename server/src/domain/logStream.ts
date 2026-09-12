import type { LogEvent, LogSource, SourceSelection } from "@log-aggregator/shared";
import type { FileNameMatcher } from "../ingest/fileNameMatcher.js";
import { FileTailer } from "../ingest/fileTailer.js";
import type { LogParser } from "../ingest/parser.js";
import { describe, logger } from "../util/logger.js";
import { EventBuffer, type StoredEvent } from "./eventBuffer.js";
import { listSelectionFiles } from "./sourceResolver.js";

export interface LogStreamOptions {
  selection: SourceSelection;
  sources: LogSource[];
  parser: LogParser;
  matcher: FileNameMatcher;
  capacity: number;
  pollIntervalMs: number;
}

export interface LogStreamListeners {
  /** Incremental events produced by one poll tick. Never fires before the first prime. */
  onBatch: (events: StoredEvent[]) => void;
  /** The buffer changed wholesale: initial load, or a rotation forced a full re-read. */
  onReset: () => void;
  onError: (message: string) => void;
}

interface FileState {
  sourceId: string;
  displayName: string;
  filePath: string;
  lastStored: StoredEvent | undefined;
  lastTimestampMs: number | undefined;
  batchGeneration: number;
  batchStored: StoredEvent | undefined;
}

/**
 * Owns ingestion for exactly one (source, application, date) selection, and is
 * shared by every session watching it. v1 built one of these per WebSocket, so N
 * browser tabs meant N watchers, N full disk reads and N copies of every event.
 */
export class LogStream {
  readonly buffer: EventBuffer;

  private readonly tailers = new Map<string, FileTailer>();
  private readonly fileStates = new Map<string, FileState>();
  private readonly sourceSequences = new Map<string, number>();
  private readonly listeners = new Set<LogStreamListeners>();

  private sequence = 0;
  private batch: StoredEvent[] = [];
  private batchGeneration = 0;
  private primed = false;
  private running = false;
  private ticking = false;
  private timer: NodeJS.Timeout | undefined;
  private lastErrorMessage: string | undefined;

  constructor(private readonly options: LogStreamOptions) {
    this.buffer = new EventBuffer(options.capacity);
  }

  get selection(): SourceSelection {
    return this.options.selection;
  }

  get sources(): LogSource[] {
    return this.options.sources;
  }

  get isPrimed(): boolean {
    return this.primed;
  }

  subscribe(listeners: LogStreamListeners): () => void {
    this.listeners.add(listeners);

    return () => this.listeners.delete(listeners);
  }

  start(): void {
    if (this.running) {
      return;
    }

    this.running = true;
    this.scheduleTick(0);
  }

  async stop(): Promise<void> {
    this.running = false;

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }

    const tailers = [...this.tailers.values()];
    this.tailers.clear();
    this.fileStates.clear();
    this.buffer.clear();

    await Promise.allSettled(tailers.map((tailer) => tailer.close()));
  }

  private scheduleTick(delayMs: number): void {
    if (!this.running) {
      return;
    }

    // Self-scheduling rather than setInterval: a slow tick can never overlap itself.
    this.timer = setTimeout(() => void this.tick(), delayMs);
    this.timer.unref();
  }

  private async tick(): Promise<void> {
    if (this.ticking) {
      return;
    }

    this.ticking = true;

    try {
      await this.runTick();
    } catch (error) {
      this.reportError(`Failed to read logs: ${describe(error)}`);
    } finally {
      this.ticking = false;
      this.scheduleTick(this.options.pollIntervalMs);
    }
  }

  private async runTick(): Promise<void> {
    const files = await listSelectionFiles(
      this.options.sources,
      this.options.selection,
      this.options.matcher,
    );

    this.syncTailers(files);
    this.lastErrorMessage = undefined;

    const results = await Promise.all(
      [...this.tailers.values()].map(async (tailer) => tailer.poll()),
    );

    if (results.some((result) => result.restarted)) {
      await this.reprime();
      return;
    }

    if (!this.primed) {
      this.primed = true;
      this.batch = [];
      this.batchGeneration += 1;
      logger.info(
        `stream ready selection=${this.options.selection.project}@${this.options.selection.date} events=${this.buffer.size}`,
      );
      this.emit((listener) => listener.onReset());
      return;
    }

    if (this.batch.length > 0) {
      const events = this.batch;
      this.batch = [];
      this.batchGeneration += 1;
      logger.debug(`stream batch events=${events.length} buffered=${this.buffer.size}`);
      this.emit((listener) => listener.onBatch(events));
    }
  }

  private syncTailers(files: { filePath: string; displayName: string; source: LogSource }[]): void {
    const present = new Set<string>();

    for (const file of files) {
      present.add(file.filePath);

      if (this.tailers.has(file.filePath)) {
        continue;
      }

      const state: FileState = {
        batchGeneration: -1,
        batchStored: undefined,
        displayName: file.displayName,
        filePath: file.filePath,
        lastStored: undefined,
        lastTimestampMs: undefined,
        sourceId: file.source.id,
      };

      this.fileStates.set(file.filePath, state);
      this.tailers.set(
        file.filePath,
        new FileTailer(file.filePath, (line) => this.ingest(state, line)),
      );
      logger.debug(`stream watching ${file.filePath}`);
    }

    for (const [filePath, tailer] of this.tailers) {
      if (!present.has(filePath)) {
        this.tailers.delete(filePath);
        this.fileStates.delete(filePath);
        void tailer.close();
      }
    }
  }

  /** A rotation invalidates already-ingested events, so the buffer is rebuilt. */
  private async reprime(): Promise<void> {
    logger.info(`stream re-priming after rotation: ${this.options.selection.project}`);

    const tailers = [...this.tailers.values()];
    this.tailers.clear();
    this.fileStates.clear();
    this.sourceSequences.clear();
    this.buffer.clear();
    this.batch = [];
    this.batchGeneration += 1;
    this.primed = false;

    await Promise.allSettled(tailers.map((tailer) => tailer.close()));
  }

  private ingest(state: FileState, line: string): void {
    const parsed = this.options.parser.parse(line);

    if (!parsed) {
      this.appendContinuation(state, line);
      return;
    }

    const timestampMs = parsed.timestampMs ?? state.lastTimestampMs ?? Date.now();
    const sourceSeq = (this.sourceSequences.get(state.sourceId) ?? 0) + 1;
    this.sourceSequences.set(state.sourceId, sourceSeq);
    this.sequence += 1;

    const event: LogEvent = {
      fields: parsed.fields,
      filePath: state.filePath,
      level: parsed.level,
      messageOffset: parsed.messageOffset,
      raw: line,
      revision: 0,
      seq: this.sequence,
      sourceId: state.sourceId,
      sourceName: state.displayName,
      sourceSeq,
      timestampMs,
      timestampText: parsed.timestampText,
    };

    state.lastStored = this.buffer.append(event);
    state.lastTimestampMs = timestampMs;
    this.pushToBatch(state, state.lastStored);
  }

  private appendContinuation(state: FileState, line: string): void {
    const stored = state.lastStored;

    if (!stored) {
      logger.debug(`dropped continuation without a preceding event in ${state.filePath}`);
      return;
    }

    // A new object, never a mutation: the previous revision may already be on a wire.
    const event: LogEvent = {
      ...stored.event,
      raw: `${stored.event.raw}\n${line}`,
      revision: stored.event.revision + 1,
    };

    this.buffer.update(stored, event);
    this.pushToBatch(state, stored);
  }

  /**
   * Batches hold buffer slots, not snapshots, so the successive revisions of one
   * multi-line entry occupy a single entry and the client receives only the last.
   */
  private pushToBatch(state: FileState, stored: StoredEvent): void {
    if (!this.primed) {
      return;
    }

    if (state.batchGeneration === this.batchGeneration && state.batchStored === stored) {
      return;
    }

    state.batchGeneration = this.batchGeneration;
    state.batchStored = stored;
    this.batch.push(stored);
  }

  private reportError(message: string): void {
    if (this.lastErrorMessage === message) {
      return;
    }

    this.lastErrorMessage = message;
    logger.warn(message);
    this.emit((listener) => listener.onError(message));
  }

  private emit(notify: (listener: LogStreamListeners) => void): void {
    for (const listener of this.listeners) {
      try {
        notify(listener);
      } catch (error) {
        logger.error("stream listener failed", error);
      }
    }
  }
}
