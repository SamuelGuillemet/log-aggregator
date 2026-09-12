import type { IncomingMessage, ServerResponse } from "node:http";
import { PROTOCOL_VERSION, decodeHistoryQuery } from "@log-aggregator/shared";
import { corsHeaders, type OriginGuard } from "./origin.js";
import type { Session } from "./session.js";

const MAX_BODY_BYTES = 1_024 * 1_024;

export interface HttpDeps {
  getSession: (clientId: string) => Session | undefined;
  originGuard: OriginGuard;
}

export function createHttpHandler(deps: HttpDeps) {
  return (request: IncomingMessage, response: ServerResponse): void => {
    const origin = request.headers.origin;

    if (!deps.originGuard(origin, request.socket.remoteAddress)) {
      sendJson(response, 403, { error: "Origin not allowed" }, corsHeaders(undefined));
      return;
    }

    const headers = corsHeaders(origin);
    const url = new URL(request.url ?? "/", "http://localhost");

    if (request.method === "OPTIONS") {
      // Chrome's Private Network Access preflight: a public HTTPS page reaching a
      // loopback server is refused without this acknowledgement.
      if (request.headers["access-control-request-private-network"] === "true") {
        headers["access-control-allow-private-network"] = "true";
      }

      response.writeHead(204, headers);
      response.end();
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/health") {
      sendJson(response, 200, { protocolVersion: PROTOCOL_VERSION, status: "ok" }, headers);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/logs") {
      void sendLogPage(request, response, headers, deps.getSession);
      return;
    }

    sendJson(response, 404, { error: "Not found" }, headers);
  };
}

async function sendLogPage(
  request: IncomingMessage,
  response: ServerResponse,
  headers: Record<string, string>,
  getSession: (clientId: string) => Session | undefined,
): Promise<void> {
  const session = getSession(readClientId(request) ?? "");

  if (!session) {
    sendJson(response, 404, { error: "Unknown log client" }, headers);
    return;
  }

  const body = await readJsonBody(request);

  if (!body.ok) {
    sendJson(response, 400, { error: body.error }, headers);
    return;
  }

  const query = decodeHistoryQuery(body.value);

  if (!query.ok) {
    sendJson(response, 400, { error: query.error }, headers);
    return;
  }

  sendJson(response, 200, session.getPage(query.value), headers);
}

function readClientId(request: IncomingMessage): string | undefined {
  const value = request.headers["x-log-client-id"];

  return Array.isArray(value) ? value[0] : value;
}

type BodyResult = { ok: true; value: unknown } | { ok: false; error: string };

/** Capped: v1's reader buffered an unbounded request body. */
function readJsonBody(request: IncomingMessage): Promise<BodyResult> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;

    const settle = (result: BodyResult) => {
      if (!settled) {
        settled = true;
        resolve(result);
      }
    };

    request.on("data", (chunk: Buffer) => {
      size += chunk.length;

      if (size > MAX_BODY_BYTES) {
        request.destroy();
        settle({ error: "Request body too large", ok: false });
        return;
      }

      chunks.push(chunk);
    });
    request.on("error", () => settle({ error: "Request stream failed", ok: false }));
    request.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8");

      try {
        settle({ ok: true, value: text ? JSON.parse(text) : {} });
      } catch {
        settle({ error: "Body is not valid JSON", ok: false });
      }
    });
  });
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  body: unknown,
  headers: Record<string, string>,
): void {
  response.writeHead(statusCode, {
    ...headers,
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
}
