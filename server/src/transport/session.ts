import { randomUUID } from "node:crypto";
import {
  DEFAULT_PAGE_SIZE,
  type ClientMessage,
  type LogEvent,
  type LogFilter,
  type LogHistoryQuery,
  type LogPage,
  type LogTableSchema,
  type StreamStatus,
} from "@log-aggregator/shared";
import type { WebSocket } from "ws";
import { MATCH_ALL, type StoredEvent } from "../domain/eventBuffer.js";
import { compileFilter } from "../domain/filter.js";
import type { LogStream } from "../domain/logStream.js";
import type { StreamHandle, StreamRegistry } from "../domain/streamRegistry.js";
import { send } from "./outbound.js";

const EMPTY_PAGE: LogPage = { events: [], hasMore: false };

export interface SessionDeps {
  registry: StreamRegistry;
  schema: LogTableSchema;
  maxLiveBatch: number;
}

/**
 * A client's *view* of a stream: a filter and a pause flag, nothing more. v1 made
 * this object own the watchers and the buffer too, which is why nothing could be
 * shared between connections.
 */
export class Session {
  readonly id = randomUUID();

  private match = MATCH_ALL;
  private paused = false;
  private handle: StreamHandle | undefined;
  private detach: (() => void) | undefined;

  constructor(
    private readonly socket: WebSocket,
    private readonly deps: SessionDeps,
  ) {}

  handleMessage(message: ClientMessage): void {
    switch (message.type) {
      case "subscribe":
        this.subscribe(message);
        return;
      case "unsubscribe":
        this.detachStream();
        this.sendSnapshot();
        return;
      case "filter":
        this.setFilter(message.filter);
        return;
      case "pause":
        this.paused = true;
        this.sendStatus();
        return;
      case "resume":
        this.paused = false;
        this.sendSnapshot();
        return;
      case "ping":
        send(this.socket, { timestampMs: Date.now(), type: "pong" });
        return;
      default:
        // Exhaustiveness: adding a message type without handling it fails to compile.
        assertNever(message);
    }
  }

  getPage(query: LogHistoryQuery): LogPage {
    const stream = this.handle?.stream;

    if (!stream) {
      return EMPTY_PAGE;
    }

    return query.type === "before"
      ? stream.buffer.before(query.cursor, query.limit, this.match)
      : stream.buffer.until(query.timestampMs, query.limit, this.match);
  }

  close(): void {
    this.detachStream();
  }

  private subscribe(message: Extract<ClientMessage, { type: "subscribe" }>): void {
    this.detachStream();

    const handle = this.deps.registry.acquire(message.selection);

    if (!handle) {
      send(this.socket, {
        message: `Unknown log source "${message.selection.sourceId}"`,
        type: "error",
      });
      this.sendSnapshot();
      return;
    }

    this.handle = handle;
    this.detach = handle.stream.subscribe({
      onBatch: (events) => this.sendLiveEvents(events),
      onError: (error) => send(this.socket, { message: error, type: "error" }),
      onReset: () => this.sendSnapshot(),
    });

    // A warm stream can answer immediately; a cold one answers from its onReset.
    if (handle.stream.isPrimed) {
      this.sendSnapshot();
    } else {
      this.sendStatus();
    }
  }

  private setFilter(filter: LogFilter): void {
    const compiled = compileFilter(filter);

    this.match = compiled.match;

    if (compiled.warning) {
      send(this.socket, { message: compiled.warning, type: "error" });
    }

    this.sendSnapshot();
  }

  private sendLiveEvents(stored: StoredEvent[]): void {
    const stream = this.handle?.stream;

    if (this.paused || !stream) {
      return;
    }

    const events: LogEvent[] = [];

    for (const candidate of stored) {
      if (this.match(candidate)) {
        events.push(candidate.event);
      }
    }

    if (events.length === 0) {
      return;
    }

    // Everything sent live is also in the shared buffer, so trimming an oversized
    // burst costs the client nothing but a scroll.
    const dropped = Math.max(0, events.length - this.deps.maxLiveBatch);
    const delivered = dropped > 0 ? events.slice(dropped) : events;
    const sent = send(
      this.socket,
      { bufferedEvents: stream.buffer.size, events: delivered, type: "logs" },
      { droppable: true },
    );

    if (dropped > 0 || !sent) {
      send(this.socket, {
        droppedEvents: sent ? dropped : events.length,
        type: "lagged",
      });
    }
  }

  private sendSnapshot(): void {
    const stream = this.handle?.stream;

    send(this.socket, {
      page: stream ? stream.buffer.latest(DEFAULT_PAGE_SIZE, this.match) : EMPTY_PAGE,
      schema: this.deps.schema,
      status: this.status(stream),
      type: "snapshot",
    });
  }

  private sendStatus(): void {
    send(this.socket, { status: this.status(this.handle?.stream), type: "status" });
  }

  private status(stream: LogStream | undefined): StreamStatus {
    return {
      bufferedEvents: stream?.buffer.size ?? 0,
      paused: this.paused,
      selection: stream?.selection,
      sources: stream?.sources ?? [],
    };
  }

  private detachStream(): void {
    this.detach?.();
    this.detach = undefined;
    this.handle?.release();
    this.handle = undefined;
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled message: ${JSON.stringify(value)}`);
}
