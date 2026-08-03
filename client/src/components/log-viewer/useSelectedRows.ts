import { useState } from "react";

export function useSelectedRows() {
  const [selectedRows, setSelectedRows] = useState<Set<string>>(
    () => new Set(),
  );

  function toggleSelected(rowId: string) {
    setSelectedRows((currentRows) => {
      const nextRows = new Set(currentRows);

      if (nextRows.has(rowId)) {
        nextRows.delete(rowId);
      } else {
        nextRows.add(rowId);
      }

      return nextRows;
    });
  }

  function clearSelection() {
    setSelectedRows(new Set());
  }

  function selectAll(rowIds: string[]) {
    setSelectedRows(new Set(rowIds));
  }

  return { clearSelection, selectAll, selectedRows, toggleSelected };
}
