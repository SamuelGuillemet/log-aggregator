import { useLogConnection } from "@/connection/useLogConnection";
import { FilterRail } from "@/features/filters/FilterRail";
import { LogTable } from "@/features/logs/LogTable";
import { StatusBar } from "@/features/shell/StatusBar";
import { cn } from "@/lib/utils";
import { useConnectionStore } from "@/state/connectionStore";

export function App() {
  const { startStream, stopStream, togglePause } = useLogConnection();
  const error = useConnectionStore((state) => state.error);
  const compatibility = useConnectionStore((state) => state.compatibility);

  return (
    <main className="grid h-dvh min-h-0 grid-rows-[auto_auto_auto_minmax(0,1fr)] overflow-hidden">
      <StatusBar onStart={startStream} onStop={stopStream} />
      <FilterRail />

      {error || compatibility.message ? (
        <div className="flex flex-col">
          {compatibility.message ? (
            <Notice level={compatibility.status === "server-outdated" ? "error" : "warn"}>
              {compatibility.message}
            </Notice>
          ) : null}
          {error ? <Notice level="error">{error}</Notice> : null}
        </div>
      ) : (
        <div />
      )}

      <LogTable
        canControlStreaming={compatibility.features.has("stream-control")}
        onTogglePause={togglePause}
      />
    </main>
  );
}

/** Notices borrow the severity palette rather than inventing a second colour system. */
function Notice({ children, level }: { children: React.ReactNode; level: "error" | "warn" }) {
  return (
    <p
      className={cn(
        "data border-b border-line px-3 py-1.5 text-[12px]",
        level === "error" ? "bg-wash-error text-level-error" : "bg-wash-warn text-level-warn",
      )}
      role="status"
    >
      {children}
    </p>
  );
}
