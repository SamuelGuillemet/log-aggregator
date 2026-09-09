import type { Server as HttpServer } from "node:http";
import type { LogSourceConfig, SourceOptions } from "@log-aggregator/shared";
import { WebSocketServer } from "ws";
import { LogAggregatorService } from "../application/logAggregatorService.js";
import { PROTOCOL_VERSION, type ServerConfig } from "../config.js";
import {
  bindSessionStreaming,
  type ClientSession,
  closeSession,
  createClientSession,
  handleClientMessage,
  sendSnapshot,
} from "./clientSession.js";
import { sendMessage } from "./messageCodec.js";

export interface GatewayContext {
  broadcastError: (message: string, error: unknown) => void;
  closeAll: () => Promise<void>;
  clients: Map<string, ClientSession>;
  server: WebSocketServer;
  updateSources: (sources: LogSourceConfig[], options: SourceOptions) => void;
}

export function attachWsGateway(
  server: HttpServer,
  config: ServerConfig,
  sourceOptions: SourceOptions,
): GatewayContext {
  const clients = new Map<string, ClientSession>();
  const webSocketServer = new WebSocketServer({ noServer: true });
  let currentSourceOptions = sourceOptions;

  server.on("upgrade", (request, socket, head) => {
    const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

    if (requestUrl.pathname !== "/ws") {
      socket.destroy();
      return;
    }

    webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
      webSocketServer.emit("connection", webSocket, request);
    });
  });

  webSocketServer.on("connection", (socket) => {
    const service = new LogAggregatorService(config);
    const client = createClientSession(socket, service);
    clients.set(client.id, client);

    bindSessionStreaming(client);

    sendMessage(socket, {
      payload: {
        clientId: client.id,
        options: currentSourceOptions,
        protocolVersion: PROTOCOL_VERSION,
      },
      type: "connected",
    });
    sendSnapshot(client);

    socket.on("message", (rawMessage) => {
      void handleClientMessage(client, rawMessage);
    });
    socket.on("close", () => {
      void closeClient(client.id, clients);
    });
  });

  return {
    broadcastError: (message, error) => {
      for (const client of clients.values()) {
        sendMessage(client.socket, {
          payload: { details: String(error), message },
          type: "error",
        });
      }
    },
    clients,
    closeAll: async () => {
      const activeClients = [...clients.values()];

      await Promise.all(activeClients.map((client) => closeClient(client.id, clients)));

      for (const client of activeClients) {
        client.socket.close();
      }

      webSocketServer.close();
    },
    server: webSocketServer,
    updateSources: (sources, options) => {
      config.sources = sources;
      currentSourceOptions = options;

      for (const client of clients.values()) {
        sendMessage(client.socket, { payload: options, type: "source-options" });
      }
    },
  };
}

async function closeClient(clientId: string, clients: Map<string, ClientSession>): Promise<void> {
  const client = clients.get(clientId);

  if (!client) {
    return;
  }

  clients.delete(clientId);
  await closeSession(client);
}
