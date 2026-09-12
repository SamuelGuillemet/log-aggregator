import type { LogTableSchema } from "@log-aggregator/shared";

/** Shown before the first snapshot arrives, so the table has a shape to render. */
export const FALLBACK_SCHEMA: LogTableSchema = {
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
