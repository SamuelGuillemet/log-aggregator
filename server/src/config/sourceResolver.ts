import path from "node:path";

import type {
  ApplicationTier,
  EnvironmentMatrixEntry,
  LogSource,
  ResolvedLogDirectory,
  SourceOptions,
  SourceSelection,
} from "@log-aggregator/shared";

const tiers: ApplicationTier[] = ["back", "front"];
const compareText = (left: string, right: string) => left.localeCompare(right);

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

  const environments = Object.keys(countriesByEnvironment);
  environments.sort(compareText);

  const countryEntries = Object.entries(countriesByEnvironment).map(
    ([environment, countries]) => {
      const sortedCountries = [...countries];
      sortedCountries.sort(compareText);

      return [environment, sortedCountries];
    },
  );

  return {
    environments,
    countriesByEnvironment: Object.fromEntries(countryEntries),
    tiers,
  };
}

export function resolveLogDirectories(
  matrix: EnvironmentMatrixEntry[],
  selection: SourceSelection,
): ResolvedLogDirectory[] {
  const project = selection.project.trim();
  const date = normalizeDate(selection.date);

  if (!project || !date) {
    return [];
  }

  const entries = matrix.filter(
    (entry) =>
      entry.environment === selection.environment &&
      entry.country === selection.country,
  );

  return entries.flatMap((entry) =>
    entry.shares.map((share, shareIndex) => {
      const tier = selection.tier;

      return {
        id: slug(
          [
            entry.environment,
            entry.country,
            entry.code,
            project,
            String(shareIndex),
            tier,
          ].join("-"),
        ),
        environment: entry.environment,
        country: entry.country,
        code: entry.code,
        host: entry.host,
        share,
        project,
        date,
        tier,
        path: appendTomcatLogPath(share, tier),
      };
    }),
  );
}

export function resolveLogSources(
  matrix: EnvironmentMatrixEntry[],
  selection: SourceSelection,
): LogSource[] {
  return resolveLogDirectories(matrix, selection).map((directory) => ({
    id: directory.id,
    name: `${directory.environment}/${directory.country}/${directory.tier}/${basename(directory.share)}`,
    directory: directory.path,
    enabled: true,
    environment: directory.environment,
    country: directory.country,
    project: directory.project,
    date: directory.date,
    tier: directory.tier,
  }));
}

function normalizeDate(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

function appendTomcatLogPath(share: string, tier: "back" | "front"): string {
  const applicationDirectory =
    tier === "back" ? "apache-tomcat-back" : "apache-tomcat-front";
  const cleanShare = trimTrailingPathSeparators(share);

  if (cleanShare.includes("\\")) {
    return [cleanShare, "Java", applicationDirectory, "logs"].join("\\");
  }

  return path.join(cleanShare, "Java", applicationDirectory, "logs");
}

function basename(value: string): string {
  return path.win32.basename(value) || value;
}

function trimTrailingPathSeparators(value: string): string {
  let end = value.length;

  while (end > 0 && (value[end - 1] === "/" || value[end - 1] === "\\")) {
    end -= 1;
  }

  return value.slice(0, end);
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
