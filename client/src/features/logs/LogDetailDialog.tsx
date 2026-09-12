import { type LogEvent, logEventMessage } from "@log-aggregator/shared";
import { formatAbsoluteTime } from "@/lib/format";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/ui/dialog";
import { CopyButton } from "./CopyButton";
import { levelColor } from "./levelStyles";

interface LogDetailDialogProps {
  event: LogEvent | undefined;
  onClose: () => void;
}

export function LogDetailDialog({ event, onClose }: LogDetailDialogProps) {
  const message = event ? logEventMessage(event) : "";

  return (
    <Dialog open={Boolean(event)} onOpenChange={onClose}>
      <DialogContent
        className="flex max-h-[80vh] flex-col gap-3 overflow-hidden rounded-md sm:max-w-5xl"
        showCloseButton
      >
        <DialogHeader className="gap-1">
          <DialogTitle className="data flex items-center gap-3 text-[13px] font-semibold tracking-[0.06em]">
            {event ? (
              <span style={{ color: levelColor(event.level) }}>{event.level}</span>
            ) : (
              "Entry"
            )}
            <CopyButton
              className="data h-6 gap-1 rounded-sm px-2 text-[11px] font-normal"
              getText={() => message}
            />
          </DialogTitle>
          <DialogDescription className="data flex flex-wrap gap-x-4 text-[11px] text-mute">
            {event ? (
              <>
                <span>{formatAbsoluteTime(event.timestampMs)}</span>
                <span>{event.sourceName}</span>
                <span className="truncate">{event.filePath}</span>
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto border border-line bg-surface p-3">
          <pre className="data m-0 text-[12px] leading-relaxed whitespace-pre-wrap">{message}</pre>
        </div>
      </DialogContent>
    </Dialog>
  );
}
