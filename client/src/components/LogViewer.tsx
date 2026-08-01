import type {
  LogCursor,
  LogEvent,
  LogPageRequest,
  LogTableSchema,
} from "@log-aggregator/shared";
import {
  type ColumnDef,
  type ColumnOrderState,
  type ColumnSizingState,
  flexRender,
  getCoreRowModel,
  useReactTable,
  type VisibilityState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsDown,
  Clipboard,
  Clock,
  Columns3,
  Eye,
  EyeOff,
} from "lucide-react";
import {
  type UIEvent,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useShallow } from "zustand/react/shallow";
import { cn } from "@/lib/utils";
import { fetchLogPage } from "@/services/logApiClient";
import { useLogStore } from "@/stores/logStore";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

const fallbackSchema: LogTableSchema = {
  columns: [
    {
      field: "timestamp",
      groupId: "base",
      groupLabel: "Base",
      hideable: false,
      id: "timestamp",
      label: "Time",
      width: 188,
    },
    {
      field: "sourceName",
      groupId: "base",
      groupLabel: "Base",
      hideable: true,
      id: "sourceName",
      label: "Source",
      width: 240,
    },
    {
      field: "level",
      groupId: "base",
      groupLabel: "Base",
      hideable: false,
      id: "level",
      label: "Level",
      width: 90,
    },
    {
      field: "message",
      groupId: "base",
      groupLabel: "Base",
      hideable: false,
      id: "message",
      label: "Message",
      width: 520,
    },
  ],
};

const pageSize = 50;
const tableLayoutStorageKey = "log-aggregator:table-layout";

interface StoredTableLayout {
  columnOrder: ColumnOrderState;
  columnSizing: ColumnSizingState;
  columnVisibility: VisibilityState;
}

