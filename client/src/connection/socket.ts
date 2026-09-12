import type { ClientMessage, ServerMessage } from "@log-aggregator/shared";
import { WS_URL } from "@/lib/env";

const INITIAL_RETRY_MS = 500;
const MAX_RETRY_MS = 10_000;

export interface LogSocketHandlers {
  onMessage: (message: ServerMessage) => void;
  onStatus: (connected: boolean) => void;
  onProtocolError: (message: string) => void;
}

export class LogSocket {
  private socket: WebSocket | undefined;
  private retryTimer: number | undefined;
  private retryDelayMs = INITIAL_RETRY_MS;
  private disposed = false;

  constructor(private readonly handlers: LogSocketHandlers) {}

  connect(): void {
    if (this.disposed || this.socket) {
      return;
    }

    const socket = new WebSocket(WS_URL);
    this.socket = socket;

    socket.addEventListener("open", () => {
      this.retryDelayMs = INITIAL_RETRY_MS;
      this.handlers.onStatus(true);
    });

    socket.addEventListener("message", (event: MessageEvent<string>) => {
      try {
        this.handlers.onMessage(JSON.parse(event.data) as ServerMessage);
      } catch {
        this.handlers.onProtocolError("Received an unreadable message from the server");
      }
    });

    socket.addEventListener("close", () => this.handleClose(socket));
    socket.addEventListener("error", () => socket.close());
  }

  send(message: ClientMessage): boolean {
    if (this.socket?.readyState !== WebSocket.OPEN) {
      return false;
    }

    this.socket.send(JSON.stringify(message));

    return true;
  }

  dispose(): void {
    this.disposed = true;

    if (this.retryTimer !== undefined) {
      window.clearTimeout(this.retryTimer);
      this.retryTimer = undefined;
    }

    const socket = this.socket;
    this.socket = undefined;
    socket?.close();
  }

  private handleClose(socket: WebSocket): void {
    if (this.disposed || socket !== this.socket) {
      return;
    }

    this.socket = undefined;
    this.handlers.onStatus(false);

    // Jitter keeps several tabs from stampeding a restarting backend in lockstep.
    const delay = this.retryDelayMs * (0.5 + Math.random() / 2);
    this.retryDelayMs = Math.min(this.retryDelayMs * 2, MAX_RETRY_MS);
    this.retryTimer = window.setTimeout(() => {
      this.retryTimer = undefined;
      this.connect();
    }, delay);
  }
}
