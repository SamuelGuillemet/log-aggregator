import type { LogEvent } from "@log-aggregator/shared";
import { flexRender, type Table } from "@tanstack/react-table";

interface LogTableHeaderProps {
  getRenderWidth: (columnId: string, width: number) => number;
  table: Table<LogEvent>;
  tableWidth: number;
}

export function LogTableHeader({
  getRenderWidth,
  table,
  tableWidth,
}: LogTableHeaderProps) {
  return (
    <div
      className="top-0 z-20 sticky flex bg-muted-foreground min-h-9 font-bold text-primary-foreground text-xs"
      style={{ width: `${tableWidth}px` }}
    >
      {table.getHeaderGroups().map((headerGroup) =>
        headerGroup.headers.map((header) => (
          <div
            key={header.id}
            className="relative flex items-center px-3 min-w-0 overflow-hidden truncate whitespace-nowrap"
            style={{
              flex: `0 0 ${getRenderWidth(
                header.column.id,
                header.getSize(),
              )}px`,
            }}
          >
            {flexRender(header.column.columnDef.header, header.getContext())}
            <button
              type="button"
              className="right-0 absolute inset-y-0 hover:bg-gray-200/20 w-1 touch-none cursor-col-resize"
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
