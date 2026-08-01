import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { EnvironmentMatrixEntry } from "@log-aggregator/shared";

export interface ParserConfig {
  linePattern: string;
  groups: Record<string, string>;
}

export interface ServerConfig {
  bufferSize: number;
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
    bufferSize: Number(process.env.LOG_AGGREGATOR_BUFFER_SIZE ?? 10_000),
    matrix: await readJsonFile<EnvironmentMatrixEntry[]>(matrixFile),
    parser: await readJsonFile<ParserConfig>(parserFile),
  };
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}
