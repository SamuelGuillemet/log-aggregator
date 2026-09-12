import type { LogEvent, LogTableColumn } from "@log-aggregator/shared";
import type { ColumnOrderState, Table, VisibilityState } from "@tanstack/react-table";
import { ChevronLeft, ChevronRight, Columns3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/ui/popover";

interface ColumnMenuProps {
  columnOrder: ColumnOrderState;
  columnVisibility: VisibilityState;
  columnsById: Map<string, LogTableColumn>;
  moveColumn: (columnId: string, offset: -1 | 1) => void;
  table: Table<LogEvent>;
}

export function ColumnMenu({
  columnOrder,
  columnVisibility,
  columnsById,
  moveColumn,
  table,
}: ColumnMenuProps) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            className="data h-6 gap-1 rounded-sm px-2 text-[11px]"
            title="Show, hide and reorder columns"
          />
        }
      >
        <Columns3 size={12} />
        Columns
      </PopoverTrigger>
      <PopoverContent align="end" className="max-h-80 w-72 overflow-auto p-2">
        <div className="space-y-0.5">
          {table.getAllLeafColumns().map((column) => {
            const label = columnsById.get(column.id)?.label ?? column.id;
            const orderIndex = columnOrder.indexOf(column.id);
            const visible = columnVisibility[column.id] ?? true;

            return (
              <div
                key={column.id}
                className="grid grid-cols-[1fr_auto_auto] items-center gap-1 py-0.5"
              >
                <label className="data flex min-w-0 items-center gap-2 text-[12px]">
                  <input
                    aria-label={`Toggle column ${label}`}
                    type="checkbox"
                    className="size-3 accent-ring"
                    checked={visible}
                    disabled={!column.getCanHide()}
                    onChange={(event) => column.toggleVisibility(event.currentTarget.checked)}
                  />
                  <span className={cn("truncate", !visible && "text-mute")}>{label}</span>
                </label>
                <Button
                  variant="ghost"
                  size="icon"
                  type="button"
                  className="size-6"
                  disabled={orderIndex <= 0}
                  onClick={() => moveColumn(column.id, -1)}
                  title="Move column left"
                  aria-label={`Move column ${label} left`}
                >
                  <ChevronLeft size={13} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  type="button"
                  className="size-6"
                  disabled={orderIndex === columnOrder.length - 1}
                  onClick={() => moveColumn(column.id, 1)}
                  title="Move column right"
                  aria-label={`Move column ${label} right`}
                >
                  <ChevronRight size={13} />
                </Button>
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
