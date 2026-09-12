// oxlint-disable react/incompatible-library -- TanStack Table; see useReactTable below.
import type { LogEvent } from "@log-aggregator/shared";
import { type ColumnDef, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { compactSource, fieldValue, splitTimestamp } from "@/lib/format";
import { useTableLayout } from "@/lib/tableLayout";
import { useElementWidth } from "@/lib/useElementWidth";
import { useLogsStore } from "@/state/logsStore";
import { useSourceStore } from "@/state/sourceStore";
import { ColumnMenu } from "./ColumnMenu";
import { FALLBACK_SCHEMA } from "./fallbackSchema";
import { LogDetailDialog } from "./LogDetailDialog";
import { LogLevelBadge } from "./LogLevelBadge";
import { LogRows } from "./LogRows";
import { LogTableHeader } from "./LogTableHeader";
import { LogToolbar } from "./LogToolbar";
import { SeveritySpine } from "./SeveritySpine";
import { useLogPaging } from "./useLogPaging";

const ROW_HEIGHT_PX = 24;

interface LogTableProps {
  canControlStreaming: boolean;
  onTogglePause: () => void;
}

export function LogTable({ canControlStreaming, onTogglePause }: LogTableProps) {
  const events = useLogsStore((state) => state.events);
  const schema = useLogsStore((state) => state.schema);
  const streaming = useSourceStore((state) => Boolean(state.active));
  const activeSchema = schema ?? FALLBACK_SCHEMA;

  const scrollRef = useRef<HTMLDivElement>(null);
  const [inspected, setInspected] = useState<LogEvent | undefined>(undefined);
  const [selectedSeqs, setSelectedSeqs] = useState<ReadonlySet<number>>(() => new Set());
  const paging = useLogPaging(scrollRef);
  const layout = useTableLayout(activeSchema, Boolean(schema));

  const columns = useMemo<ColumnDef<LogEvent>[]>(
    () =>
      activeSchema.columns.map((column) => ({
        accessorFn: (event) => fieldValue(event, column.field),
        cell: (cell) => renderCell(column.field, cell.row.original, String(cell.getValue() ?? "")),
        enableHiding: column.hideable,
        enableResizing: true,
        header: column.label,
        id: column.id,
        minSize: Math.min(columnWidth(column.field, column.width), 64),
        size: columnWidth(column.field, column.width),
      })),
    [activeSchema],
  );

  // TanStack Table hands back closures the compiler cannot memoize, so it skips this
  // component. Nothing here is passed to a memo()'d child, so the stale-value caveat
  // does not apply -- but it does mean the manual memoization above is load-bearing.
  // react-doctor-disable-next-line react-hooks-js/incompatible-library
  const table = useReactTable({
    columnResizeMode: "onChange",
    columns,
    data: events,
    enableColumnResizing: true,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (event) => String(event.seq),
    onColumnOrderChange: layout.setColumnOrder,
    onColumnSizingChange: layout.setColumnSizing,
    onColumnVisibilityChange: layout.setColumnVisibility,
    state: {
      columnOrder: layout.columnOrder,
      columnSizing: layout.columnSizing,
      columnVisibility: layout.columnVisibility,
    },
  });

  const rows = table.getRowModel().rows;
  const virtualizer = useVirtualizer({
    count: rows.length,
    estimateSize: () => ROW_HEIGHT_PX,
    getScrollElement: () => scrollRef.current,
    overscan: 16,
  });

  const scrollWidth = useElementWidth(scrollRef);
  const naturalWidth = table.getTotalSize();
  const tableWidth = Math.max(naturalWidth, scrollWidth);
  const slack = Math.max(0, tableWidth - naturalWidth);
  const visibleColumns = table.getVisibleLeafColumns();
  const stretchedColumnId =
    visibleColumns.find((column) => column.id === "message")?.id ?? visibleColumns.at(-1)?.id;

  const renderWidth = useCallback(
    (columnId: string, width: number) => (columnId === stretchedColumnId ? width + slack : width),
    [slack, stretchedColumnId],
  );

  const toggleSelected = useCallback((seq: number) => {
    setSelectedSeqs((current) => {
      const next = new Set(current);

      if (!next.delete(seq)) {
        next.add(seq);
      }

      return next;
    });
  }, []);

  useEffect(() => {
    // Reset selected sequences when the events change
    setSelectedSeqs(new Set());
  }, [events]);

  return (
    <section className="grid min-h-0 grid-rows-[auto_1fr] overflow-hidden" aria-label="Log entries">
      <LogToolbar
        canControlStreaming={canControlStreaming}
        columnMenu={
          <ColumnMenu
            columnOrder={layout.columnOrder}
            columnVisibility={layout.columnVisibility}
            columnsById={layout.columnsById}
            moveColumn={layout.moveColumn}
            table={table}
          />
        }
        onClearSelection={() => setSelectedSeqs(new Set())}
        onCopySelected={() => {
          void navigator.clipboard?.writeText(
            events
              .filter((event) => selectedSeqs.has(event.seq))
              .map((event) => event.raw)
              .join("\n"),
          );
        }}
        onSelectAll={() => setSelectedSeqs(new Set(events.map((event) => event.seq)))}
        onTogglePause={onTogglePause}
        paging={paging}
        selectedCount={selectedSeqs.size}
      />

      <div className="flex min-h-0">
        <SeveritySpine events={events} scrollRef={scrollRef} />

        <div
          ref={scrollRef}
          onScroll={paging.handleScroll}
          className="relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto"
        >
          <div style={{ minWidth: `${tableWidth}px` }}>
            <LogTableHeader renderWidth={renderWidth} table={table} tableWidth={tableWidth} />
            {events.length === 0 ? (
              <EmptyState streaming={streaming} />
            ) : (
              <LogRows
                onInspect={setInspected}
                onToggleSelected={toggleSelected}
                renderWidth={renderWidth}
                rows={rows}
                selectedSeqs={selectedSeqs}
                tableWidth={tableWidth}
                totalHeight={virtualizer.getTotalSize()}
                virtualItems={virtualizer.getVirtualItems()}
              />
            )}
          </div>
        </div>
      </div>

      <LogDetailDialog event={inspected} onClose={() => setInspected(undefined)} />
    </section>
  );
}

function EmptyState({ streaming }: { streaming: boolean }) {
  return (
    <p className="data px-4 py-10 text-[12px] text-mute">
      {streaming
        ? "No entries match these filters."
        : "No stream yet. Pick a source, application and date to start reading."}
    </p>
  );
}

function renderCell(field: string, event: LogEvent, value: string) {
  if (field === "level") {
    return <LogLevelBadge level={event.level} />;
  }

  if (field === "timestamp") {
    const { millis, time } = splitTimestamp(value);

    return (
      <span>
        {time}
        {millis && <span className="text-mute">.{millis}</span>}
      </span>
    );
  }

  if (field === "sourceName") {
    return <span className="text-mute">{compactSource(value)}</span>;
  }

  return value;
}

/**
 * The date is stated once in the status bar, and the source name repeats verbatim on
 * every row, so both columns are narrowed to the part that actually varies.
 */
function columnWidth(field: string, schemaWidth: number): number {
  if (field === "timestamp") {
    return 104;
  }

  return field === "sourceName" ? 104 : schemaWidth;
}
