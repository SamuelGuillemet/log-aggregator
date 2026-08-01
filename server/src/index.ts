import { createServer } from "node:http";

import { loadConfig } from "./config.js";
import { getSourceOptions } from "./domain/sourceResolver.js";
import { routeHttpRequest } from "./transport/httpApi.js";
import { attachWsGateway } from "./transport/wsGateway.js";

const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? 3000);

const config = await loadConfig();
const sourceOptions = getSourceOptions(config.matrix);

const server = createServer((request, response) => {
  routeHttpRequest(request, response, gateway.clients);
});

const gateway = attachWsGateway(server, config, sourceOptions);

server.listen(port, host, () => {
  console.info(`HTTP ready on http://${host}:${port}`);
  console.info(`WebSocket ready on ws://${host}:${port}/ws`);
});

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

async function shutdown(): Promise<void> {
  await gateway.closeAll();
  server.close(() => process.exit(0));
}
