import type { ClientMessage, ServerMessage } from "@log-aggregator/shared";
import { WS_URL } from "@/constants/url";

type MessageListener = (message: ServerMessage) => void;
type StatusListener = (connected: boolean) => void;

export class LogWebSocketClient {
  private socket: WebSocket | undefined;
  private reconnectTimer: number | undefined;
  private reconnectDelayMs = 500;
  private shouldReconnect = false;

  constructor(
    private readonly onMessage: MessageListener,
    private readonly onStatus: StatusListener,
  ) {}

  connect(): void {
    this.disconnect(false);
    this.shouldReconnect = true;

    const socket = new WebSocket(WS_URL);
    this.socket = socket;
    socket.addEventListener("open", () => {
      this.reconnectDelayMs = 500;
      this.onStatus(true);
    });
    socket.addEventListener("message", (event) =>
      this.handleMessage(event.data),
    );
    socket.addEventListener("close", () => this.scheduleReconnect(socket));
    socket.addEventListener("error", () => socket.close());
  }

  disconnect(reportStatus = true): void {
    this.shouldReconnect = false;

    if (this.reconnectTimer) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    const socket = this.socket;
    this.socket = undefined;
    socket?.close();

    if (reportStatus) {
      this.onStatus(false);
    }
  }

  send(message: ClientMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    }
  }

  private handleMessage(rawMessage: string): void {
    try {
      this.onMessage(JSON.parse(rawMessage) as ServerMessage);
    } catch {
      this.onMessage({
        payload: { message: "Received invalid server message" },
        type: "error",
      });
    }
  }

  private scheduleReconnect(socket: WebSocket): void {
    if (!this.shouldReconnect || socket !== this.socket) {
      return;
    }

    this.onStatus(false);
    this.socket = undefined;

    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 2, 5_000);
      this.connect();
    }, this.reconnectDelayMs);
  }
}
