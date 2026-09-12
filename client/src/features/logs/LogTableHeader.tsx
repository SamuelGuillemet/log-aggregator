import type { LogEvent } from "@log-aggregator/shared";
import { flexRender, type Table } from "@tanstack/react-table";

interface LogTableHeaderProps {
  renderWidth: (columnId: string, width: number) => number;
  table: Table<LogEvent>;
  tableWidth: number;
}

export function LogTableHeader({ renderWidth, table, tableWidth }: LogTableHeaderProps) {
  return (
    <div
      className="sticky top-0 z-20 flex h-7 items-stretch border-b border-line bg-panel"
      style={{ width: `${tableWidth}px` }}
    >
      <div className="w-7 shrink-0" aria-hidden />
      <div className="w-6 shrink-0" aria-hidden />
      {table.getHeaderGroups().map((group) =>
        group.headers.map((header) => (
          <div
            key={header.id}
            className="label-micro relative flex min-w-0 items-center truncate overflow-hidden px-2.5 whitespace-nowrap"
            style={{ flex: `0 0 ${renderWidth(header.column.id, header.getSize())}px` }}
          >
            {flexRender(header.column.columnDef.header, header.getContext())}
            <button
              type="button"
              className="absolute inset-y-0 right-0 w-1 cursor-col-resize touch-none hover:bg-ring"
              onMouseDown={header.getResizeHandler()}
              onTouchStart={header.getResizeHandler()}
              title="Resize column"
              aria-label={`Resize column ${header.column.id}`}
            />
          </div>
        )),
      )}
    </div>
  );
}
