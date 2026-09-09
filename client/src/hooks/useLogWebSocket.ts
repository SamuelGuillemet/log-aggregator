import type { ClientMessage, ServerMessage } from "@log-aggregator/shared";
import { useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useLogStore } from "@/store/logStore";
import { useSourceStore } from "@/store/sourceStore";
import { LogWebSocketClient } from "../lib/connection/websocketClient";
import { useCompatibilityStore } from "../store/compatibilityStore";

export function useLogWebSocket() {
  const clientRef = useRef<LogWebSocketClient | null>(null);
  const wasConnectedRef = useRef(false);
  const [streamingPaused, setStreamingPaused] = useState(false);
  const { connected, filter, handleLogMessage, setConnected, sources } = useLogStore(
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
  const handleCompatibilityMessage = useCompatibilityStore((state) => state.handleServerMessage);

  useEffect(() => {
    function handleMessage(message: ServerMessage) {
      handleLogMessage(message);
      handleSourceMessage(message);
      handleCompatibilityMessage(message);
    }

    const client = new LogWebSocketClient(handleMessage, (nextConnected) => {
      if (!nextConnected) {
        setStreamingPaused(false);
      }

      setConnected(nextConnected);
    });
    clientRef.current = client;
    const connectTimer = window.setTimeout(() => client.connect(), 0);

    return () => {
      window.clearTimeout(connectTimer);
      client.disconnect();
      clientRef.current = null;
    };
  }, [handleCompatibilityMessage, handleLogMessage, handleSourceMessage, setConnected]);

  useEffect(() => {
    if (connected) {
      clientRef.current?.send({ payload: filter, type: "filter" });
    }
  }, [connected, filter]);

  useEffect(() => {
    if (connected && !wasConnectedRef.current && sources.length > 0) {
      const project = selection.project.trim();

      if (selection.sourceId && project && selection.date) {
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

  function toggleStreaming() {
    const nextPaused = !streamingPaused;
    sendMessage({ type: nextPaused ? "pause" : "resume" });
    setStreamingPaused(nextPaused);
  }

  return { sendMessage, streamingPaused, toggleStreaming };
}
