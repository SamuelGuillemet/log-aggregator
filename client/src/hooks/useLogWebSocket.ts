import type { ClientMessage, ServerMessage } from "@log-aggregator/shared";
import { useEffect, useRef } from "react";
import { useShallow } from "zustand/react/shallow";

import { LogWebSocketClient } from "@/services/websocketClient";
import { useLogStore } from "@/stores/logStore";
import { useSourceStore } from "@/stores/sourceStore";

export function useLogWebSocket() {
  const clientRef = useRef<LogWebSocketClient | null>(null);
  const wasConnectedRef = useRef(false);
  const { connected, filter, handleLogMessage, setConnected, sources } =
    useLogStore(
      useShallow((state) => ({
        connected: state.connected,
        filter: state.filter,
        handleLogMessage: state.handleServerMessage,
        setConnected: state.setConnected,
        sources: state.sources,
      })),
    );
  const { handleSourceMessage, selection } = useSourceStore(
    useShallow((state) => ({
      handleSourceMessage: state.handleServerMessage,
      selection: state.selection,
    })),
  );

  useEffect(() => {
    function handleMessage(message: ServerMessage) {
      handleLogMessage(message);
      handleSourceMessage(message);
    }

    const client = new LogWebSocketClient(handleMessage, setConnected);
    clientRef.current = client;
    const connectTimer = window.setTimeout(() => client.connect(), 0);

    return () => {
      window.clearTimeout(connectTimer);
      client.disconnect();
      clientRef.current = null;
    };
  }, [handleLogMessage, handleSourceMessage, setConnected]);

  useEffect(() => {
    if (connected) {
      clientRef.current?.send({ payload: filter, type: "filter" });
    }
  }, [connected, filter]);

  useEffect(() => {
    if (connected && !wasConnectedRef.current && sources.length > 0) {
      const project = selection.project.trim();

      if (
        selection.environment &&
        selection.country &&
        project &&
        selection.date
      ) {
        clientRef.current?.send({
          payload: { ...selection, project },
          type: "subscribe",
        });
      }
    }

    wasConnectedRef.current = connected;
  }, [connected, selection, sources.length]);

  function sendMessage(message: ClientMessage) {
    clientRef.current?.send(message);
  }

  return { sendMessage };
}
