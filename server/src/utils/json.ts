import type { IncomingMessage, ServerResponse } from "node:http";

export function sendJson(
  response: ServerResponse,
  body: unknown,
  headers: Record<string, string> = {},
  statusCode = 200,
): void {
  response.writeHead(statusCode, {
    ...headers,
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
}

export function readJsonBody(request: IncomingMessage): Promise<unknown> {
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
