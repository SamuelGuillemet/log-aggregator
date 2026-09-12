import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type Decoded,
  decodeArray,
  decodeRecord,
  decodeString,
  decodeStringMap,
  fail,
  type LogSourceConfig,
  ok,
} from "@log-aggregator/shared";
import type { ParserConfig, RuntimeOptions, ServerConfig } from "./types.js";

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const defaultSourcesFile = resolve(serverRoot, "config/sources.json");
const defaultParserFile = resolve(serverRoot, "config/parser.json");

export async function loadConfig(): Promise<ServerConfig> {
  const sourcesFile = resolve(process.env.LOG_AGGREGATOR_SOURCES_FILE ?? defaultSourcesFile);
  const parserFile = resolve(process.env.LOG_AGGREGATOR_PARSER_FILE ?? defaultParserFile);

  return {
    parser: await readAndDecode(parserFile, decodeParserConfig),
    sources: await loadSources(sourcesFile),
    sourcesFile,
  };
}

export async function loadSources(sourcesFile: string): Promise<LogSourceConfig[]> {
  const sources = await readAndDecode(sourcesFile, decodeSourceConfigs);
  const configDirectory = dirname(sourcesFile);

  return sources.map((source) => ({
    ...source,
    directories: source.directories.map((directory) => resolve(configDirectory, directory)),
  }));
}

/**
 * The frontend is served from GitHub Pages while the backend runs on the user's own
 * machine, so the canonical deployment is cross-origin by design and cannot rely on
 * the loopback rule. Allowing this one known origin is still far narrower than v1's
 * `access-control-allow-origin: *`, which trusted every site on the internet.
 */
const DEFAULT_ALLOWED_ORIGINS = ["https://samuelguillemet.github.io"];

export function readRuntimeOptions(): RuntimeOptions {
  return {
    allowedOrigins: [
      ...DEFAULT_ALLOWED_ORIGINS,
      ...(process.env.LOG_AGGREGATOR_ALLOWED_ORIGINS ?? "")
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
    ],
    host: process.env.HOST ?? "127.0.0.1",
    maxEventsPerStream: readNumber("LOG_AGGREGATOR_MAX_EVENTS", 500_000, 1_000, 20_000_000),
    maxLiveBatch: readNumber("LOG_AGGREGATOR_MAX_LIVE_BATCH", 2_000, 1, 50_000),
    pollIntervalMs: readNumber("LOG_AGGREGATOR_POLL_INTERVAL_MS", 250, 25, 60_000),
    port: readNumber("PORT", 3_000, 1, 65_535),
    streamLingerMs: readNumber("LOG_AGGREGATOR_STREAM_LINGER_MS", 15_000, 0, 600_000),
  };
}

function readNumber(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];

  if (raw === undefined || raw === "") {
    return fallback;
  }

  const value = Math.trunc(Number(raw));

  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}, got ${raw}`);
  }

  return value;
}

async function readAndDecode<T>(
  filePath: string,
  decode: (value: unknown) => Decoded<T>,
): Promise<T> {
  let parsed: unknown;

  try {
    parsed = JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Cannot read ${filePath}: ${String(error)}`);
  }

  const decoded = decode(parsed);

  if (!decoded.ok) {
    throw new Error(`Invalid config in ${filePath}: ${decoded.error}`);
  }

  return decoded.value;
}

export function decodeParserConfig(value: unknown): Decoded<ParserConfig> {
  const record = decodeRecord(value, "parser");

  if (!record.ok) {
    return record;
  }

  const linePattern = decodeString(record.value.linePattern, "parser.linePattern", 8_192);

  if (!linePattern.ok) {
    return linePattern;
  }

  const logFileName = decodeString(record.value.logFileName, "parser.logFileName", 1_024);

  if (!logFileName.ok) {
    return logFileName;
  }

  const groups = decodeStringMap(record.value.groups, "parser.groups");

  if (!groups.ok) {
    return groups;
  }

  for (const required of ["timestamp", "level", "message"]) {
    if (!groups.value[required]) {
      return fail(`parser.groups.${required} is required`);
    }
  }

  try {
    new RegExp(linePattern.value, "d");
  } catch (error) {
    return fail(`parser.linePattern is not a valid regex: ${String(error)}`);
  }

  return ok({
    groups: groups.value,
    linePattern: linePattern.value,
    logFileName: logFileName.value,
  });
}

export function decodeSourceConfigs(value: unknown): Decoded<LogSourceConfig[]> {
  return decodeArray(value, "sources", 256, (item, path) => {
    const record = decodeRecord(item, path);

    if (!record.ok) {
      return record;
    }

    const id = decodeString(record.value.id, `${path}.id`, 128);

    if (!id.ok) {
      return id;
    }

    const name = decodeString(record.value.name, `${path}.name`, 256);

    if (!name.ok) {
      return name;
    }

    const group = decodeString(record.value.group, `${path}.group`, 256);

    if (!group.ok) {
      return group;
    }

    const directories = decodeArray(
      record.value.directories,
      `${path}.directories`,
      64,
      (directory, directoryPath) => decodeString(directory, directoryPath, 4_096),
    );

    if (!directories.ok) {
      return directories;
    }

    if (directories.value.length === 0) {
      return fail(`${path}.directories must not be empty`);
    }

    return ok({
      directories: directories.value,
      group: group.value,
      id: id.value,
      name: name.value,
    });
  });
}
