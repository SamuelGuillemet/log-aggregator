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
      const entries = await readdir(source.directory, { withFileTypes: true });
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
      try {
        const entries = await readdir(directory);

        return entries.flatMap((entry) => {
          const match = matcher.discover(entry);

          return match ? [match.project] : [];
        });
      } catch {
        // A configured share can be offline; the rest of the sources still work.
        return [];
      }
    }),
  );

  return [...new Set(perDirectory.flat())].sort((left, right) => left.localeCompare(right));
}

/** Defence in depth: directory entries are bare names, never path fragments. */
function isPlainFileName(name: string): boolean {
  return !name.includes("/") && !name.includes("\\") && name !== "." && name !== "..";
}
