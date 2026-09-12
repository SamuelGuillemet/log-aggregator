import type { Server as HttpServer } from "node:http";
import {
  PROTOCOL_VERSION,
  type LogTableSchema,
  type SourceOptions,
  decodeClientMessage,
} from "@log-aggregator/shared";
import { WebSocketServer, type WebSocket } from "ws";
import type { StreamRegistry } from "../domain/streamRegistry.js";
import { describe, logger } from "../util/logger.js";
import type { OriginGuard } from "./origin.js";
import { send } from "./outbound.js";
import { Session } from "./session.js";

const HEARTBEAT_INTERVAL_MS = 30_000;

interface Connection {
  socket: WebSocket;
  session: Session;
  alive: boolean;
}

export interface GatewayDeps {
  originGuard: OriginGuard;
  registry: StreamRegistry;
  schema: LogTableSchema;
  maxLiveBatch: number;
  getOptions: () => SourceOptions;
}

export interface Gateway {
  getSession: (clientId: string) => Session | undefined;
  publishOptions: (options: SourceOptions) => void;
  broadcastError: (message: string) => void;
  close: () => Promise<void>;
}

export function attachWsGateway(server: HttpServer, deps: GatewayDeps): Gateway {
  const connections = new Map<string, Connection>();
  const webSocketServer = new WebSocketServer({ maxPayload: 256 * 1_024, noServer: true });

  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url ?? "/", "http://localhost");

    if (url.pathname !== "/ws") {
      socket.destroy();
      return;
    }

    if (!deps.originGuard(request.headers.origin, request.socket.remoteAddress)) {
      logger.warn(`rejected upgrade from origin ${request.headers.origin ?? "<none>"}`);
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      socket.destroy();
      return;
    }

    webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
      webSocketServer.emit("connection", webSocket);
    });
  });

  webSocketServer.on("connection", (socket: WebSocket) => {
    const session = new Session(socket, {
      maxLiveBatch: deps.maxLiveBatch,
      registry: deps.registry,
      schema: deps.schema,
    });
    const connection: Connection = { alive: true, session, socket };

    connections.set(session.id, connection);
    logger.info(`client connected ${session.id} (${connections.size} total)`);

    send(socket, {
      clientId: session.id,
      options: deps.getOptions(),
      protocolVersion: PROTOCOL_VERSION,
      type: "connected",
    });

    socket.on("pong", () => {
      connection.alive = true;
    });

    socket.on("message", (raw: Buffer | ArrayBuffer | Buffer[]) => {
      const decoded = decodeClientMessage(toText(raw));

      if (!decoded.ok) {
        // v1 cast the payload and let `handlers[unknownType]()` take down the process.
        send(socket, { message: "Invalid message", details: decoded.error, type: "error" });
        return;
      }

      try {
        session.handleMessage(decoded.value);
      } catch (error) {
        logger.error(`session ${session.id} failed to handle ${decoded.value.type}`, error);
        send(socket, {
          details: describe(error),
          message: "Failed to handle message",
          type: "error",
        });
      }
    });

    socket.on("error", (error) => logger.warn(`socket error: ${describe(error)}`));
    socket.on("close", () => {
      connections.delete(session.id);
      session.close();
      logger.info(`client disconnected ${session.id} (${connections.size} remaining)`);
    });
  });

  // Without this, a half-open TCP connection keeps a session, and its stream
  // reference, alive forever.
  const heartbeat = setInterval(() => {
    for (const connection of connections.values()) {
      if (!connection.alive) {
        connection.socket.terminate();
        continue;
      }

      connection.alive = false;
      connection.socket.ping();
    }
  }, HEARTBEAT_INTERVAL_MS);
  heartbeat.unref();

  return {
    broadcastError: (message) => {
      for (const connection of connections.values()) {
        send(connection.socket, { message, type: "error" });
      }
    },
    close: async () => {
      clearInterval(heartbeat);

      for (const connection of connections.values()) {
        connection.session.close();
        connection.socket.close(1_001, "Server shutting down");
      }

      connections.clear();

      await new Promise<void>((resolve) => webSocketServer.close(() => resolve()));
    },
    getSession: (clientId) => connections.get(clientId)?.session,
    publishOptions: (options) => {
      for (const connection of connections.values()) {
        send(connection.socket, { options, type: "source-options" });
      }
    },
  };
}

function toText(raw: Buffer | ArrayBuffer | Buffer[]): string {
  if (Array.isArray(raw)) {
    return Buffer.concat(raw).toString("utf8");
  }

  return Buffer.isBuffer(raw) ? raw.toString("utf8") : Buffer.from(raw).toString("utf8");
}
