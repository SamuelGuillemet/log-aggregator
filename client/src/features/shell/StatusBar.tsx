import { StreamPicker } from "@/features/sources/StreamPicker";
import { formatCount } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useConnectionStore } from "@/state/connectionStore";
import { useLogsStore } from "@/state/logsStore";

interface StatusBarProps {
  onStart: () => void;
  onStop: () => void;
}

export function StatusBar({ onStart, onStop }: StatusBarProps) {
  const connected = useConnectionStore((state) => state.connected);
  const loaded = useLogsStore((state) => state.events.length);
  const buffered = useLogsStore((state) => state.status.bufferedEvents);
  const sourceCount = useLogsStore((state) => state.status.sources.length);
  const paused = useLogsStore((state) => state.status.paused);

  return (
    <header className="flex h-9 shrink-0 items-center gap-3 border-b border-line bg-panel px-3">
      <StreamPicker onStart={onStart} onStop={onStop} />

      {sourceCount > 0 && (
        <span className="data text-[11px] text-mute">
          {sourceCount} {sourceCount === 1 ? "source" : "sources"}
        </span>
      )}

      <div className="flex-1" />

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
    </header>
  );
}
