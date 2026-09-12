import type { LogEvent } from "@log-aggregator/shared";
import { flexRender, type Row } from "@tanstack/react-table";
import type { VirtualItem } from "@tanstack/react-virtual";
import { Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { levelWash } from "./levelStyles";

interface LogRowsProps {
  renderWidth: (columnId: string, width: number) => number;
  rows: Row<LogEvent>[];
  selectedSeqs: ReadonlySet<number>;
  tableWidth: number;
  totalHeight: number;
  virtualItems: VirtualItem[];
  onInspect: (event: LogEvent) => void;
  onToggleSelected: (seq: number) => void;
}

export function LogRows({
  renderWidth,
  rows,
  selectedSeqs,
  tableWidth,
  totalHeight,
  virtualItems,
  onInspect,
  onToggleSelected,
}: LogRowsProps) {
  return (
    <div style={{ height: `${totalHeight}px`, position: "relative", width: `${tableWidth}px` }}>
      {virtualItems.map((virtualRow) => {
        const row = rows[virtualRow.index];

        if (!row) {
          return null;
        }

        const event = row.original;
        const selected = selectedSeqs.has(event.seq);

        return (
          <div
            key={row.id}
            data-index={virtualRow.index}
            className={cn(
              "row-hover absolute inset-x-0 top-0 flex items-stretch",
              selected && "bg-accent",
            )}
            style={{
              background: selected ? undefined : levelWash(event.level),
              height: `${virtualRow.size}px`,
              transform: `translateY(${virtualRow.start}px)`,
            }}
          >
            <div className="flex w-7 shrink-0 items-center justify-center">
              <input
                type="checkbox"
                checked={selected}
                onChange={() => onToggleSelected(event.seq)}
                className={cn(
                  "size-3 accent-ring transition-opacity",
                  !selected && "opacity-25 [.row-hover:hover_&]:opacity-100",
                )}
                aria-label={`Select entry ${event.seq}`}
              />
            </div>
            <div className="flex w-6 shrink-0 items-center justify-center">
              <button
                type="button"
                className="text-mute opacity-0 transition-opacity hover:text-fg focus-visible:opacity-100 [.row-hover:hover_&]:opacity-100"
                onClick={() => onInspect(event)}
                title="Open full entry"
                aria-label={`Open entry ${event.seq}`}
              >
                <Maximize2 size={11} />
              </button>
            </div>
            {row.getVisibleCells().map((cell) => {
              const value = cell.getValue();

              return (
                <span
                  key={cell.id}
                  className="data flex min-w-0 items-center truncate overflow-hidden px-2.5 text-[12px] whitespace-nowrap"
                  style={{ flex: `0 0 ${renderWidth(cell.column.id, cell.column.getSize())}px` }}
                  title={typeof value === "string" ? value : undefined}
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </span>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
