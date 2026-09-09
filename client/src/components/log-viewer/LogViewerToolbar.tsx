import type { LogEvent, LogTableColumn } from "@log-aggregator/shared";
import type { ColumnOrderState, Table, VisibilityState } from "@tanstack/react-table";
import {
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  ChevronsDown,
  Clock,
  Columns3,
  Eye,
  EyeOff,
  Pause,
  Play,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  selectAllEvents: () => void;
  selectedRows: Set<string>;
  setUntilInput: (value: string) => void;
  streamControlDisabled: boolean;
  streamingPaused: boolean;
  table: Table<LogEvent>;
  toggleStreaming: () => void;
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
  selectAllEvents,
  selectedRows,
  setUntilInput,
  streamControlDisabled,
  streamingPaused,
  table,
  toggleStreaming,
  untilInput,
}: LogViewerToolbarProps) {
  function handleCopySelected() {
    const selectedLogs = events.filter((event) => selectedRows.has(event.id));
    const logsText = selectedLogs.map((log) => log.rawMessage).join("\n");
    void navigator.clipboard?.writeText(logsText);
  }

  return (
    <div className="flex justify-between gap-2 border-b border-[#b8b1a2] bg-card/75 p-2 max-md:flex-col">
      <div className="flex flex-wrap items-center gap-2">
        <div className="atelier-section-title mr-8 text-primary">
          <span>{events.length.toLocaleString()} events buffered</span>
        </div>
        <Button
          variant={streamingPaused ? "default" : "outline"}
          type="button"
          disabled={streamControlDisabled}
          onClick={toggleStreaming}
          title={streamingPaused ? "Resume live logs" : "Pause live logs"}
          aria-pressed={streamingPaused}
        >
          {streamingPaused ? <Play size={16} /> : <Pause size={16} />}
          {streamingPaused ? "Resume" : "Pause"}
        </Button>
        <Button
          variant="outline"
          type="button"
          disabled={events.length === 0}
          onClick={selectAllEvents}
          title="Select all loaded logs"
        >
          <CheckSquare size={16} />
          Select all
        </Button>
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
      <div className="flex items-center gap-2 max-sm:flex-col max-sm:items-stretch">
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
          <PopoverContent className="max-h-80 w-80 overflow-auto">
            <div className="space-y-1">
              {table.getAllLeafColumns().map((column) => {
                const columnSchema = schemaById.get(column.id);
                const orderIndex = columnOrder.indexOf(column.id);
                const visible = columnVisibility[column.id] ?? true;

                return (
                  <div
                    key={column.id}
                    className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-1 py-1 text-sm"
                  >
                    <label className="flex min-w-0 items-center gap-2">
                      <input
                        aria-label={`Toggle visibility for column ${columnSchema?.label ?? column.id}`}
                        type="checkbox"
                        checked={visible}
                        disabled={!column.getCanHide()}
                        onChange={(event) => column.toggleVisibility(event.currentTarget.checked)}
                      />
                      <span className="truncate">{columnSchema?.label ?? column.id}</span>
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
