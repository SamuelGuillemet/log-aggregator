import { Check, Clock, Copy, Pause, Play, SquareCheck, TriangleAlert, X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { formatCount } from "@/lib/format";
import { cn } from "@/lib/utils";
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
  const droppedEvents = useLogsStore((state) => state.droppedEvents);

  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(copiedTimerRef.current), []);

  const handleCopySelected = () => {
    onCopySelected();
    setCopied(true);
    window.clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = window.setTimeout(() => setCopied(false), 2_000);
  };

  const onJumpToTime = () => {
    if (!paused) {
      onTogglePause();
    }
    if (paging.timeInput) {
      paging.jumpToTime();
    }
  };

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
          <Button
            variant="ghost"
            className={cn("transition-all", ACTION, copied && "border-green-500 bg-green-100 text-green-700")}
            onClick={handleCopySelected}
            title={copied ? "Copied!" : "Copy selected rows"}
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? "Copied!" : `Copy ${formatCount(selectedCount)}`}
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
            <span className="label-micro">Time (this log's day)</span>
            <Input
              aria-label="Jump to this time"
              type="time"
              step={1}
              className="data h-7 w-full rounded-sm border-line bg-surface text-[12px]"
              value={paging.timeInput}
              onChange={(event) => paging.setTimeInput(event.currentTarget.value)}
            />
          </label>
          <Button
            className="h-7 w-full rounded-sm text-[11px]"
            disabled={!paging.timeInput || paging.loading}
            onClick={onJumpToTime}
          >
            Jump
          </Button>
        </PopoverContent>
      </Popover>

      {columnMenu}
    </div>
  );
}
