import type {
  ColumnOrderState,
  ColumnSizingState,
  VisibilityState,
} from "@tanstack/react-table";

const tableLayoutStorageKey = "log-aggregator:table-layout:v2";

export interface StoredTableLayout {
  columnOrder: ColumnOrderState;
  columnSizing: ColumnSizingState;
  columnVisibility: VisibilityState;
}

export function readStoredTableLayout(): StoredTableLayout {
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

export function saveStoredTableLayout(layout: StoredTableLayout): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(tableLayoutStorageKey, JSON.stringify(layout));
  } catch {
    // The table still works if localStorage is unavailable or full.
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
