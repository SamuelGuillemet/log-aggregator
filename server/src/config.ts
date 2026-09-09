import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  LogSourceConfig,
  PROTOCOL_VERSION as SHARED_PROTOCOL_VERSION,
} from "@log-aggregator/shared";

/**
 * Mirrors the latest entry of shared/src/version.ts's COMPATIBILITY_TABLE.
 * Kept as a plain literal instead of a runtime import from
 * @log-aggregator/shared because the packaged release strips that
 * workspace dependency at install time - only its types are used
 * server-side. Bump both together.
 */
export const PROTOCOL_VERSION: SHARED_PROTOCOL_VERSION = 3;

export interface ParserConfig {
  linePattern: string;
  groups: Record<string, string>;
}

export interface ServerConfig {
  sources: LogSourceConfig[];
  sourcesFile: string;
  parser: ParserConfig;
}

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultSourcesFile = resolve(serverRoot, "config/sources.json");
const defaultParserFile = resolve(serverRoot, "config/parser.json");

export async function loadConfig(): Promise<ServerConfig> {
  const sourcesFile = resolve(process.env.LOG_AGGREGATOR_SOURCES_FILE ?? defaultSourcesFile);
  const parserFile = resolve(process.env.LOG_AGGREGATOR_PARSER_FILE ?? defaultParserFile);

  return {
    parser: await readJsonFile<ParserConfig>(parserFile),
    sources: await loadSources(sourcesFile),
    sourcesFile,
  };
}

export async function loadSources(sourcesFile: string): Promise<LogSourceConfig[]> {
  const sources = await readJsonFile<LogSourceConfig[]>(sourcesFile);

  return sources.map((source) => ({
    ...source,
    directories: source.directories.map((directory) => resolve(dirname(sourcesFile), directory)),
  }));
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}
