import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import type { LogFilter, LogPageRequest } from "@log-aggregator/shared";

import { LogAggregatorService } from "./services/LogAggregatorService.js";
import { defaultLogFilter, mergeLogFilter } from "./services/logFilter.js";
import { WebSocketGateway } from "./websocket/WebSocketGateway.js";

const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? 3000);

const service = new LogAggregatorService();
const server = createServer((request, response) => {
  const requestUrl = new URL(
    request.url ?? "/",
    `http://${request.headers.host ?? "localhost"}`,
  );

  if (request.method === "OPTIONS") {
    sendNoContent(response);
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/health") {
    sendJson(response, { ok: true });
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/options") {
    sendJson(response, service.getOptions());
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/snapshot") {
    sendJson(response, service.getSnapshot());
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/logs") {
    void sendLogPage(request, response);
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
    ...corsHeaders,
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
}

function sendNoContent(response: ServerResponse): void {
  response.writeHead(204, corsHeaders);
  response.end();
}

async function sendLogPage(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  try {
    const body = (await readJsonBody(request)) as LogPageRequest & {
      filter?: Partial<LogFilter>;
    };
    const filter = body.filter
      ? mergeLogFilter(defaultLogFilter, body.filter)
      : defaultLogFilter;

    sendJson(response, service.getEventPage(filter, body));
  } catch {
    sendJson(response, { error: "Invalid log page request" }, 400);
  }
}

function readJsonBody(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    request.on("data", (chunk: Buffer | string) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    request.on("error", reject);
    request.on("end", () => {
      try {
        const content = Buffer.concat(chunks).toString("utf8");
        resolve(content ? JSON.parse(content) : {});
      } catch (error) {
        reject(error);
      }
    });
  });
}

const corsHeaders = {
  "access-control-allow-headers": "content-type",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-origin": "*",
};

async function shutdown(): Promise<void> {
  await service.stop();
  await gateway.close();
  server.close(() => process.exit(0));
}
