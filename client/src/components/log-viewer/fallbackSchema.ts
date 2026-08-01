import type { LogTableSchema } from "@log-aggregator/shared";

export const fallbackSchema: LogTableSchema = {
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
