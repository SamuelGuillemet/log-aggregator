import { useState } from "react";

export function useExpandedRows() {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(
    () => new Set(),
  );

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

  return { expandedRows, toggleExpanded };
}
