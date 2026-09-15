import { isEmptyFilter } from "@log-aggregator/shared";
import { StreamPicker } from "@/features/sources/StreamPicker";
import { formatCount } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useConnectionStore } from "@/state/connectionStore";
import { useFilterStore } from "@/state/filterStore";
import { useLogsStore } from "@/state/logsStore";

interface StatusBarProps {
  onStart: () => void;
  onStop: () => void;
  onViewChange: (view: "logs" | "observability") => void;
  view: "logs" | "observability";
}

export function StatusBar({ onStart, onStop, onViewChange, view }: StatusBarProps) {
  const connected = useConnectionStore((state) => state.connected);
  const loaded = useLogsStore((state) => state.events.length);
  const buffered = useLogsStore((state) => state.status.bufferedEvents);
  const matched = useLogsStore((state) => state.status.matchedEvents);
  const filtered = useFilterStore((state) => !isEmptyFilter(state.filter));
  const sourceCount = useLogsStore((state) => state.status.sources.length);
  const paused = useLogsStore((state) => state.status.paused);

  return (
    <header className="grid h-9 shrink-0 grid-cols-3 items-center gap-4 border-b border-line bg-panel px-3">
      <div className="flex items-center gap-3">
        <StreamPicker onStart={onStart} onStop={onStop} />
        {sourceCount > 0 && (
          <span className="data text-[11px] text-mute">
            {sourceCount} {sourceCount === 1 ? "source" : "sources"}
          </span>
        )}
      </div>

      <div className="flex justify-center">
        <div className="data flex h-6 items-center gap-0.5 rounded-sm border border-line p-0.5 text-[11px]">
          <ViewTab active={view === "logs"} onClick={() => onViewChange("logs")}>
            Logs
          </ViewTab>
          <ViewTab active={view === "observability"} onClick={() => onViewChange("observability")}>
            Observability
          </ViewTab>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        {filtered && (
          <span
            className="data text-[11px] text-mute"
            title="Buffered events matching the current filter"
          >
            <span className="text-fg">{formatCount(matched)}</span> matched
          </span>
        )}

        <span className="data text-[11px] text-mute">
          <span className="text-fg">{formatCount(loaded)}</span> loaded of {formatCount(buffered)}
        </span>

        <span className="h-4 w-px bg-line" aria-hidden />

        <span className="data flex items-center gap-1.5 text-[11px]" role="status">
          <span
            className={cn(
              "size-1.5 rounded-full",
              connected && !paused && "live-dot",
              connected ? "bg-level-info" : "bg-level-error",
            )}
            aria-hidden
          />
          <span className="text-mute">
            {!connected ? "Reconnecting" : paused ? "Paused" : "Live"}
          </span>
        </span>
      </div>
    </header>
  );
}

function ViewTab({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-sm px-2 py-0.5 transition-colors",
        active ? "bg-muted text-fg" : "text-mute hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}
