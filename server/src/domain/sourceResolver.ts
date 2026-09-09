import { readdir } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import type {
  LogSource,
  LogSourceConfig,
  SourceOptions,
  SourceSelection,
} from "@log-aggregator/shared";

export interface ActiveLogFile {
  filePath: string;
  source: LogSource;
}

const logDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const logFilePattern = /^(.+)-(?:serveur|fwk|ui)\.\d{4}-\d{2}-\d{2}-\d+\.log$/i;

export async function getSourceOptions(sources: LogSourceConfig[]): Promise<SourceOptions> {
  return {
    sources: await Promise.all(
      sources.map(async (source) => ({
        applications: await listApplications(source.directories),
        group: source.group,
        id: source.id,
        name: source.name,
      })),
    ),
  };
}

export function resolveSources(
  selection: SourceSelection,
  configuredSources: LogSourceConfig[],
): LogSource[] {
  const project = selection.project.trim();

  if (!project || !logDatePattern.test(selection.date)) {
    return [];
  }

  const configuredSource = configuredSources.find((source) => source.id === selection.sourceId);

  if (!configuredSource) {
    return [];
  }

  return configuredSource.directories.map((directory, directoryIndex) => ({
    date: selection.date,
    project,
    directory: resolveDirectory(directory),
    id: `${configuredSource.id}-${directoryIndex + 1}`,
    name:
      configuredSource.directories.length === 1
        ? configuredSource.name
        : `${configuredSource.name} #${directoryIndex + 1}`,
  }));
}

export async function listMatchingSourceFiles(
  source: LogSource,
  selection: SourceSelection,
): Promise<ActiveLogFile[]> {
  const entries = await readdir(source.directory);

  return entries
    .filter((entry) => matchesSelectedLogFile(entry, selection))
    .map((entry) => ({ filePath: join(source.directory, entry), source }));
}

export function findSourceForFile(filePath: string, sources: LogSource[]): LogSource | undefined {
  const absoluteFilePath = resolve(filePath);

  return sources.find((source) => {
    const relativePath = relative(source.directory, absoluteFilePath);

    return Boolean(relativePath && !relativePath.startsWith("..") && !isAbsolute(relativePath));
  });
}

export function matchesSelectedLogFile(filePath: string, selection: SourceSelection): boolean {
  const project = selection.project.trim();

  if (!project || !logDatePattern.test(selection.date)) {
    return false;
  }

  return new RegExp(
    String.raw`^${escapeRegExp(project)}-(?:serveur|fwk|ui)\.${escapeRegExp(
      selection.date,
    )}-\d+\.log$`,
    "i",
  ).test(basename(filePath));
}

async function listApplications(directories: string[]): Promise<string[]> {
  const applicationNames = await Promise.all(
    directories.map(async (directory) => {
      try {
        const entries = await readdir(resolveDirectory(directory));

        return entries.flatMap((entry) => {
          const match = logFilePattern.exec(entry);
          return match?.[1] ? [match[1]] : [];
        });
      } catch {
        return [];
      }
    }),
  );

  return [...new Set(applicationNames.flat())].toSorted((left, right) => left.localeCompare(right));
}

function resolveDirectory(directory: string): string {
  return isAbsolute(directory) ? directory : resolve(process.cwd(), directory);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}
