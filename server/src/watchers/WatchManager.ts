import type { LogSource } from "@log-aggregator/shared";
import chokidar, { type FSWatcher } from "chokidar";

export interface WatchManagerOptions {
  onFileChanged: (
    source: LogSource,
    filePath: string,
    options: WatchChangeOptions,
  ) => Promise<void>;
  onError: (message: string, details?: string) => void;
}

export interface WatchChangeOptions {
  broadcast: boolean;
}

const logFileKindPattern = "(serveur|fwk)";
const anyDatedLogFilePattern = new RegExp(
  String.raw`^.+-${logFileKindPattern}\.\d{4}-\d{2}-\d{2}-\d+\.log$`,
  "i",
);

export class WatchManager {
  private readonly watchers: FSWatcher[] = [];

  constructor(private readonly options: WatchManagerOptions) {}

  async watchSources(sources: LogSource[]): Promise<void> {
    await this.stop();
    const ready: Promise<void>[] = [];
    const initialReads: Promise<void>[] = [];

    for (const source of sources.filter((candidate) => candidate.enabled)) {
      let readyForLiveEvents = false;
      const watcher = chokidar.watch(source.directory, {
        awaitWriteFinish: { stabilityThreshold: 250, pollInterval: 100 },
        ignoreInitial: false,
        persistent: true,
        usePolling: false,
      });

      watcher.on("add", (filePath) => {
        const read = this.handleChange(source, filePath, {
          broadcast: readyForLiveEvents,
        });

        if (!readyForLiveEvents) {
          initialReads.push(read);
        }

        void read;
      });
      watcher.on(
        "change",
        (filePath) =>
          void this.handleChange(source, filePath, { broadcast: true }),
      );
      watcher.on("error", (error) =>
        this.options.onError(
          `Watcher failed for ${source.directory}`,
          String(error),
        ),
      );

      ready.push(
        new Promise((resolve) => {
          watcher.on("ready", () => {
            readyForLiveEvents = true;
            resolve();
          });
        }),
      );
      this.watchers.push(watcher);
    }

    await Promise.all(ready);
    await Promise.all(initialReads);
  }

  async stop(): Promise<void> {
    await Promise.all(this.watchers.map((watcher) => watcher.close()));
    this.watchers.length = 0;
  }

  private async handleChange(
    source: LogSource,
    filePath: string,
    options: WatchChangeOptions,
  ): Promise<void> {
    if (!this.matchesFile(source, filePath)) {
      return;
    }

    try {
      await this.options.onFileChanged(source, filePath, options);
    } catch (error) {
      this.options.onError(`Failed to process ${filePath}`, String(error));
    }
  }

  private matchesFile(source: LogSource, filePath: string): boolean {
    const fileName = filePath.split(/[\\/]/).at(-1) ?? filePath;

    return matchesFilePattern(source, fileName);
  }
}

function matchesFilePattern(source: LogSource, fileName: string): boolean {
  if (!source.project || !source.date) {
    anyDatedLogFilePattern.lastIndex = 0;

    return anyDatedLogFilePattern.test(fileName);
  }

  const pattern = new RegExp(
    String.raw`^${escapeRegExp(source.project)}-${logFileKindPattern}\.${escapeRegExp(source.date)}-\d+\.log$`,
    "i",
  );

  return pattern.test(fileName);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}
