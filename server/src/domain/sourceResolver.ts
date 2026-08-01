import { readdir } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve } from "node:path";

import type {
  EnvironmentMatrixEntry,
  LogSource,
  SourceOptions,
  SourceSelection,
} from "@log-aggregator/shared";

export interface ActiveLogFile {
  filePath: string;
  source: LogSource;
}

const tiers: SourceOptions["tiers"] = ["back", "front"];
const logDatePattern = /^\d{4}-\d{2}-\d{2}$/;

export function getSourceOptions(
  matrix: EnvironmentMatrixEntry[],
): SourceOptions {
  const countriesByEnvironment: Record<string, string[]> = {};

  for (const entry of matrix) {
    countriesByEnvironment[entry.environment] ??= [];

    if (!countriesByEnvironment[entry.environment].includes(entry.country)) {
      countriesByEnvironment[entry.environment].push(entry.country);
    }
  }

  return {
    countriesByEnvironment: Object.fromEntries(
      Object.entries(countriesByEnvironment)
        .toSorted(([left], [right]) => left.localeCompare(right))
        .map(([environment, countries]) => [environment, countries]),
    ),
    environments: [...new Set(matrix.map((entry) => entry.environment))],
    tiers,
  };
}

export function resolveSources(
  selection: SourceSelection,
  matrix: EnvironmentMatrixEntry[],
): LogSource[] {
  const project = selection.project.trim();

  if (!project || !logDatePattern.test(selection.date)) {
    return [];
  }

  return matrix.flatMap((entry) => {
    if (
      entry.environment !== selection.environment ||
      entry.country !== selection.country
    ) {
      return [];
    }

    return entry.shares.map((share, shareIndex) => {
      const sharePath = resolveSharePath(share);
      const directory = join(
        sharePath,
        "Java",
        `apache-tomcat-${selection.tier}`,
        "logs",
      );

      return {
        country: entry.country,
        environment: entry.environment,
        date: selection.date,
        tier: selection.tier,
        project,
        directory,
        id: buildSourceId(entry, project, shareIndex, selection.tier),
        name: `${entry.environment}/${entry.country}/${selection.tier}/${basename(sharePath)}`,
      } satisfies LogSource;
    });
  });
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

export function findSourceForFile(
  filePath: string,
  sources: LogSource[],
): LogSource | undefined {
  const absoluteFilePath = resolve(filePath);

  return sources.find((source) => {
    const relativePath = relative(source.directory, absoluteFilePath);

    return Boolean(
      relativePath &&
        !relativePath.startsWith("..") &&
        !isAbsolute(relativePath),
    );
  });
}

export function matchesSelectedLogFile(
  filePath: string,
  selection: SourceSelection,
): boolean {
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

function resolveSharePath(share: string): string {
  return isAbsolute(share) ? share : resolve(process.cwd(), share);
}

function buildSourceId(
  entry: EnvironmentMatrixEntry,
  project: string,
  shareIndex: number,
  tier: SourceSelection["tier"],
): string {
  return [
    entry.environment,
    entry.country,
    entry.code,
    project,
    String(shareIndex),
    tier,
  ]
    .map(slug)
    .join("-");
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
