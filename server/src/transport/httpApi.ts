import type { IncomingMessage, ServerResponse } from "node:http";

import type { LogHistoryQuery } from "@log-aggregator/shared";
import { readJsonBody, sendJson } from "../utils/json.js";
import type { ClientSession } from "./clientSession.js";

export const CORS_HEADER = {
  "access-control-allow-headers": "content-type,x-log-client-id",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-origin": "*",
};

export function routeHttpRequest(
  request: IncomingMessage,
  response: ServerResponse,
  clients: Map<string, ClientSession>,
): void {
  const requestUrl = new URL(
    request.url ?? "/",
    `http://${request.headers.host ?? "localhost"}`,
  );

  console.info(`${request.method} ${requestUrl.pathname}`);

  if (request.method === "OPTIONS") {
    sendNoContent(response);
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/logs") {
    void sendLogPage(request, response, clients);
    return;
  }

  sendJson(response, { error: "Not found" }, CORS_HEADER, 404);
}

function sendNoContent(response: ServerResponse): void {
  response.writeHead(204, CORS_HEADER);
  response.end();
}

async function sendLogPage(
  request: IncomingMessage,
  response: ServerResponse,
  clients: Map<string, ClientSession>,
): Promise<void> {
  const client = clients.get(readClientId(request) ?? "");

  if (!client) {
    sendJson(response, { error: "Unknown log client" }, CORS_HEADER, 404);
    return;
  }

  try {
    const pageRequest = (await readJsonBody(request)) as LogHistoryQuery;

    sendJson(
      response,
      client.service.getHistoryPage(pageRequest, client.filter),
      CORS_HEADER,
    );
  } catch {
    sendJson(response, { error: "Invalid log page request" }, CORS_HEADER, 400);
  }
}

function readClientId(request: IncomingMessage): string | undefined {
  const value = request.headers["x-log-client-id"];

  return Array.isArray(value) ? value[0] : value;
}
