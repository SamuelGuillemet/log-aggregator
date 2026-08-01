import type { ClientMessage, ServerMessage } from "@log-aggregator/shared";
import { useEffect, useRef } from "react";
import { useShallow } from "zustand/react/shallow";

import { LogWebSocketClient } from "@/services/websocketClient";
import { useLogStore } from "@/stores/logStore";
import { useSourceStore } from "@/stores/sourceStore";

export function useLogWebSocket() {
  const clientRef = useRef<LogWebSocketClient | null>(null);
  const { connected, filter, handleLogMessage, setConnected } = useLogStore(
    useShallow((state) => ({
      connected: state.connected,
      filter: state.filter,
      handleLogMessage: state.handleServerMessage,
      setConnected: state.setConnected,
    })),
  );
  const handleSourceMessage = useSourceStore(
    (state) => state.handleServerMessage,
  );

  useEffect(() => {
    function handleMessage(message: ServerMessage) {
      handleLogMessage(message);
      handleSourceMessage(message);
    }

    const client = new LogWebSocketClient(
      undefined,
      handleMessage,
      setConnected,
    );
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

  function sendMessage(message: ClientMessage) {
    clientRef.current?.send(message);
  }

  return { sendMessage };
}
