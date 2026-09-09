import { createServer } from "node:http";
import { watch } from "chokidar";
import { loadConfig, loadSources } from "./config.js";
import { getSourceOptions } from "./domain/sourceResolver.js";
import { routeHttpRequest } from "./transport/httpApi.js";
import { attachWsGateway } from "./transport/wsGateway.js";

const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? 3000);

const config = await loadConfig();
const sourceOptions = await getSourceOptions(config.sources);

const server = createServer((request, response) => {
  routeHttpRequest(request, response, gateway.clients);
});

const gateway = attachWsGateway(server, config, sourceOptions);
const sourceConfigWatcher = watch(config.sourcesFile, {
  awaitWriteFinish: {
    pollInterval: 50,
    stabilityThreshold: 250,
  },
  ignoreInitial: true,
});
let sourceReloadTask = Promise.resolve();

sourceConfigWatcher.on("add", queueSourceReload);
sourceConfigWatcher.on("change", queueSourceReload);
sourceConfigWatcher.on("error", (error) =>
  reportSourceReloadError("Source config watcher error", error),
);

server.listen(port, host, () => {
  console.info(`HTTP ready on http://${host}:${port}`);
  console.info(`WebSocket ready on ws://${host}:${port}/ws`);
});

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

function queueSourceReload(): void {
  sourceReloadTask = sourceReloadTask.then(reloadSources).catch((error: unknown) => {
    reportSourceReloadError("Failed to reload source config", error);
  });
}

async function reloadSources(): Promise<void> {
  const sources = await loadSources(config.sourcesFile);
  const options = await getSourceOptions(sources);
  gateway.updateSources(sources, options);
  console.info(`Reloaded ${sources.length} sources from ${config.sourcesFile}`);
}

function reportSourceReloadError(message: string, error: unknown): void {
  console.error(`${message}:`, error);
  gateway.broadcastError(message, error);
}

async function shutdown(): Promise<void> {
  await sourceConfigWatcher.close();
  await sourceReloadTask;
  await gateway.closeAll();
  server.close(() => process.exit(0));
}
