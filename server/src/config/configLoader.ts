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
  const matrix = parseEnvironmentMatrix(readJsonFile(filePath));

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
  return parseParserConfig(readJsonFile(filePath));
}

function readJsonFile(filePath: string): unknown {
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as unknown;
  } catch (error) {
    throw new Error(`Invalid JSON in ${filePath}: ${String(error)}`);
  }
}

function parseEnvironmentMatrix(value: unknown): EnvironmentMatrixEntry[] {
  if (!Array.isArray(value)) {
    throw new Error("Environment matrix must be an array");
  }

  return value.map((entry, index) => {
    const record = requireRecord(entry, `environment matrix entry ${index}`);

    return {
      environment: requireString(
        record.environment,
        `entry ${index}.environment`,
      ),
      country: requireString(record.country, `entry ${index}.country`),
      code: requireString(record.code, `entry ${index}.code`),
      host: requireString(record.host, `entry ${index}.host`),
      shares: requireStringArray(record.shares, `entry ${index}.shares`),
    };
  });
}

function parseParserConfig(value: unknown): ParserConfig {
  const record = requireRecord(value, "parser config");
  const linePattern = requireString(record.linePattern, "parser.linePattern");
  const groupsRecord = requireRecord(record.groups, "parser.groups");
  const groups: Record<string, string | undefined> = {};

  assertValidRegex(linePattern);

  for (const [field, groupName] of Object.entries(groupsRecord)) {
    groups[field] =
      groupName === undefined
        ? undefined
        : requireString(groupName, `parser.groups.${field}`);
  }

  const timestamp = requireString(groups.timestamp, "parser.groups.timestamp");
  const level = requireString(groups.level, "parser.groups.level");
  const message = requireString(groups.message, "parser.groups.message");

  return {
    linePattern,
    groups: {
      ...groups,
      timestamp,
      level,
      message,
    },
  };
}

function assertValidRegex(pattern: string): void {
  try {
    new RegExp(pattern);
  } catch (error) {
    throw new Error(`Invalid parser.linePattern: ${String(error)}`);
  }
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }

  return value as Record<string, unknown>;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }

  return value;
}

function requireStringArray(value: unknown, label: string): string[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    !value.every(isNonEmptyString)
  ) {
    throw new Error(`${label} must be an array of non-empty strings`);
  }

  return value;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function resolveSharePath(share: string, configDirectory: string): string {
  if (path.isAbsolute(share) || share.startsWith("\\\\")) {
    return share;
  }

  return path.resolve(configDirectory, share);
}
