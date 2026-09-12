import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { PROTOCOL_VERSION, type SourceOptions } from "@log-aggregator/shared";
import { loadConfig, loadSources, readRuntimeOptions } from "./config/load.js";
import { buildSourceOptions } from "./domain/sourceResolver.js";
import { StreamRegistry } from "./domain/streamRegistry.js";
import { FileNameMatcher } from "./ingest/fileNameMatcher.js";
import { LogParser } from "./ingest/parser.js";
import { createOriginGuard } from "./transport/origin.js";
import { createHttpHandler } from "./transport/routes.js";
import { attachWsGateway } from "./transport/wsGateway.js";
import { logger } from "./util/logger.js";

const SOURCE_RELOAD_INTERVAL_MS = 1_000;

const runtime = readRuntimeOptions();
const config = await loadConfig();
const matcher = new FileNameMatcher(config.parser.logFileName);
const parser = new LogParser(config.parser);

let sources = config.sources;
let sourceOptions: SourceOptions = await buildSourceOptions(sources, matcher);

const registry = new StreamRegistry({
  getSources: () => sources,
  matcher,
  options: runtime,
  parser,
});
const server = createServer(
  createHttpHandler({
    getSession: (clientId) => gateway.getSession(clientId),
    originGuard: createOriginGuard(runtime.allowedOrigins),
  }),
);
const gateway = attachWsGateway(server, {
  getOptions: () => sourceOptions,
  maxLiveBatch: runtime.maxLiveBatch,
  originGuard: createOriginGuard(runtime.allowedOrigins),
  registry,
  schema: parser.schema(),
});

let lastSourcesMtimeMs = await readMtime(config.sourcesFile);
const reloadTimer = setInterval(() => void reloadSourcesIfChanged(), SOURCE_RELOAD_INTERVAL_MS);
reloadTimer.unref();

server.on("error", (error) => {
  logger.error(`HTTP server failed on ${runtime.host}:${runtime.port}`, error);
  process.exitCode = 1;
  void shutdown();
});

server.listen(runtime.port, runtime.host, () => {
  logger.info(`protocol v${PROTOCOL_VERSION} listening on http://${runtime.host}:${runtime.port}`);
  logger.info(`websocket ready on ws://${runtime.host}:${runtime.port}/ws`);
});

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());

// v1 had neither guard, so one malformed WebSocket frame terminated the process.
process.on("unhandledRejection", (reason) => logger.error("unhandled rejection", reason));
process.on("uncaughtException", (error) => logger.error("uncaught exception", error));

async function reloadSourcesIfChanged(): Promise<void> {
  try {
    const mtimeMs = await readMtime(config.sourcesFile);

    if (mtimeMs === lastSourcesMtimeMs) {
      return;
    }

    lastSourcesMtimeMs = mtimeMs;
    sources = await loadSources(config.sourcesFile);
    sourceOptions = await buildSourceOptions(sources, matcher);

    // Resolved directories may have moved, so every live stream is invalidated.
    await registry.reset();
    gateway.publishOptions(sourceOptions);
    logger.info(`reloaded ${sources.length} sources from ${config.sourcesFile}`);
  } catch (error) {
    logger.error("failed to reload source config", error);
    gateway.broadcastError("Failed to reload source configuration");
  }
}

async function readMtime(filePath: string): Promise<number> {
  return (await stat(filePath)).mtimeMs;
}

async function shutdown(): Promise<void> {
  clearInterval(reloadTimer);
  await gateway.close();
  await registry.closeAll();
  server.close();
  logger.info("shutdown complete");
}
