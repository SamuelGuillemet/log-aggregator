import type { ClientMessage, ServerMessage } from "@log-aggregator/shared";
import { Pause, Play, RotateCcw, Wifi, WifiOff } from "lucide-react";
import { useEffect, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { FilterPanel } from "@/components/FilterPanel";
import { LogViewer } from "@/components/LogViewer";
import { SourceSelector } from "@/components/SourceSelector";
import { StatsPanel } from "@/components/StatsPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LogWebSocketClient } from "@/services/websocketClient";
import { useLogStore } from "@/stores/logStore";
import { useSourceStore } from "@/stores/sourceStore";

export function Dashboard() {
  const clientRef = useRef<LogWebSocketClient | null>(null);
  const { connected, error, eventCount, paused } = useLogStore(
    useShallow((state) => ({
      connected: state.connected,
      error: state.error,
      eventCount: state.events.length,
      paused: state.paused,
    })),
  );
  const { clear, handleLogMessage, setConnected, setPaused } = useLogStore(
    useShallow((state) => ({
      clear: state.clear,
      handleLogMessage: state.handleServerMessage,
      setConnected: state.setConnected,
      setPaused: state.setPaused,
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

  function togglePause() {
    const nextPaused = !paused;
    setPaused(nextPaused);
    sendMessage({ type: nextPaused ? "pause" : "resume" });
  }

  return (
    <main className="gap-4 grid grid-rows-[auto_auto_auto_auto_auto_auto_1fr] p-3 md:p-5 min-h-dvh">
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
        <div className="flex flex-col gap-2 bg-card/75 p-2 border border-[#b8b1a2]/75 rounded-lg">
          <span className="px-1 font-bold text-[#7b3025] text-xs uppercase">
            Live buffer
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              type="button"
              onClick={togglePause}
              title={paused ? "Resume live view" : "Pause live view"}
            >
              {paused ? <Play size={16} /> : <Pause size={16} />}
              {paused ? "Resume view" : "Pause view"}
            </Button>
            <Button
              variant="outline"
              type="button"
              onClick={clear}
              title="Clear visible log buffer"
            >
              <RotateCcw size={16} />
              Clear buffer
            </Button>
          </div>
        </div>
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

      <StatsPanel />

      <div className="text-muted-foreground text-sm">
        <span>{eventCount.toLocaleString()} events buffered</span>
      </div>
      <LogViewer />
    </main>
  );
}
