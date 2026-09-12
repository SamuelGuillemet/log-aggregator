import {
  ChevronsDown,
  Clock,
  Copy,
  Pause,
  Play,
  SquareCheck,
  TriangleAlert,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { formatCount } from "@/lib/format";
import { useConnectionStore } from "@/state/connectionStore";
import { useLogsStore } from "@/state/logsStore";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/ui/popover";
import type { useLogPaging } from "./useLogPaging";

interface LogToolbarProps {
  canControlStreaming: boolean;
  columnMenu: ReactNode;
  onClearSelection: () => void;
  onCopySelected: () => void;
  onSelectAll: () => void;
  onTogglePause: () => void;
  paging: ReturnType<typeof useLogPaging>;
  selectedCount: number;
}

const ACTION = "data h-6 gap-1 rounded-sm px-2 text-[11px]";

export function LogToolbar({
  canControlStreaming,
  columnMenu,
  onClearSelection,
  onCopySelected,
  onSelectAll,
  onTogglePause,
  paging,
  selectedCount,
}: LogToolbarProps) {
  const connected = useConnectionStore((state) => state.connected);
  const loaded = useLogsStore((state) => state.events.length);
  const paused = useLogsStore((state) => state.status.paused);
  const hasMore = useLogsStore((state) => state.hasMore);
  const droppedEvents = useLogsStore((state) => state.droppedEvents);

  return (
    <div className="flex h-8 shrink-0 items-center gap-1.5 border-b border-line bg-panel px-2">
      <Button
        variant="ghost"
        className={ACTION}
        disabled={!connected || !canControlStreaming}
        onClick={onTogglePause}
        aria-pressed={paused}
        title={paused ? "Resume the live feed" : "Pause the live feed"}
      >
        {paused ? <Play size={12} /> : <Pause size={12} />}
        {paused ? "Resume" : "Pause"}
      </Button>

      <Button
        variant="ghost"
        className={ACTION}
        disabled={loaded === 0}
        onClick={onSelectAll}
        title="Select every loaded entry"
      >
        <SquareCheck size={12} />
        Select all
      </Button>

      {selectedCount > 0 && (
        <>
          <Button variant="ghost" className={ACTION} onClick={onCopySelected}>
            <Copy size={12} />
            Copy {formatCount(selectedCount)}
          </Button>
          <Button variant="ghost" className={ACTION} onClick={onClearSelection}>
            <X size={12} />
            Deselect
          </Button>
        </>
      )}

      {droppedEvents > 0 && (
        <span
          className="data flex items-center gap-1 text-[11px] text-level-warn"
          role="status"
          title="The live feed outran this tab. The skipped entries are still on the server; scroll back for them."
        >
          <TriangleAlert size={12} />
          {formatCount(droppedEvents)} skipped
        </span>
      )}

      <div className="flex-1" />

      <Popover>
        <PopoverTrigger render={<Button variant="ghost" className={ACTION} />}>
          <Clock size={12} />
          Jump to time
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64 space-y-2 p-3">
          <label className="block space-y-1">
            <span className="label-micro">Load back to</span>
            <Input
              aria-label="Load entries back to this time"
              type="datetime-local"
              className="data h-7 w-full rounded-sm border-line bg-surface text-[12px]"
              value={paging.untilInput}
              onChange={(event) => paging.setUntilInput(event.currentTarget.value)}
            />
          </label>
          <Button
            className="h-7 w-full rounded-sm text-[11px]"
            disabled={!paging.untilInput || paging.loading}
            onClick={paging.loadUntil}
          >
            Load entries
          </Button>
        </PopoverContent>
      </Popover>

      <Button
        variant="ghost"
        className={ACTION}
        disabled={!hasMore || paging.loading}
        onClick={() => void paging.loadOlder()}
        title="Load the next page of older entries"
      >
        <ChevronsDown size={12} />
        {paging.loading ? "Loading" : "Older"}
      </Button>

      {columnMenu}
    </div>
  );
}
