export interface LogFieldDefinition {
  id: string;
  label: string;
  field: string;
  width: number;
  hideable: boolean;
}

export interface LogFieldGroup {
  id: string;
  label: string;
  fields: LogFieldDefinition[];
}

export interface LogTableColumn extends LogFieldDefinition {
  groupId: string;
  groupLabel: string;
}

export interface LogTableSchema {
  columns: LogTableColumn[];
}
