import type { LogEvent, LogTableColumn } from "@log-aggregator/shared";
import type {
  ColumnOrderState,
  Table,
  VisibilityState,
} from "@tanstack/react-table";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsDown,
  Clock,
  Columns3,
  Eye,
  EyeOff,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CopyButton } from "./CopyButton";

interface LogViewerToolbarProps {
  clearSelection: () => void;
  columnOrder: ColumnOrderState;
  columnVisibility: VisibilityState;
  events: LogEvent[];
  hasMore: boolean;
  loadingOlder: boolean;
  loadOlderEvents: () => Promise<void>;
  loadUntilTimestamp: () => void;
  moveColumn: (columnId: string, offset: -1 | 1) => void;
  schemaById: Map<string, LogTableColumn>;
  selectedRows: Set<string>;
  setUntilInput: (value: string) => void;
  table: Table<LogEvent>;
  untilInput: string;
}

export function LogViewerToolbar({
  clearSelection,
  columnOrder,
  columnVisibility,
  events,
  hasMore,
  loadingOlder,
  loadOlderEvents,
  loadUntilTimestamp,
  moveColumn,
  schemaById,
  selectedRows,
  setUntilInput,
  table,
  untilInput,
}: LogViewerToolbarProps) {
  function handleCopySelected() {
    const selectedLogs = events.filter((event) => selectedRows.has(event.id));
    const logsText = selectedLogs
      .map((log) => JSON.stringify(log, null, 2))
      .join("\n\n");
    void navigator.clipboard?.writeText(logsText);
  }

  return (
    <div className="flex max-md:flex-col justify-between gap-2 bg-card/75 p-2 border-[#b8b1a2] border-b">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-8 text-primary atelier-section-title">
          <span>{events.length.toLocaleString()} events buffered</span>
        </div>
        {selectedRows.size > 0 && (
          <>
            <CopyButton
              variant="outline"
              size="default"
              onCopy={handleCopySelected}
              title="Copy selected logs to clipboard"
            />
            <Button
              variant="outline"
              type="button"
              onClick={clearSelection}
              title="Clear selection"
            >
              <X size={16} />
              Clear
            </Button>
          </>
        )}
      </div>
      <div className="flex max-sm:flex-col items-center max-sm:items-stretch gap-2">
        <Input
          aria-label="Load logs to timestamp"
          type="datetime-local"
          value={untilInput}
          onChange={(event) => setUntilInput(event.currentTarget.value)}
        />
        <Button
          variant="outline"
          type="button"
          disabled={!untilInput}
          onClick={loadUntilTimestamp}
          title="Load logs to timestamp"
        >
          <Clock size={16} />
          Load to time
        </Button>
        <Button
          variant="outline"
          type="button"
          disabled={!hasMore || loadingOlder}
          onClick={() => void loadOlderEvents()}
          title="Load older logs"
        >
          <ChevronsDown size={16} />
          {loadingOlder ? "Loading" : "Load older"}
        </Button>
        <Popover>
          <PopoverTrigger render={<Button variant="outline" />}>
            <Columns3 size={16} />
            Columns
          </PopoverTrigger>
          <PopoverContent className="w-80 max-h-80 overflow-auto">
            <div className="space-y-1">
              {table.getAllLeafColumns().map((column) => {
                const columnSchema = schemaById.get(column.id);
                const orderIndex = columnOrder.indexOf(column.id);
                const visible = columnVisibility[column.id] ?? true;

                return (
                  <div
                    key={column.id}
                    className="items-center gap-1 grid grid-cols-[1fr_auto_auto_auto] py-1 text-sm"
                  >
                    <label className="flex items-center gap-2 min-w-0">
                      <input
                        type="checkbox"
                        checked={visible}
                        disabled={!column.getCanHide()}
                        onChange={(event) =>
                          column.toggleVisibility(event.currentTarget.checked)
                        }
                      />
                      <span className="truncate">
                        {columnSchema?.label ?? column.id}
                      </span>
                    </label>
                    {visible ? <Eye size={15} /> : <EyeOff size={15} />}
                    <Button
                      variant="ghost"
                      size="icon"
                      type="button"
                      disabled={orderIndex <= 0}
                      onClick={() => moveColumn(column.id, -1)}
                      title="Move column left"
                    >
                      <ChevronLeft size={15} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      type="button"
                      disabled={orderIndex === columnOrder.length - 1}
                      onClick={() => moveColumn(column.id, 1)}
                      title="Move column right"
                    >
                      <ChevronRight size={15} />
                    </Button>
                  </div>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
