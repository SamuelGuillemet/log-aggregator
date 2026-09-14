import type { Dirent } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type {
  LogSource,
  LogSourceConfig,
  LogSourceOption,
  SourceOptions,
  SourceSelection,
} from "@log-aggregator/shared";
import type { FileNameMatcher } from "../ingest/fileNameMatcher.js";
import { describe, logger } from "../util/logger.js";

/** A directory that just failed is not retried faster than this, so an offline
 * network share is not scanned on every poll tick (which was slow enough by itself
 * to make it look like it "froze" the share for other consumers, e.g. Explorer). */
const DIRECTORY_RETRY_COOLDOWN_MS = 5_000;
/** Above this, a directory listing is logged so a slow share is easy to spot. */
const SLOW_READDIR_MS = 200;

const directoryFailures = new Map<string, number>();

/**
 * Reads one directory in isolation: a failure here (an offline UNC path, a
 * permission error) must never take down the other, healthy, directories that
 * happen to be read in the same `Promise.all`.
 */
async function readDirectorySafely<T>(
  directory: string,
  read: () => Promise<T[]>,
): Promise<T[]> {
  const failedAt = directoryFailures.get(directory);

  if (failedAt !== undefined && Date.now() - failedAt < DIRECTORY_RETRY_COOLDOWN_MS) {
    return [];
  }

  const startedAt = Date.now();

  try {
    const entries = await read();
    const elapsedMs = Date.now() - startedAt;

    if (elapsedMs >= SLOW_READDIR_MS) {
      logger.info(`slow directory listing directory=${directory} ms=${elapsedMs} entries=${entries.length}`);
    }

    if (failedAt !== undefined) {
      directoryFailures.delete(directory);
      logger.info(`directory reachable again: ${directory}`);
    }

    return entries;
  } catch (error) {
    if (failedAt === undefined) {
      logger.warn(`Cannot read directory ${directory}: ${describe(error)}`);
    }

    directoryFailures.set(directory, Date.now());

    return [];
  }
}

export interface SelectionFile {
  filePath: string;
  source: LogSource;
  /** `source.name`, qualified by the file kind when the template captures one. */
  displayName: string;
}

/** Expands a selection into one logical source per configured directory. */
export function resolveSources(
  selection: SourceSelection,
  configs: LogSourceConfig[],
): LogSource[] {
  const config = configs.find((candidate) => candidate.id === selection.sourceId);

  if (!config) {
    return [];
  }

  return config.directories.map((directory, index) => ({
    directory,
    id: config.directories.length === 1 ? config.id : `${config.id}#${index + 1}`,
    name: config.directories.length === 1 ? config.name : `${config.name} #${index + 1}`,
  }));
}

export async function listSelectionFiles(
  sources: LogSource[],
  selection: SourceSelection,
  matcher: FileNameMatcher,
): Promise<SelectionFile[]> {
  const perSource = await Promise.all(
    sources.map(async (source) => {
      const entries = await readDirectorySafely<Dirent>(source.directory, () =>
        readdir(source.directory, { withFileTypes: true }),
      );
      const files: SelectionFile[] = [];

      for (const entry of entries) {
        if (!entry.isFile() || !isPlainFileName(entry.name)) {
          continue;
        }

        const match = matcher.matches(entry.name, selection.project, selection.date);

        if (match) {
          files.push({
            displayName: match.kind ? `${source.name} (${match.kind})` : source.name,
            filePath: join(source.directory, entry.name),
            source,
          });
        }
      }

      return files;
    }),
  );

  return perSource.flat();
}

export async function buildSourceOptions(
  configs: LogSourceConfig[],
  matcher: FileNameMatcher,
): Promise<SourceOptions> {
  return {
    sources: await Promise.all(
      configs.map(async (config): Promise<LogSourceOption> => ({
        applications: await listApplications(config.directories, matcher),
        group: config.group,
        id: config.id,
        name: config.name,
      })),
    ),
  };
}

async function listApplications(
  directories: string[],
  matcher: FileNameMatcher,
): Promise<string[]> {
  const perDirectory = await Promise.all(
    directories.map(async (directory) => {
      const entries = await readDirectorySafely<string>(directory, () => readdir(directory));

      return entries.flatMap((entry) => {
        const match = matcher.discover(entry);

        return match ? [match.project] : [];
      });
    }),
  );

  return [...new Set(perDirectory.flat())].sort((left, right) => left.localeCompare(right));
}

/** Defence in depth: directory entries are bare names, never path fragments. */
function isPlainFileName(name: string): boolean {
  return !name.includes("/") && !name.includes("\\") && name !== "." && name !== "..";
}
