import { Wifi, WifiOff } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { FilterPanel } from "@/components/FilterPanel";
import { LogViewer } from "@/components/LogViewer";
import { SourceSelector } from "@/components/SourceSelector";
import { Badge } from "@/components/ui/badge";
import { useLogWebSocket } from "@/hooks/useLogWebSocket";
import { cn } from "@/lib/utils";
import { useLogStore } from "@/stores/logStore";

export function Dashboard() {
  const { sendMessage } = useLogWebSocket();
  const { connected, error } = useLogStore(
    useShallow((state) => ({
      connected: state.connected,
      error: state.error,
    })),
  );

  return (
    <main className="gap-4 grid grid-rows-[auto_auto_auto_auto_minmax(0,1fr)] p-3 md:p-5 h-dvh min-h-0 overflow-hidden atelier-page-enter">
      <header className="flex md:flex-row flex-col md:justify-between items-stretch md:items-end gap-4">
        <h1 className="m-0 mb-2 font-heading text-2xl md:text-3xl leading-tight">
          Log Aggregator
        </h1>
        <Badge
          className={cn(
            "gap-2 bg-secondary px-3 border border-muted-foreground/30 rounded-[7px] min-h-9 text-[#7b3025]",
            connected && "text-primary",
          )}
        >
          {connected ? <Wifi size={18} /> : <WifiOff size={18} />}
          <span>{connected ? "Connected" : "Disconnected"}</span>
        </Badge>
      </header>

      <SourceSelector sendMessage={sendMessage} />

      <FilterPanel />

      {error ? (
        <div
          className="bg-[#fff1eb] px-4 py-3 border border-[#e0a18e] rounded-lg text-[#7b3025]"
          role="status"
        >
          {error}
        </div>
      ) : null}

      <LogViewer />
    </main>
  );
}
