export interface LogTableColumn {
  id: string;
  label: string;
  /** Event field or parsed-field key this column renders. */
  field: string;
  width: number;
  hideable: boolean;
  groupId: string;
  groupLabel: string;
}

export interface LogTableSchema {
  columns: LogTableColumn[];
}
