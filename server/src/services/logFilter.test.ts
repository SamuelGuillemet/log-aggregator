import type { LogEvent, LogFilter } from "@log-aggregator/shared";
import { describe, expect, it } from "vitest";

import {
  defaultLogFilter,
  filterLogEvents,
  matchesLogFilter,
} from "./logFilter.js";

const event: LogEvent = {
  id: "event-1",
  timestamp: "2026-07-29T10:15:30.123Z",
  receivedAt: "2026-07-29T10:15:31.000Z",
  sourceId: "source-1",
  sourceName: "DEV/FRANCE/back/share-a",
  filePath: "/logs/ACCOUNTING-API-serveur.2026-07-29-0.log",
  instance: "share-a",
  level: "ERROR",
  thread: "main",
  logger: "accounting.Service",
  message: "Created invoice requestId=REQ-42",
  raw: "raw",
};

describe("logFilter", () => {
  it("matches all events with the default filter", () => {
    expect(matchesLogFilter(event, defaultLogFilter)).toBe(true);
  });

  it("filters events by level, source, and text", () => {
    const filter: LogFilter = {
      ...defaultLogFilter,
      levels: ["ERROR"],
      sourceIds: ["source-1"],
      text: "REQ-42",
    };

    expect(filterLogEvents([event], filter)).toEqual([event]);
    expect(filterLogEvents([event], { ...filter, levels: ["INFO"] })).toEqual(
      [],
    );
  });

  it("supports regex filters", () => {
    expect(
      matchesLogFilter(event, {
        ...defaultLogFilter,
        regex: true,
        text: "requestId=REQ-\\d+",
      }),
    ).toBe(true);
  });
});
