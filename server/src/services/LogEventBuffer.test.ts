import type { LogEvent } from "@log-aggregator/shared";
import { describe, expect, it } from "vitest";

import { LogEventBuffer } from "./LogEventBuffer.js";

describe("LogEventBuffer", () => {
  it("keeps only the newest events within the configured limit", () => {
    const buffer = new LogEventBuffer(2);

    buffer.add(createEvent("one"));
    buffer.add(createEvent("two"));
    buffer.add(createEvent("three"));

    expect(buffer.getEvents().map((event) => event.id)).toEqual([
      "two",
      "three",
    ]);
  });

  it("can be cleared", () => {
    const buffer = new LogEventBuffer(2);

    buffer.add(createEvent("one"));
    buffer.clear();

    expect(buffer.getEvents()).toHaveLength(0);
  });
});

function createEvent(id: string): LogEvent {
  return {
    id,
    timestamp: `2026-07-29T10:15:3${id.length}.000`,
    receivedAt: `2026-07-29T10:15:3${id.length}.100Z`,
    sourceId: "source-1",
    sourceName: "DEV/FR/back/share",
    filePath: "/logs/app.log",
    level: "INFO",
    message: id,
    raw: id,
    fields: {},
  };
}
