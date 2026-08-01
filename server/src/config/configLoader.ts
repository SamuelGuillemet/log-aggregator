import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { EnvironmentMatrixEntry } from "@log-aggregator/shared";

export interface ParserConfig {
  linePattern: string;
  groups: ParserGroups;
}

export interface ParserGroups {
  [field: string]: string | undefined;
  timestamp: string;
  level: string;
  message: string;
}

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const defaultMatrixPath = path.join(
  packageRoot,
  "config",
  "environment-matrix.json",
);
const defaultParserPath = path.join(packageRoot, "config", "parser.json");

export function loadEnvironmentMatrix(
  filePath = process.env.LOG_AGGREGATOR_MATRIX_FILE ?? defaultMatrixPath,
): EnvironmentMatrixEntry[] {
  const configDirectory = path.dirname(filePath);
  const matrix = JSON.parse(
    readFileSync(filePath, "utf8"),
  ) as EnvironmentMatrixEntry[];

  return matrix.map((entry) => ({
    ...entry,
    shares: entry.shares.map((share) =>
      resolveSharePath(share, configDirectory),
    ),
  }));
}

export function loadParserConfig(
  filePath = process.env.LOG_AGGREGATOR_PARSER_FILE ?? defaultParserPath,
): ParserConfig {
  return JSON.parse(readFileSync(filePath, "utf8")) as ParserConfig;
}

function resolveSharePath(share: string, configDirectory: string): string {
  if (path.isAbsolute(share) || share.startsWith("\\\\")) {
    return share;
  }

  return path.resolve(configDirectory, share);
}
