import type { LogEvent } from "@log-aggregator/shared";
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useDeferredValue, useMemo, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { cn } from "@/lib/utils";
import { applyLogFilter, useLogStore } from "@/stores/logStore";

const columns: ColumnDef<LogEvent>[] = [
  { accessorKey: "timestamp", header: "Time", size: 188 },
  { accessorKey: "sourceName", header: "Source", size: 240 },
  { accessorKey: "level", header: "Level", size: 90 },
  { accessorKey: "thread", header: "Thread", size: 150 },
  { accessorKey: "message", header: "Message", size: 520 },
];

export function LogViewer() {
  const { events, filter } = useLogStore(
    useShallow((state) => ({
      events: state.events,
      filter: state.filter,
    })),
  );
  const deferredFilter = useDeferredValue(filter);
  const filteredEvents = useMemo(
    () => applyLogFilter(events, deferredFilter).sort(compareLogEvents),
    [events, deferredFilter],
  );
  const parentRef = useRef<HTMLDivElement>(null);
  // react-doctor-disable-next-line react-hooks-js/incompatible-library
  const table = useReactTable({
    columns,
    data: filteredEvents,
    getCoreRowModel: getCoreRowModel(),
  });
  const rows = table.getRowModel().rows;
  const virtualizer = useVirtualizer({
    count: rows.length,
    estimateSize: () => 34,
    getScrollElement: () => parentRef.current,
    overscan: 12,
  });

  return (
    <section
      className="grid grid-rows-[auto_1fr] border border-[#b8b1a2] rounded-lg min-h-0 overflow-hidden"
      aria-label="Live logs"
    >
      <div className="grid grid-cols-[168px_190px_80px_130px_460px] min-[760px]:grid-cols-[188px_240px_90px_150px_1fr] bg-primary min-h-9 font-bold text-primary-foreground text-xs">
        {table.getHeaderGroups().map((headerGroup) =>
          headerGroup.headers.map((header) => (
            <div
              key={header.id}
              className="flex items-center px-3 min-w-0 overflow-hidden truncate whitespace-nowrap"
              style={{ width: header.getSize() }}
            >
              {flexRender(header.column.columnDef.header, header.getContext())}
            </div>
          )),
        )}
      </div>
      <div
        ref={parentRef}
        className="relative bg-card/90 min-h-96 overflow-auto"
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            position: "relative",
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const row = rows[virtualRow.index];

            return (
              <div
                key={row.id}
                className={cn(
                  "top-0 absolute inset-x-0 grid grid-cols-[168px_190px_80px_130px_460px] min-[760px]:grid-cols-[188px_240px_90px_150px_1fr] border-[#e5dece] border-b font-mono text-foreground text-xs",
                  (row.original.level === "ERROR" ||
                    row.original.level === "FATAL") &&
                    "bg-[#fff1eb]",
                  row.original.level === "WARN" && "bg-[#fff8e8]",
                )}
                style={{
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                {row.getVisibleCells().map((cell, cellIndex) => (
                  <div
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
                    style={{ width: cell.column.getSize() }}
                    title={String(cell.getValue() ?? "")}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function compareLogEvents(left: LogEvent, right: LogEvent): number {
  const timestampOrder = compareTimestamp(left.timestamp, right.timestamp);

  if (timestampOrder !== 0) {
    return timestampOrder;
  }

  return (
    compareTimestamp(left.receivedAt, right.receivedAt) ||
    left.filePath.localeCompare(right.filePath) ||
    left.id.localeCompare(right.id)
  );
}

function compareTimestamp(left: string, right: string): number {
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);
  const leftValid = Number.isFinite(leftTime);
  const rightValid = Number.isFinite(rightTime);

  if (leftValid && rightValid) {
    return leftTime - rightTime;
  }

  if (leftValid !== rightValid) {
    return leftValid ? -1 : 1;
  }

  return left.localeCompare(right);
}
