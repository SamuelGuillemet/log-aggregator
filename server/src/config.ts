import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { EnvironmentMatrixEntry, PROTOCOL_VERSION as SHARED_PROTOCOL_VERSION } from "@log-aggregator/shared";

/**
 * Mirrors the latest entry of shared/src/version.ts's COMPATIBILITY_TABLE.
 * Kept as a plain literal instead of a runtime import from
 * @log-aggregator/shared because the packaged release strips that
 * workspace dependency at install time - only its types are used
 * server-side. Bump both together.
 */
export const PROTOCOL_VERSION: SHARED_PROTOCOL_VERSION = 1;

export interface ParserConfig {
  linePattern: string;
  groups: Record<string, string>;
}

export interface ServerConfig {
  matrix: EnvironmentMatrixEntry[];
  parser: ParserConfig;
}

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultMatrixFile = resolve(serverRoot, "config/environment-matrix.json");
const defaultParserFile = resolve(serverRoot, "config/parser.json");

export async function loadConfig(): Promise<ServerConfig> {
  const matrixFile = resolve(
    process.env.LOG_AGGREGATOR_MATRIX_FILE ?? defaultMatrixFile,
  );
  const parserFile = resolve(
    process.env.LOG_AGGREGATOR_PARSER_FILE ?? defaultParserFile,
  );

  return {
    matrix: await readJsonFile<EnvironmentMatrixEntry[]>(matrixFile),
    parser: await readJsonFile<ParserConfig>(parserFile),
  };
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}
