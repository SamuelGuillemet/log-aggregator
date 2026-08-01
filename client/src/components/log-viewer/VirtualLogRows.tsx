import type { LogEvent } from "@log-aggregator/shared";
import { flexRender, type Row } from "@tanstack/react-table";
import type { VirtualItem } from "@tanstack/react-virtual";
import { Clipboard } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface VirtualLogRowsProps {
  expandedRows: Set<string>;
  getRenderWidth: (columnId: string, width: number) => number;
  measureElement: (element: HTMLDivElement | null) => void;
  rows: Row<LogEvent>[];
  tableWidth: number;
  toggleExpanded: (rowId: string) => void;
  virtualItems: VirtualItem[];
  virtualSize: number;
}

export function VirtualLogRows({
  expandedRows,
  getRenderWidth,
  measureElement,
  rows,
  tableWidth,
  toggleExpanded,
  virtualItems,
  virtualSize,
}: VirtualLogRowsProps) {
  return (
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

        const expanded = expandedRows.has(row.original.id);

        return (
          <div
            key={row.id}
            data-index={virtualRow.index}
            ref={measureElement}
            className={cn(
              "top-0 absolute inset-x-0 border-[#e5dece] border-b font-mono text-foreground text-xs",
              (row.original.level === "ERROR" ||
                row.original.level === "FATAL") &&
                "bg-[#fff1eb]",
              row.original.level === "WARN" && "bg-[#fff8e8]",
            )}
            style={{ transform: `translateY(${virtualRow.start}px)` }}
          >
            <button
              type="button"
              className="flex bg-transparent p-0 border-0 w-full min-h-9 text-inherit text-left"
              onClick={() => toggleExpanded(row.original.id)}
            >
              {row.getVisibleCells().map((cell, cellIndex) => (
                <span
                  key={cell.id}
                  className={cn(
                    "flex items-center px-3 min-w-0 overflow-hidden truncate whitespace-nowrap",
                    cellIndex === 0 && "border-l-4 border-l-transparent",
                    cellIndex === 0 &&
                      row.original.level === "WARN" &&
                      "border-l-[#be8b2f]",
                    cellIndex === 0 &&
                      (row.original.level === "ERROR" ||
                        row.original.level === "FATAL") &&
                      "border-l-destructive",
                  )}
                  style={{
                    flex: `0 0 ${getRenderWidth(
                      cell.column.id,
                      cell.column.getSize(),
                    )}px`,
                  }}
                  title={String(cell.getValue() ?? "")}
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </span>
              ))}
            </button>
            {expanded ? (
              <div className="bg-accent/30 p-3 border-[#e5dece] border-t">
                <div className="flex justify-between items-center gap-3 mb-2">
                  <strong className="font-sans text-primary text-xs uppercase">
                    Full message
                  </strong>
                  <Button
                    variant="outline"
                    size="icon"
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      void navigator.clipboard?.writeText(row.original.raw);
                    }}
                    title="Copy full log message"
                  >
                    <Clipboard size={15} />
                  </Button>
                </div>
                <pre className="m-0 wrap-break-word whitespace-pre-wrap">
                  {row.original.message}
                </pre>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
