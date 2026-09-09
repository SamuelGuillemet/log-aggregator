import { Wifi, WifiOff } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { FilterPanel } from "@/components/FilterPanel";
import { LogViewer } from "@/components/LogViewer";
import { SourceSelector } from "@/components/SourceSelector";
import { Badge } from "@/components/ui/badge";
import { useLogWebSocket } from "@/hooks/useLogWebSocket";
import { cn } from "@/lib/utils";
import { useCompatibilityStore } from "@/stores/compatibilityStore";
import { useLogStore } from "@/stores/logStore";

export function Dashboard() {
  const { sendMessage } = useLogWebSocket();
  const { connected, error } = useLogStore(
    useShallow((state) => ({
      connected: state.connected,
      error: state.error,
    })),
  );
  const { compatibilityMessage, compatibilityStatus } = useCompatibilityStore(
    useShallow((state) => ({
      compatibilityMessage: state.message,
      compatibilityStatus: state.status,
    })),
  );

  return (
    <main className="atelier-page-enter grid h-dvh min-h-0 grid-rows-[auto_auto_auto_auto_minmax(0,1fr)] gap-4 overflow-hidden p-3 md:p-5">
      <header className="flex flex-col items-stretch gap-4 md:flex-row md:items-end md:justify-between">
        <h1 className="m-0 mb-2 font-heading text-2xl leading-tight md:text-3xl">Log Aggregator</h1>
        <Badge
          className={cn(
            "min-h-9 gap-2 rounded-[7px] border border-muted-foreground/30 bg-secondary px-3 text-[#7b3025]",
            connected && "text-primary",
          )}
        >
          {connected ? <Wifi size={18} /> : <WifiOff size={18} />}
          <span>{connected ? "Connected" : "Disconnected"}</span>
        </Badge>
      </header>

      <SourceSelector sendMessage={sendMessage} />

      <FilterPanel />

      {error || compatibilityMessage ? (
        <div className="flex flex-col gap-2">
          {compatibilityMessage ? (
            <div
              className={cn(
                "rounded-lg border px-4 py-3",
                compatibilityStatus === "server-outdated"
                  ? "border-[#e0a18e] bg-[#fff1eb] text-[#7b3025]"
                  : "border-[#be8b2f] bg-[#fff8e8] text-[#7a5a12]",
              )}
              role="status"
            >
              {compatibilityMessage}
            </div>
          ) : null}

          {error ? (
            <div
              className="rounded-lg border border-[#e0a18e] bg-[#fff1eb] px-4 py-3 text-[#7b3025]"
              role="status"
            >
              {error}
            </div>
          ) : null}
        </div>
      ) : null}

      <LogViewer />
    </main>
  );
}
