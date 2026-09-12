import type { ClientMessage, ServerMessage } from "@log-aggregator/shared";
import { useEffect, useRef } from "react";
import { FILTER_DEBOUNCE_MS } from "@/lib/env";
import { useConnectionStore } from "@/state/connectionStore";
import { useFilterStore } from "@/state/filterStore";
import { useLogsStore } from "@/state/logsStore";
import { useSourceStore } from "@/state/sourceStore";
import { LogSocket } from "./socket";

export interface LogConnection {
  startStream: () => void;
  stopStream: () => void;
  togglePause: () => void;
}

/**
 * Owns the single WebSocket and keeps the server in sync with the client's *desired*
 * state. On every reconnect the desired subscription is replayed, which replaces v1's
 * `wasConnectedRef` plus `sources.length > 0` heuristic that could silently fail to
 * restore a stream after a backend restart.
 *
 * Stores are read through `getState()` rather than subscriptions: this hook drives the
 * connection, it must not re-render for every message it routes.
 */
export function useLogConnection(): LogConnection {
  const socketRef = useRef<LogSocket | undefined>(undefined);
  const filter = useFilterStore((state) => state.filter);
  const connected = useConnectionStore((state) => state.connected);

  useEffect(() => {
    const socket: LogSocket = new LogSocket({
      onMessage: (message) => routeMessage(message, socket),
      onProtocolError: (message) => useConnectionStore.getState().setError(message),
      onStatus: (isConnected) => useConnectionStore.getState().setConnected(isConnected),
    });

    socketRef.current = socket;
    socket.connect();

    return () => {
      socket.dispose();
      socketRef.current = undefined;
    };
  }, []);

  // Debounced: v1 sent a message per keystroke, and each one forced a full rescan of
  // the server-side buffer.
  useEffect(() => {
    if (!connected) {
      return;
    }

    const timer = window.setTimeout(() => {
      socketRef.current?.send({ filter, type: "filter" });
    }, FILTER_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [connected, filter]);

  const send = (message: ClientMessage) => socketRef.current?.send(message);

  return {
    startStream: () => {
      useLogsStore.getState().reset();
      send({ selection: useSourceStore.getState().startStream(), type: "subscribe" });
    },
    stopStream: () => {
      useSourceStore.getState().stopStream();
      useLogsStore.getState().reset();
      send({ type: "unsubscribe" });
    },
    togglePause: () => {
      send({ type: useLogsStore.getState().status.paused ? "resume" : "pause" });
    },
  };
}

function routeMessage(message: ServerMessage, socket: LogSocket): void {
  const logs = useLogsStore.getState();
  const connection = useConnectionStore.getState();

  switch (message.type) {
    case "connected":
      connection.setIdentity(message.clientId, message.protocolVersion);
      connection.setError(undefined);
      useSourceStore.getState().setOptions(message.options);
      replayDesiredState(socket);
      return;
    case "source-options":
      useSourceStore.getState().setOptions(message.options);
      return;
    case "snapshot":
      connection.setError(undefined);
      logs.applySnapshot(message.page, message.schema, message.status);
      return;
    case "status":
      logs.applyStatus(message.status);
      return;
    case "logs":
      logs.applyLiveEvents(message.events, message.bufferedEvents);
      return;
    case "lagged":
      logs.reportLag(message.droppedEvents);
      return;
    case "error":
      connection.setError(message.message);
      return;
    case "pong":
      return;
  }
}

/** Re-asserts the client's intent against a server that has no memory of it. */
function replayDesiredState(socket: LogSocket): void {
  const active = useSourceStore.getState().active;

  socket.send({ filter: useFilterStore.getState().filter, type: "filter" });

  if (active) {
    socket.send({ selection: active, type: "subscribe" });
  }
}