export function LogViewer() {
  const { appendLogPage, events, filter, hasMore, schema, setError } =
    useLogStore(
      useShallow((state) => ({
        appendLogPage: state.appendLogPage,
        events: state.events,
        filter: state.filter,
        hasMore: state.hasMore,
        schema: state.schema,
        setError: state.setError,
      })),
    );
  const activeSchema = schema ?? fallbackSchema;
  const deferredEvents = useDeferredValue(events);
  const sortedEvents = useMemo(
    () => [...deferredEvents].sort(compareLogEventsNewestFirst),
    [deferredEvents],
  );
  const columns = useMemo<ColumnDef<LogEvent>[]>(
    () =>
      activeSchema.columns.map((column) => ({
        accessorFn: (event) => getFieldValue(event, column.field),
        cell: (cell) =>
          column.id === "level"
            ? renderLevel(String(cell.getValue() ?? ""))
            : String(cell.getValue() ?? ""),
        enableHiding: column.hideable,
        enableResizing: true,
        header: column.label,
        id: column.id,
        minSize: Math.min(column.width, 80),
        size: column.width,
      })),
    [activeSchema],
  );
  const schemaColumnIds = useMemo(
    () => activeSchema.columns.map((column) => column.id),
    [activeSchema],
  );
  const schemaById = useMemo(
    () => new Map(activeSchema.columns.map((column) => [column.id, column])),
    [activeSchema],
  );
  const [storedTableLayout] = useState(readStoredTableLayout);
  const [columnOrder, setColumnOrder] = useState<ColumnOrderState>(
    storedTableLayout.columnOrder,
  );
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>(
    storedTableLayout.columnSizing,
  );
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(
    storedTableLayout.columnVisibility,
  );
  const [expandedRows, setExpandedRows] = useState<Set<string>>(
    () => new Set(),
  );
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [scrollAreaWidth, setScrollAreaWidth] = useState(0);
  const [untilInput, setUntilInput] = useState("");
  const bottomLoadArmedRef = useRef(true);
  const parentRef = useRef<HTMLDivElement>(null);
  const loadingOlderRef = useRef(false);

  useEffect(() => {
    setColumnOrder((currentOrder) => {
      const ordered = currentOrder.filter((id) => schemaColumnIds.includes(id));
      const missing = schemaColumnIds.filter((id) => !ordered.includes(id));

      return [...ordered, ...missing];
    });
    setColumnVisibility((currentVisibility) =>
      Object.fromEntries(
        schemaColumnIds.map((id) => [id, currentVisibility[id] ?? true]),
      ),
    );
    setColumnSizing((currentSizing) =>
      Object.fromEntries(
        Object.entries(currentSizing).filter(([id]) =>
          schemaColumnIds.includes(id),
        ),
      ),
    );
  }, [schemaColumnIds]);

  useEffect(() => {
    saveStoredTableLayout({
      columnOrder,
      columnSizing,
      columnVisibility,
    });
  }, [columnOrder, columnSizing, columnVisibility]);

  const table = useReactTable({
    columnResizeMode: "onChange",
    columns,
    data: sortedEvents,
    enableColumnResizing: true,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (event) => event.id,
    onColumnOrderChange: setColumnOrder,
    onColumnSizingChange: setColumnSizing,
    onColumnVisibilityChange: setColumnVisibility,
    state: { columnOrder, columnSizing, columnVisibility },
  });
  const rows = table.getRowModel().rows;
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
  const oldestEvent = sortedEvents.at(-1);

  useEffect(() => {
    const element = parentRef.current;

    if (!element) {
      return;
    }

    setScrollAreaWidth(element.clientWidth);

    const resizeObserver = new ResizeObserver(() => {
      setScrollAreaWidth(element.clientWidth);
    });

    resizeObserver.observe(element);

    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    const element = parentRef.current;

    if (!element || !hasMore || !oldestEvent || loadingOlderRef.current) {
      return;
    }

    if (element.scrollHeight <= element.clientHeight + 4) {
      void loadOlderEvents();
    }
  }, [hasMore, oldestEvent]);

  useEffect(() => {
    bottomLoadArmedRef.current = true;
  }, [filter]);

  function handleScroll(event: UIEvent<HTMLDivElement>) {
    const target = event.currentTarget;
    const distanceToBottom =
      target.scrollHeight - target.scrollTop - target.clientHeight;

    if (distanceToBottom > 360) {
      bottomLoadArmedRef.current = true;
      return;
    }

    if (distanceToBottom < 180 && bottomLoadArmedRef.current) {
      bottomLoadArmedRef.current = false;
      void loadOlderEvents();
    }
  }

  async function loadPage(request: LogPageRequest) {
    if (loadingOlderRef.current) {
      return;
    }

    loadingOlderRef.current = true;
    setLoadingOlder(true);

    try {
      appendLogPage(await fetchLogPage({ ...request, filter }));
    } catch {
      setError("Failed to load older logs");
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlder(false);
    }
  }

  async function loadOlderEvents() {
    if (!hasMore || !oldestEvent) {
      return;
    }

    await loadPage({ before: toCursor(oldestEvent), limit: pageSize });
  }

  function getRenderWidth(columnId: string, width: number): number {
    return columnId === stretchedColumnId ? width + extraTableWidth : width;
  }

  function moveColumn(columnId: string, offset: -1 | 1) {
    setColumnOrder((currentOrder) => {
      const order = currentOrder.length > 0 ? currentOrder : schemaColumnIds;
      const currentIndex = order.indexOf(columnId);
      const nextIndex = currentIndex + offset;

      if (currentIndex < 0 || nextIndex < 0 || nextIndex >= order.length) {
        return currentOrder;
      }

      const nextOrder = [...order];

      [nextOrder[currentIndex], nextOrder[nextIndex]] = [
        nextOrder[nextIndex],
        nextOrder[currentIndex],
      ];

      return nextOrder;
    });
  }

  function toggleExpanded(rowId: string) {
    setExpandedRows((currentRows) => {
      const nextRows = new Set(currentRows);

      if (nextRows.has(rowId)) {
        nextRows.delete(rowId);
      } else {
        nextRows.add(rowId);
      }

      return nextRows;
    });
  }

  function loadUntilTimestamp() {
    const timestamp = parseUntilInput(untilInput);

    if (!timestamp) {
      return;
    }

    void loadPage({ limit: 1_000, until: timestamp });
  }

  return (
    <section
      className="grid grid-rows-[auto_1fr] border border-[#b8b1a2] rounded-lg h-full min-h-0 overflow-hidden"
      aria-label="Live logs"
    >
      <div className="flex max-md:flex-col justify-between gap-2 bg-card/75 p-2 border-[#b8b1a2] border-b">
        <details className="relative">
          <summary className="inline-flex items-center gap-2 px-3 py-2 border border-input rounded-md min-h-9 font-medium text-sm cursor-pointer select-none">
            <Columns3 size={16} />
            Columns
          </summary>
          <div className="z-30 absolute bg-card shadow-lg mt-2 p-2 border border-[#b8b1a2] rounded-md min-w-72 max-h-80 overflow-auto">
            {table.getAllLeafColumns().map((column) => {
              const columnSchema = schemaById.get(column.id);
              const orderIndex = columnOrder.indexOf(column.id);

              return (
                <div
                  key={column.id}
                  className="items-center gap-1 grid grid-cols-[1fr_auto_auto_auto] py-1 text-sm"
                >
                  <label className="flex items-center gap-2 min-w-0">
                    <input
                      type="checkbox"
                      checked={column.getIsVisible()}
                      disabled={!column.getCanHide()}
                      onChange={column.getToggleVisibilityHandler()}
                    />
                    <span className="truncate">
                      {columnSchema?.label ?? column.id}
                    </span>
                  </label>
                  {column.getIsVisible() ? (
                    <Eye size={15} />
                  ) : (
                    <EyeOff size={15} />
                  )}
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
        </details>
        <div className="flex max-sm:flex-col items-center max-sm:items-stretch gap-2">
          <Input
            aria-label="Load logs until timestamp"
            className="w-56"
            type="datetime-local"
            value={untilInput}
            onChange={(event) => setUntilInput(event.currentTarget.value)}
          />
          <Button
            variant="outline"
            type="button"
            disabled={!untilInput}
            onClick={loadUntilTimestamp}
            title="Load logs until timestamp"
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
        </div>
      </div>

      <div
        ref={parentRef}
        onScroll={handleScroll}
        className="relative bg-card/90 h-full min-h-0 overflow-auto"
      >
        <div style={{ minWidth: `${tableWidth}px` }}>
          <div
            className="top-0 z-20 sticky flex bg-primary min-h-9 font-bold text-primary-foreground text-xs"
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
                  {flexRender(
                    header.column.columnDef.header,
                    header.getContext(),
                  )}
                  <button
                    type="button"
                    className="right-0 absolute inset-y-0 w-2 touch-none cursor-col-resize"
                    onMouseDown={header.getResizeHandler()}
                    onTouchStart={header.getResizeHandler()}
                    title="Resize column"
                    aria-label="Resize column"
                  />
                </div>
              )),
            )}
          </div>
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              position: "relative",
              width: `${tableWidth}px`,
            }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const row = rows[virtualRow.index];
              const expanded = expandedRows.has(row.original.id);

              return (
                <div
                  key={row.id}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  className={cn(
                    "top-0 absolute inset-x-0 border-[#e5dece] border-b font-mono text-foreground text-xs",
                    (row.original.level === "ERROR" ||
                      row.original.level === "FATAL") &&
                      "bg-[#fff1eb]",
                    row.original.level === "WARN" && "bg-[#fff8e8]",
                  )}
                  style={{ transform: `translateY(${virtualRow.start}px)` }}
                >
                  <div
                    role="button"
                    tabIndex={0}
                    className="flex min-h-9 text-left"
                    onClick={() => toggleExpanded(row.original.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        toggleExpanded(row.original.id);
                      }
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
                        style={{
                          flex: `0 0 ${getRenderWidth(
                            cell.column.id,
                            cell.column.getSize(),
                          )}px`,
                        }}
                        title={String(cell.getValue() ?? "")}
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </div>
                    ))}
                  </div>
                  {expanded ? (
                    <div className="bg-[#fffdf7] p-3 border-[#e5dece] border-t">
                      <div className="flex justify-between items-center gap-3 mb-2">
                        <strong className="font-sans text-[#7b3025] text-xs uppercase">
                          Full message
                        </strong>
                        <Button
                          variant="outline"
                          size="icon"
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void navigator.clipboard?.writeText(
                              row.original.raw,
                            );
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
        </div>
      </div>
    </section>
  );
}

