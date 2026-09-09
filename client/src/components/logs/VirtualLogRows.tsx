import type { LogEvent } from "@log-aggregator/shared";
import { flexRender, type Row } from "@tanstack/react-table";
import type { VirtualItem } from "@tanstack/react-virtual";
import { Eye } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getLogLevelColors } from "@/lib/logs/logLevelColors";
import { cn } from "@/lib/utils";
import { CopyButton } from "../CopyButton";

interface VirtualLogRowsProps {
  getRenderWidth: (columnId: string, width: number) => number;
  rows: Row<LogEvent>[];
  selectedRows: Set<string>;
  tableWidth: number;
  toggleSelected: (rowId: string) => void;
  virtualItems: VirtualItem[];
  virtualSize: number;
}

export function VirtualLogRows({
  getRenderWidth,
  rows,
  selectedRows,
  tableWidth,
  toggleSelected,
  virtualItems,
  virtualSize,
}: VirtualLogRowsProps) {
  const [viewingLog, setViewingLog] = useState<LogEvent | null>(null);

  return (
    <>
      <div
        style={{
          height: `${virtualSize}px`,
          position: "relative",
          width: `${tableWidth}px`,
        }}
      >
        {virtualItems.map((virtualRow) => {
          const row = rows[virtualRow.index];

          if (!row) {
            return null;
          }

          const selected = selectedRows.has(row.original.id);
          const colors = getLogLevelColors(row.original.level);

          return (
            <div
              key={row.id}
              data-index={virtualRow.index}
              className={cn(
                "absolute inset-x-0 top-0 flex border-b border-[#e5dece] font-mono text-xs text-foreground",
                colors.background,
              )}
              style={{ transform: `translateY(${virtualRow.start}px)` }}
            >
              <div className={cn("w-1 shrink-0 border-l-4", colors.border)} />
              <div className="flex w-7 shrink-0 items-center px-2">
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => toggleSelected(row.original.id)}
                  onClick={(event) => event.stopPropagation()}
                  className="cursor-pointer"
                  aria-label={`Select log ${row.original.id}`}
                />
              </div>
              <div className="flex w-8 shrink-0 items-center px-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setViewingLog(row.original)}
                  title="View full message"
                >
                  <Eye size={14} />
                </Button>
              </div>
              {row.getVisibleCells().map((cell) => (
                <span
                  key={cell.id}
                  className="flex min-w-0 items-center truncate overflow-hidden px-3 whitespace-nowrap"
                  style={{
                    flex: `0 0 ${getRenderWidth(cell.column.id, cell.column.getSize())}px`,
                  }}
                  title={String(cell.getValue() ?? "")}
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </span>
              ))}
            </div>
          );
        })}
      </div>

      <Dialog open={!!viewingLog} onOpenChange={() => setViewingLog(null)}>
        <DialogContent
          className="flex max-h-[80vh] flex-col overflow-hidden sm:max-w-6xl"
          showCloseButton
        >
          <DialogHeader>
            <DialogTitle>Full Log Message</DialogTitle>
            <DialogDescription>
              {viewingLog?.level && (
                <span className="font-mono font-semibold">Level: {viewingLog.level}</span>
              )}
              {viewingLog?.timestamp && (
                <span className="ml-4 text-muted-foreground">
                  {new Date(viewingLog.timestamp).toLocaleString()}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="relative flex-1 overflow-auto rounded-md border border-[#e5dece] bg-accent/30 p-3">
            <div className="absolute top-2 right-2 z-10">
              <CopyButton
                onCopy={() => {
                  if (viewingLog?.message) {
                    void navigator.clipboard?.writeText(viewingLog.message);
                  }
                }}
                title="Copy full log message"
              />
            </div>
            <pre className="m-0 font-mono text-sm wrap-break-word whitespace-pre-wrap">
              {viewingLog?.message}
            </pre>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
