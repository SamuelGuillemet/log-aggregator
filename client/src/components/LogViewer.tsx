import type { LogEvent } from "@log-aggregator/shared";
import {
  type ColumnDef,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useMemo, useRef } from "react";
import { useShallow } from "zustand/react/shallow";

import { useLogStore } from "@/stores/logStore";
import { fallbackSchema } from "./log-viewer/fallbackSchema";
import { LogLevelBadge } from "./log-viewer/LogLevelBadge";
import { LogTableHeader } from "./log-viewer/LogTableHeader";
import { LogViewerToolbar } from "./log-viewer/LogViewerToolbar";
import { getLogEventFieldValue } from "./log-viewer/logEventFields";
import { useExpandedRows } from "./log-viewer/useExpandedRows";
import { useLogPageLoader } from "./log-viewer/useLogPageLoader";
import { useLogTableLayout } from "./log-viewer/useLogTableLayout";
import { useScrollAreaWidth } from "./log-viewer/useScrollAreaWidth";
import { VirtualLogRows } from "./log-viewer/VirtualLogRows";

export function LogViewer() {
  const { appendLogPage, clientId, events, filter, hasMore, schema, setError } =
    useLogStore(
      useShallow((state) => ({
        appendLogPage: state.appendLogPage,
        clientId: state.clientId,
        events: state.events,
        filter: state.filter,
        hasMore: state.hasMore,
        schema: state.schema,
        setError: state.setError,
      })),
    );
  const activeSchema = schema ?? fallbackSchema;

  const columns = useMemo<ColumnDef<LogEvent>[]>(
    () =>
      activeSchema.columns.map((column) => ({
        accessorFn: (event) => getLogEventFieldValue(event, column.field),
        cell: (cell) =>
          column.id === "level" ? (
            <LogLevelBadge level={String(cell.getValue() ?? "")} />
          ) : (
            String(cell.getValue() ?? "")
          ),
        enableHiding: column.hideable,
        enableResizing: true,
        header: column.label,
        id: column.id,
        minSize: Math.min(column.width, 80),
        size: column.width,
      })),
    [activeSchema],
  );
  const {
    columnOrder,
    columnSizing,
    columnVisibility,
    moveColumn,
    schemaById,
    setColumnOrder,
    setColumnSizing,
    setColumnVisibility,
  } = useLogTableLayout(activeSchema, Boolean(schema));
  const { expandedRows, toggleExpanded } = useExpandedRows();
  const parentRef = useRef<HTMLDivElement>(null);
  const oldestEvent = events.at(-1);
  const {
    handleScroll,
    loadingOlder,
    loadOlderEvents,
    loadUntilTimestamp,
    setUntilInput,
    untilInput,
  } = useLogPageLoader({
    appendLogPage,
    clientId,
    filter,
    hasMore,
    oldestEvent,
    parentRef,
    setError,
  });
  const table = useReactTable({
    columnResizeMode: "onChange",
    columns,
    data: events,
    enableColumnResizing: true,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (event) => event.id,
    onColumnOrderChange: setColumnOrder,
    onColumnSizingChange: setColumnSizing,
    onColumnVisibilityChange: setColumnVisibility,
    state: { columnOrder, columnSizing, columnVisibility },
  });
  const rows = table.getRowModel().rows;
  const scrollAreaWidth = useScrollAreaWidth(parentRef);
  const visibleColumns = table.getVisibleLeafColumns();
  const baseTableWidth = table.getTotalSize();
  const tableWidth = Math.max(baseTableWidth, scrollAreaWidth);
  const stretchedColumnId =
    visibleColumns.find((column) => column.id === "message")?.id ??
    visibleColumns.at(-1)?.id;
  const extraTableWidth = Math.max(0, tableWidth - baseTableWidth);
  const virtualizer = useVirtualizer({
    count: rows.length,
    estimateSize: (index) =>
      expandedRows.has(rows[index]?.original.id ?? "") ? 170 : 36,
    getScrollElement: () => parentRef.current,
    measureElement: (element) => element.getBoundingClientRect().height,
    overscan: 12,
  });

  function getRenderWidth(columnId: string, width: number): number {
    return columnId === stretchedColumnId ? width + extraTableWidth : width;
  }

  return (
    <section
      className="grid grid-rows-[auto_1fr] rounded-lg h-full min-h-0 overflow-hidden atelier-card"
      aria-label="Live logs"
    >
      <LogViewerToolbar
        columnOrder={columnOrder}
        columnVisibility={columnVisibility}
        hasMore={hasMore}
        loadingOlder={loadingOlder}
        loadOlderEvents={loadOlderEvents}
        loadUntilTimestamp={loadUntilTimestamp}
        moveColumn={moveColumn}
        schemaById={schemaById}
        setUntilInput={setUntilInput}
        table={table}
        untilInput={untilInput}
      />

      <div
        ref={parentRef}
        onScroll={handleScroll}
        className="relative bg-card/90 h-full min-h-0 overflow-auto"
      >
        <div style={{ minWidth: `${tableWidth}px` }}>
          <LogTableHeader
            getRenderWidth={getRenderWidth}
            table={table}
            tableWidth={tableWidth}
          />
          <VirtualLogRows
            expandedRows={expandedRows}
            getRenderWidth={getRenderWidth}
            measureElement={virtualizer.measureElement}
            rows={rows}
            tableWidth={tableWidth}
            toggleExpanded={toggleExpanded}
            virtualItems={virtualizer.getVirtualItems()}
            virtualSize={virtualizer.getTotalSize()}
          />
        </div>
      </div>
    </section>
  );
}
