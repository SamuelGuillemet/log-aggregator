import type { LogSource } from "@log-aggregator/shared";
import chokidar, { type FSWatcher } from "chokidar";

export interface WatchManagerOptions {
  filePattern: RegExp;
  onFileChanged: (source: LogSource, filePath: string) => Promise<void>;
  onWatchedFilesChanged: (count: number) => void;
  onError: (message: string, details?: string) => void;
}

export class WatchManager {
  private readonly watchers: FSWatcher[] = [];
  private readonly watchedFiles = new Set<string>();

  constructor(private readonly options: WatchManagerOptions) {}

  async watchSources(sources: LogSource[]): Promise<void> {
    await this.stop();

    for (const source of sources.filter((candidate) => candidate.enabled)) {
      const watcher = chokidar.watch(source.directory, {
        awaitWriteFinish: { stabilityThreshold: 250, pollInterval: 100 },
        ignoreInitial: false,
        persistent: true,
        usePolling: false,
      });

      watcher.on("add", (filePath) => void this.handleChange(source, filePath));
      watcher.on(
        "change",
        (filePath) => void this.handleChange(source, filePath),
      );
      watcher.on("unlink", (filePath) => this.handleDelete(filePath));
      watcher.on("error", (error) =>
        this.options.onError(
          `Watcher failed for ${source.directory}`,
          String(error),
        ),
      );

      this.watchers.push(watcher);
    }
  }

  async stop(): Promise<void> {
    await Promise.all(this.watchers.map((watcher) => watcher.close()));
    this.watchers.length = 0;
    this.watchedFiles.clear();
    this.options.onWatchedFilesChanged(0);
  }

  private async handleChange(
    source: LogSource,
    filePath: string,
  ): Promise<void> {
    if (!this.matchesFile(source, filePath)) {
      return;
    }

    this.watchedFiles.add(filePath);
    this.options.onWatchedFilesChanged(this.watchedFiles.size);

    try {
      await this.options.onFileChanged(source, filePath);
    } catch (error) {
      this.options.onError(`Failed to process ${filePath}`, String(error));
    }
  }

  private handleDelete(filePath: string): void {
    this.watchedFiles.delete(filePath);
    this.options.onWatchedFilesChanged(this.watchedFiles.size);
  }

  private matchesFile(source: LogSource, filePath: string): boolean {
    const fileName = filePath.split(/[\\/]/).at(-1) ?? filePath;

    return matchesFilePattern(source, fileName, this.options.filePattern);
  }
}

function matchesFilePattern(
  source: LogSource,
  fileName: string,
  fallback: RegExp,
): boolean {
  const pattern = source.filePattern
    ? new RegExp(source.filePattern, "i")
    : fallback;
  pattern.lastIndex = 0;

  return pattern.test(fileName);
}
