import type { ClientMessage, ServerMessage } from "@log-aggregator/shared";
import { Wifi, WifiOff } from "lucide-react";
import { useEffect, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { FilterPanel } from "@/components/FilterPanel";
import { LogViewer } from "@/components/LogViewer";
import { SourceSelector } from "@/components/SourceSelector";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { LogWebSocketClient } from "@/services/websocketClient";
import { useLogStore } from "@/stores/logStore";
import { useSourceStore } from "@/stores/sourceStore";

export function Dashboard() {
  const clientRef = useRef<LogWebSocketClient | null>(null);
  const { connected, error, eventCount, filter } = useLogStore(
    useShallow((state) => ({
      connected: state.connected,
      error: state.error,
      eventCount: state.events.length,
      filter: state.filter,
    })),
  );
  const { handleLogMessage, setConnected } = useLogStore(
    useShallow((state) => ({
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

  function sendMessage(message: ClientMessage) {
    clientRef.current?.send(message);
  }

  useEffect(() => {
    if (connected) {
      sendMessage({ payload: filter, type: "filter" });
    }
  }, [connected, filter]);

  return (
    <main className="gap-4 grid grid-rows-[auto_auto_auto_auto_minmax(0,1fr)] p-3 md:p-5 h-dvh min-h-0 overflow-hidden">
      <header className="flex md:flex-row flex-col md:justify-between items-stretch md:items-end gap-4">
        <div>
          <p className="mb-1 font-bold text-[#be5237] text-xs uppercase">
            Local cluster
          </p>
          <h1 className="m-0 font-heading text-[2.35rem] md:text-[clamp(2rem,8vw,4rem)] leading-[0.95]">
            Log Aggregator
          </h1>
        </div>
        <Badge
          variant={connected ? "secondary" : "outline"}
          className={cn(
            "gap-2 bg-secondary px-3 border-border rounded-[7px] min-h-9 text-[#7b3025]",
            connected && "text-primary",
          )}
        >
          {connected ? <Wifi size={18} /> : <WifiOff size={18} />}
          <span>{connected ? "Connected" : "Disconnected"}</span>
        </Badge>
      </header>

      <section className="items-stretch gap-3 grid grid-cols-1 min-[1180px]:grid-cols-[minmax(0,1fr)_auto]">
        <SourceSelector sendMessage={sendMessage} />
      </section>

      <FilterPanel />

      {error ? (
        <div
          className="bg-[#fff1eb] px-4 py-3 border border-[#e0a18e] rounded-lg text-[#7b3025]"
          role="status"
        >
          {error}
        </div>
      ) : null}

      <div className="text-muted-foreground text-sm">
        <span>{eventCount.toLocaleString()} events buffered</span>
      </div>
      <LogViewer />
    </main>
  );
}
