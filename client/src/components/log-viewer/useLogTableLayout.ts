import type { LogTableSchema } from "@log-aggregator/shared";
import type {
  ColumnOrderState,
  ColumnSizingState,
  VisibilityState,
} from "@tanstack/react-table";
import { useEffect, useMemo, useState } from "react";

import {
  readStoredTableLayout,
  saveStoredTableLayout,
} from "./tableLayoutStorage";

export function useLogTableLayout(
  schema: LogTableSchema,
  schemaReady: boolean,
) {
  const schemaColumnIds = useMemo(
    () => schema.columns.map((column) => column.id),
    [schema],
  );
  const schemaById = useMemo(
    () => new Map(schema.columns.map((column) => [column.id, column])),
    [schema],
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

  useEffect(() => {
    if (!schemaReady) {
      return;
    }

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
  }, [schemaColumnIds, schemaReady]);

  useEffect(() => {
    if (!schemaReady) {
      return;
    }

    saveStoredTableLayout({
      columnOrder,
      columnSizing,
      columnVisibility,
    });
  }, [columnOrder, columnSizing, columnVisibility, schemaReady]);

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

  return {
    columnOrder,
    columnSizing,
    columnVisibility,
    moveColumn,
    schemaById,
    setColumnOrder,
    setColumnSizing,
    setColumnVisibility,
  };
}
