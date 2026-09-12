import type { LogSourceConfig, SourceSelection } from "@log-aggregator/shared";
import { selectionKey } from "@log-aggregator/shared";
import type { RuntimeOptions } from "../config/types.js";
import type { FileNameMatcher } from "../ingest/fileNameMatcher.js";
import type { LogParser } from "../ingest/parser.js";
import { logger } from "../util/logger.js";
import { LogStream } from "./logStream.js";
import { resolveSources } from "./sourceResolver.js";

export interface StreamHandle {
  stream: LogStream;
  release: () => void;
}

interface Entry {
  stream: LogStream;
  refCount: number;
  lingerTimer: NodeJS.Timeout | undefined;
}

export interface StreamRegistryDeps {
  parser: LogParser;
  matcher: FileNameMatcher;
  options: RuntimeOptions;
  getSources: () => LogSourceConfig[];
}

/**
 * Deduplicates streams across sessions. Two tabs on the same application share one
 * watcher, one parse pass and one buffer instead of paying for everything twice.
 */
export class StreamRegistry {
  private readonly entries = new Map<string, Entry>();

  constructor(private readonly deps: StreamRegistryDeps) {}

  acquire(selection: SourceSelection): StreamHandle | undefined {
    const sources = resolveSources(selection, this.deps.getSources());

    if (sources.length === 0) {
      return undefined;
    }

    const key = selectionKey(selection);
    const entry = this.entries.get(key) ?? this.create(key, selection, sources);

    entry.refCount += 1;

    if (entry.lingerTimer) {
      clearTimeout(entry.lingerTimer);
      entry.lingerTimer = undefined;
    }

    let released = false;

    return {
      release: () => {
        if (released) {
          return;
        }

        released = true;
        this.release(key);
      },
      stream: entry.stream,
    };
  }

  /** Configuration changed: every stream's resolved directories are now suspect. */
  async reset(): Promise<void> {
    const entries = [...this.entries.values()];
    this.entries.clear();

    for (const entry of entries) {
      if (entry.lingerTimer) {
        clearTimeout(entry.lingerTimer);
      }
    }

    await Promise.allSettled(entries.map((entry) => entry.stream.stop()));
  }

  async closeAll(): Promise<void> {
    await this.reset();
  }

  private create(
    key: string,
    selection: SourceSelection,
    sources: ReturnType<typeof resolveSources>,
  ): Entry {
    const stream = new LogStream({
      capacity: this.deps.options.maxEventsPerStream,
      matcher: this.deps.matcher,
      parser: this.deps.parser,
      pollIntervalMs: this.deps.options.pollIntervalMs,
      selection,
      sources,
    });
    const entry: Entry = { lingerTimer: undefined, refCount: 0, stream };

    this.entries.set(key, entry);
    stream.start();
    logger.info(`stream created ${selection.sourceId}/${selection.project}/${selection.date}`);

    return entry;
  }

  private release(key: string): void {
    const entry = this.entries.get(key);

    if (!entry) {
      return;
    }

    entry.refCount -= 1;

    if (entry.refCount > 0) {
      return;
    }

    // Linger briefly so a page refresh reuses the warm buffer instead of re-reading
    // hundreds of megabytes from disk.
    const linger = this.deps.options.streamLingerMs;

    if (linger === 0) {
      this.entries.delete(key);
      void entry.stream.stop();
      return;
    }

    entry.lingerTimer = setTimeout(() => {
      this.entries.delete(key);
      void entry.stream.stop();
      logger.debug(`stream stopped after linger: ${key}`);
    }, linger);
    entry.lingerTimer.unref();
  }
}
