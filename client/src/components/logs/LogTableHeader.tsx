import type { LogEvent } from "@log-aggregator/shared";
import { flexRender, type Table } from "@tanstack/react-table";

interface LogTableHeaderProps {
  getRenderWidth: (columnId: string, width: number) => number;
  table: Table<LogEvent>;
  tableWidth: number;
}

export function LogTableHeader({ getRenderWidth, table, tableWidth }: LogTableHeaderProps) {
  return (
    <div
      className="sticky top-0 z-20 flex min-h-9 bg-muted-foreground text-xs font-bold text-primary-foreground"
      style={{ width: `${tableWidth}px` }}
    >
      {/* Space for colored border */}
      <div className="w-1 shrink-0" />
      {/* Space for checkbox */}
      <div className="w-7 shrink-0" />
      {/* Space for eye icon */}
      <div className="w-8 shrink-0" />
      {table.getHeaderGroups().map((headerGroup) =>
        headerGroup.headers.map((header) => (
          <div
            key={header.id}
            className="relative flex min-w-0 items-center truncate overflow-hidden px-3 whitespace-nowrap"
            style={{
              flex: `0 0 ${getRenderWidth(header.column.id, header.getSize())}px`,
            }}
          >
            {flexRender(header.column.columnDef.header, header.getContext())}
            <button
              type="button"
              className="absolute inset-y-0 right-0 w-1 cursor-col-resize touch-none hover:bg-gray-200/20"
              onMouseDown={header.getResizeHandler()}
              onTouchStart={header.getResizeHandler()}
              title="Resize column"
              aria-label="Resize column"
            />
          </div>
        )),
      )}
    </div>
  );
}
