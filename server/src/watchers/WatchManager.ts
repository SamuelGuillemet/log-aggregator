import type { LogSource } from "@log-aggregator/shared";
import chokidar, { type FSWatcher } from "chokidar";

import { matchesLogFile } from "./fileMatcher.js";

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
    if (!matchesLogFile(source, filePath)) {
      return;
    }

    try {
      await this.options.onFileChanged(source, filePath, options);
    } catch (error) {
      this.options.onError(`Failed to process ${filePath}`, String(error));
    }
  }
}
