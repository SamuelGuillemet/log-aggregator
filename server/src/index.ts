import { createServer, type ServerResponse } from "node:http";

import { LogAggregatorService } from "./services/LogAggregatorService.js";
import { WebSocketGateway } from "./websocket/WebSocketGateway.js";

const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? 3000);

const service = new LogAggregatorService();
const server = createServer((request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    sendJson(response, { ok: true });
    return;
  }

  if (request.method === "GET" && request.url === "/api/options") {
    sendJson(response, service.getOptions());
    return;
  }

  if (request.method === "GET" && request.url === "/api/snapshot") {
    sendJson(response, service.getSnapshot());
    return;
  }

  sendJson(response, { error: "Not found" }, 404);
});

const gateway = new WebSocketGateway(server, service);

server.listen(port, host, () => {
  console.info(`HTTP ready on http://${host}:${port}`);
  console.info(`WebSocket ready on ws://${host}:${port}/ws`);
});

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

function sendJson(
  response: ServerResponse,
  body: unknown,
  statusCode = 200,
): void {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
}

async function shutdown(): Promise<void> {
  await service.stop();
  await gateway.close();
  server.close(() => process.exit(0));
}
