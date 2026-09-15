import { type LogEvent, logEventMessage } from "@log-aggregator/shared";
import { Timer } from "lucide-react";
import { useMemo } from "react";
import { formatDurationMs, splitTimestamp } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/ui/dialog";

interface SelectionTimingProps {
  events: LogEvent[];
}

interface TimingRow {
  event: LogEvent;
  /** How long this step took before the next selected row, undefined for the last one. */
  gapToNextMs: number | undefined;
}

/** Enough of the message to place the row without scrolling the whole dialog sideways. */
const MESSAGE_PREVIEW_LENGTH = 160;

/**
 * Turns a manual multi-row selection (typically every log line of one request) into
 * the gap between each consecutive pair, so the slowest step is visible at a glance
 * instead of cross-referencing timestamps by hand. An approximation -- the gap is
 * attributed to the earlier row, not measured from inside the operation itself.
 */
export function SelectionTiming({ events }: SelectionTimingProps) {
  const rows = useMemo(() => buildTimingRows(events), [events]);

  if (rows.length < 2) {
    return null;
  }

  const totalMs = rows.at(-1)!.event.timestampMs - rows[0].event.timestampMs;
  const slowestGapMs = Math.max(...rows.map((row) => row.gapToNextMs ?? 0));

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            className="data h-6 gap-1 rounded-sm px-2 text-[11px]"
            title="Time between the selected rows"
          />
        }
      >
        <Timer size={12} />
        Timing
      </DialogTrigger>
      <DialogContent className="flex max-h-[80vh] w-full flex-col gap-3 overflow-hidden rounded-md sm:max-w-3xl">
        <DialogHeader className="gap-1">
          <DialogTitle className="data text-[13px] font-semibold tracking-[0.06em]">
            Selection timing
          </DialogTitle>
          <DialogDescription className="data text-[11px] text-mute">
            {rows.length} selected, total {formatDurationMs(totalMs)}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-0.5 overflow-auto">
          {rows.map((row) => (
            <div
              key={row.event.seq}
              className="data grid grid-cols-[auto_auto_1fr] items-center gap-3 border-b border-line/60 px-1 py-1 text-[11px] last:border-b-0"
            >
              <span className="text-mute">
                {splitTimestamp(row.event.timestampText).time},
                {splitTimestamp(row.event.timestampText).millis}
              </span>
              <span
                className={cn(
                  "w-16 text-right",
                  row.gapToNextMs !== undefined &&
                    row.gapToNextMs === slowestGapMs &&
                    slowestGapMs > 0
                    ? "font-semibold text-level-warn"
                    : "text-fg",
                )}
              >
                {row.gapToNextMs !== undefined ? `+${formatDurationMs(row.gapToNextMs)}` : ""}
              </span>
              <span className="truncate text-mute" title={logEventMessage(row.event)}>
                {previewMessage(row.event)}
              </span>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function buildTimingRows(events: LogEvent[]): TimingRow[] {
  const sorted = [...events].sort((left, right) => left.timestampMs - right.timestampMs);

  return sorted.map((event, index) => ({
    event,
    gapToNextMs:
      index < sorted.length - 1 ? sorted[index + 1].timestampMs - event.timestampMs : undefined,
  }));
}

function previewMessage(event: LogEvent): string {
  const message = logEventMessage(event).replace(/\s+/g, " ").trim();

  return message.length > MESSAGE_PREVIEW_LENGTH
    ? `${message.slice(0, MESSAGE_PREVIEW_LENGTH)}…`
    : message;
}
