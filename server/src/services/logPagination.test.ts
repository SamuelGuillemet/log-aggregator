import type { LogEvent, LogFilter } from "@log-aggregator/shared";
import { describe, expect, it } from "vitest";

import { defaultLogFilter } from "./logFilter.js";
import { getLogEventPage } from "./logPagination.js";

describe("getLogEventPage", () => {
  it("returns newest events first with a cursor for older pages", () => {
    const events = [
      createEvent("old", 1),
      createEvent("middle", 2),
      createEvent("new", 3),
    ];

    const firstPage = getLogEventPage(events, defaultLogFilter, { limit: 2 });

    expect(firstPage.events.map((event) => event.id)).toEqual([
      "new",
      "middle",
    ]);
    expect(firstPage.hasMore).toBe(true);

    const olderPage = getLogEventPage(events, defaultLogFilter, {
      beforeCursor: {
        filePath: firstPage.events[1].filePath,
        id: firstPage.events[1].id,
        receivedAt: firstPage.events[1].receivedAt,
        timestamp: firstPage.events[1].timestamp,
      },
      limit: 2,
    });

    expect(olderPage.events.map((event) => event.id)).toEqual(["old"]);
    expect(olderPage.hasMore).toBe(false);
  });

  it("applies filters and timestamp bounds before paging", () => {
    const filter: LogFilter = {
      ...defaultLogFilter,
      levels: ["ERROR"],
    };
    const events = [
      createEvent("old-error", 1, "ERROR"),
      createEvent("new-info", 2, "INFO"),
      createEvent("new-error", 3, "ERROR"),
    ];

    const page = getLogEventPage(events, filter, {
      fromTimestamp: "2026-07-29T10:15:32.000",
      limit: 10,
    });

    expect(page.events.map((event) => event.id)).toEqual(["new-error"]);
    expect(page.hasMore).toBe(false);
  });
});

function createEvent(
  id: string,
  second: number,
  level: LogEvent["level"] = "INFO",
): LogEvent {
  return {
    id,
    timestamp: `2026-07-29T10:15:3${second}.000`,
    receivedAt: `2026-07-29T10:15:3${second}.100Z`,
    sourceId: "source-1",
    sourceName: "DEV/FR/back/share",
    filePath: `/logs/${id}.log`,
    level,
    message: id,
    raw: id,
    fields: {},
  };
}
