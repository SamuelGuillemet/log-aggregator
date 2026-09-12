import type { LogTableSchema } from "@log-aggregator/shared";
import type { ColumnOrderState, ColumnSizingState, VisibilityState } from "@tanstack/react-table";
import { useEffect, useState } from "react";

const STORAGE_KEY = "log-aggregator:table-layout";

export interface TableLayout {
  columnOrder: ColumnOrderState;
  columnSizing: ColumnSizingState;
  columnVisibility: VisibilityState;
}

const EMPTY_LAYOUT: TableLayout = { columnOrder: [], columnSizing: {}, columnVisibility: {} };

export function useTableLayout(schema: LogTableSchema, schemaReady: boolean) {
  const columnIds = schema.columns.map((column) => column.id);
  const columnsById = new Map(schema.columns.map((column) => [column.id, column]));
  const [stored] = useState(readLayout);
  const [columnOrder, setColumnOrder] = useState<ColumnOrderState>(stored.columnOrder);
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>(stored.columnSizing);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(
    stored.columnVisibility,
  );
  const [reconciledKey, setReconciledKey] = useState<string | undefined>(undefined);

  // The schema is parser-driven, so a config change can add or remove columns under a
  // layout saved against the previous one. Reconciled during render rather than in an
  // effect, so the table never paints one frame with a stale column set.
  const schemaKey = schemaReady ? columnIds.join("\u0000") : undefined;

  if (schemaKey !== undefined && schemaKey !== reconciledKey) {
    const knownIds = new Set(columnIds);

    setReconciledKey(schemaKey);
    setColumnOrder((order) => {
      const retained = order.filter((id) => knownIds.has(id));
      const retainedIds = new Set(retained);

      return [...retained, ...columnIds.filter((id) => !retainedIds.has(id))];
    });
    setColumnVisibility((visibility) =>
      Object.fromEntries(columnIds.map((id) => [id, visibility[id] ?? true])),
    );
    setColumnSizing((sizing) =>
      Object.fromEntries(Object.entries(sizing).filter(([id]) => knownIds.has(id))),
    );
  }

  useEffect(() => {
    if (schemaReady) {
      saveLayout({ columnOrder, columnSizing, columnVisibility });
    }
  }, [columnOrder, columnSizing, columnVisibility, schemaReady]);

  function moveColumn(columnId: string, offset: -1 | 1) {
    setColumnOrder((current) => {
      const order = current.length > 0 ? current : columnIds;
      const index = order.indexOf(columnId);
      const target = index + offset;

      if (index < 0 || target < 0 || target >= order.length) {
        return current;
      }

      const next = [...order];
      [next[index], next[target]] = [next[target], next[index]];

      return next;
    });
  }

  return {
    columnOrder,
    columnSizing,
    columnVisibility,
    columnsById,
    moveColumn,
    setColumnOrder,
    setColumnSizing,
    setColumnVisibility,
  };
}

function readLayout(): TableLayout {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : undefined;

    if (!isRecord(parsed)) {
      return EMPTY_LAYOUT;
    }

    return {
      columnOrder: Array.isArray(parsed.columnOrder)
        ? parsed.columnOrder.filter((id) => typeof id === "string")
        : [],
      columnSizing: filterRecord(parsed.columnSizing, Number.isFinite),
      columnVisibility: filterRecord(parsed.columnVisibility, (v) => typeof v === "boolean"),
    };
  } catch {
    return EMPTY_LAYOUT;
  }
}

function saveLayout(layout: TableLayout): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // The table still works when storage is unavailable or full.
  }
}

function filterRecord<T>(
  value: unknown,
  accept: (candidate: unknown) => boolean,
): Record<string, T> {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(Object.entries(value).filter(([, entry]) => accept(entry))) as Record<
    string,
    T
  >;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
