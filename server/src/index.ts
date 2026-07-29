import { createReadStream, existsSync, statSync } from "node:fs";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { LogAggregatorService } from "./services/LogAggregatorService.js";
import { WebSocketGateway } from "./websocket/WebSocketGateway.js";

const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? 3000);
const serverRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const staticDirectory = resolveStaticDirectory();

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

  if (serveStatic(request, response)) {
    return;
  }

  sendJson(response, { error: "Not found" }, 404);
});

const gateway = new WebSocketGateway(server, service);

server.listen(port, host, () => {
  console.info(`HTTP ready on http://${host}:${port}`);
  console.info(`WebSocket ready on ws://${host}:${port}/ws`);

  if (staticDirectory) {
    console.info(`Static frontend ready from ${staticDirectory}`);
  }
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

function resolveStaticDirectory(): string | undefined {
  const candidates = [
    process.env.LOG_AGGREGATOR_STATIC_DIR,
    path.join(serverRoot, "public"),
  ].filter((candidate): candidate is string => Boolean(candidate));

  return candidates
    .map((candidate) => path.resolve(candidate))
    .find((candidate) => existsSync(path.join(candidate, "index.html")));
}

function serveStatic(
  request: IncomingMessage,
  response: ServerResponse,
): boolean {
  if (!staticDirectory || request.method !== "GET" || !request.url) {
    return false;
  }

  let url: URL;

  try {
    url = new URL(request.url, `http://${host}:${port}`);
  } catch {
    response.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
    response.end("Bad request");
    return true;
  }

  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = resolveStaticPath(pathname);
  const readableFilePath = filePath ? findReadableFile(filePath) : undefined;
  const fallbackFilePath = path.extname(pathname)
    ? undefined
    : findReadableFile(path.join(staticDirectory, "index.html"));
  const servedFilePath = readableFilePath ?? fallbackFilePath;

  if (!servedFilePath) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return true;
  }

  response.writeHead(200, { "content-type": getContentType(servedFilePath) });
  createReadStream(servedFilePath).pipe(response);
  return true;
}

function resolveStaticPath(pathname: string): string | undefined {
  let decodedPathname: string;

  try {
    decodedPathname = decodeURIComponent(pathname);
  } catch {
    return undefined;
  }

  const filePath = path.resolve(staticDirectory ?? "", `.${decodedPathname}`);
  const relativePath = path.relative(staticDirectory ?? "", filePath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return undefined;
  }

  return filePath;
}

function findReadableFile(filePath: string): string | undefined {
  if (!existsSync(filePath)) {
    return undefined;
  }

  return statSync(filePath).isFile() ? filePath : undefined;
}

function getContentType(filePath: string): string {
  const contentTypes: Record<string, string> = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
  };

  return contentTypes[path.extname(filePath)] ?? "application/octet-stream";
}

async function shutdown(): Promise<void> {
  await service.stop();
  await gateway.close();
  server.close(() => process.exit(0));
}
