import type { LogFieldGroup, LogTableSchema } from "@log-aggregator/shared";

export function createLogTableSchema(
  fieldGroups: LogFieldGroup[],
): LogTableSchema {
  const baseGroup: LogFieldGroup = {
    id: "base",
    label: "Base",
    fields: [
      {
        id: "timestamp",
        label: "Time",
        field: "timestamp",
        width: 188,
        hideable: false,
      },
      {
        id: "sourceName",
        label: "Source",
        field: "sourceName",
        width: 240,
        hideable: true,
      },
      {
        id: "level",
        label: "Level",
        field: "level",
        width: 90,
        hideable: false,
      },
    ],
  };
  const messageGroup: LogFieldGroup = {
    id: "message",
    label: "Message",
    fields: [
      {
        id: "message",
        label: "Message",
        field: "message",
        width: 520,
        hideable: false,
      },
    ],
  };

  return {
    columns: [baseGroup, ...fieldGroups, messageGroup].flatMap((group) =>
      group.fields.map((field) => ({
        ...field,
        groupId: group.id,
        groupLabel: group.label,
      })),
    ),
  };
}
