import type { Server } from "node:http";
import type { ClientMessage, ServerMessage } from "@log-aggregator/shared";
import { WebSocket, WebSocketServer } from "ws";

import type { LogAggregatorService } from "../services/LogAggregatorService.js";

interface ClientState {
  paused: boolean;
}

export class WebSocketGateway {
  private readonly clients = new Map<WebSocket, ClientState>();
  private readonly server: WebSocketServer;

  constructor(
    httpServer: Server,
    private readonly service: LogAggregatorService,
  ) {
    this.server = new WebSocketServer({ server: httpServer, path: "/ws" });
    this.server.on("connection", (socket) => this.handleConnection(socket));

    this.service.eventBus.on("log", (event) =>
      this.broadcast({ type: "log", payload: event }, (state) => !state.paused),
    );
    this.service.eventBus.on("stats", (stats) =>
      this.broadcast({ type: "stats", payload: stats }),
    );
    this.service.eventBus.on("error", (error) =>
      this.broadcast({ type: "error", payload: error }),
    );
  }

  close(): Promise<void> {
    return new Promise((resolve, reject) =>
      this.server.close((error) => (error ? reject(error) : resolve())),
    );
  }

  private handleConnection(socket: WebSocket): void {
    this.clients.set(socket, { paused: false });
    this.send(socket, {
      type: "connected",
      payload: { options: this.service.getOptions() },
    });
    this.send(socket, {
      type: "snapshot",
      payload: this.service.getSnapshot(),
    });

    socket.on(
      "message",
      (data) => void this.handleMessage(socket, data.toString()),
    );
    socket.on("close", () => this.clients.delete(socket));
    socket.on("error", () => this.clients.delete(socket));
  }

  private async handleMessage(
    socket: WebSocket,
    rawMessage: string,
  ): Promise<void> {
    let message: ClientMessage;

    try {
      message = JSON.parse(rawMessage) as ClientMessage;
    } catch {
      this.send(socket, {
        type: "error",
        payload: { message: "Invalid JSON message" },
      });
      return;
    }

    const state = this.clients.get(socket);

    if (!state) {
      return;
    }

    if (message.type === "subscribe") {
      await this.service.selectSources(message.payload);
      this.send(socket, {
        type: "snapshot",
        payload: this.service.getSnapshot(),
      });
      return;
    }

    if (message.type === "unsubscribe") {
      await this.service.stop();
      this.send(socket, {
        type: "snapshot",
        payload: this.service.getSnapshot(),
      });
      return;
    }

    if (message.type === "pause") {
      state.paused = true;
      return;
    }

    if (message.type === "resume") {
      state.paused = false;
      this.send(socket, {
        type: "snapshot",
        payload: this.service.getSnapshot(),
      });
      return;
    }

    if (message.type === "ping") {
      this.send(socket, {
        type: "pong",
        payload: { timestamp: new Date().toISOString() },
      });
    }
  }

  private broadcast(
    message: ServerMessage,
    predicate: (state: ClientState) => boolean = () => true,
  ): void {
    for (const [socket, state] of this.clients) {
      if (predicate(state)) {
        this.send(socket, message);
      }
    }
  }

  private send(socket: WebSocket, message: ServerMessage): void {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  }
}