function renderLevel(level: string) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={cn(
          "inline-block bg-muted-foreground rounded-full size-2",
          level === "WARN" && "bg-[#be8b2f]",
          (level === "ERROR" || level === "FATAL") && "bg-destructive",
          (level === "INFO" || level === "DEBUG" || level === "TRACE") &&
            "bg-primary",
        )}
      />
      {level}
    </span>
  );
}

function getFieldValue(event: LogEvent, field: string): string {
  const value = event[field as keyof LogEvent];

  return typeof value === "string" ? value : "";
}

function toCursor(event: LogEvent): LogCursor {
  return {
    filePath: event.filePath,
    id: event.id,
    receivedAt: event.receivedAt,
    timestamp: event.timestamp,
  };
}

function parseUntilInput(value: string): string | undefined {
  const timestamp = new Date(value);

  return Number.isNaN(timestamp.getTime())
    ? undefined
    : timestamp.toISOString();
}

function compareLogEventsNewestFirst(left: LogEvent, right: LogEvent): number {
  const timestampOrder = compareTimestamp(right.timestamp, left.timestamp);

  if (timestampOrder !== 0) {
    return timestampOrder;
  }

  return (
    compareTimestamp(right.receivedAt, left.receivedAt) ||
    right.filePath.localeCompare(left.filePath) ||
    right.id.localeCompare(left.id)
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

function readStoredTableLayout(): StoredTableLayout {
  if (typeof window === "undefined") {
    return getEmptyStoredTableLayout();
  }

  try {
    const value = window.localStorage.getItem(tableLayoutStorageKey);

    if (!value) {
      return getEmptyStoredTableLayout();
    }

    const parsed = JSON.parse(value) as unknown;

    if (!isRecord(parsed)) {
      return getEmptyStoredTableLayout();
    }

    return {
      columnOrder: Array.isArray(parsed.columnOrder)
        ? parsed.columnOrder.filter(isString)
        : [],
      columnSizing: readNumberRecord(parsed.columnSizing),
      columnVisibility: readBooleanRecord(parsed.columnVisibility),
    };
  } catch {
    return getEmptyStoredTableLayout();
  }
}

function saveStoredTableLayout(layout: StoredTableLayout) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(tableLayoutStorageKey, JSON.stringify(layout));
  } catch {
    // Ignore unavailable or full storage; the table still works without persistence.
  }
}

function getEmptyStoredTableLayout(): StoredTableLayout {
  return {
    columnOrder: [],
    columnSizing: {},
    columnVisibility: {},
  };
}

function readBooleanRecord(value: unknown): VisibilityState {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter(
      ([, recordValue]) => typeof recordValue === "boolean",
    ),
  ) as VisibilityState;
}

function readNumberRecord(value: unknown): ColumnSizingState {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter(
      ([, recordValue]) =>
        typeof recordValue === "number" && Number.isFinite(recordValue),
    ),
  ) as ColumnSizingState;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}
