import type { LogEvent, LogSource } from "@log-aggregator/shared";
import { describe, expect, it } from "vitest";

import { LogContinuationTracker } from "./LogContinuationTracker.js";

const source: LogSource = {
  id: "source-1",
  name: "DEV/FR/back/share",
  directory: "/logs",
  enabled: true,
};

describe("LogContinuationTracker", () => {
  it("appends unparsed continuation lines to the latest event for the same file", () => {
    const tracker = new LogContinuationTracker();
    const event = createEvent("event-1");

    tracker.remember(source, "/logs/app.log", event);

    expect(tracker.appendLine(source, "/logs/app.log", "\tat frame")).toBe(
      event,
    );
    expect(event.message).toBe("message\n\tat frame");
    expect(event.raw).toBe("raw\n\tat frame");
  });

  it("ignores continuation lines when no event exists for the file", () => {
    const tracker = new LogContinuationTracker();

    expect(
      tracker.appendLine(source, "/logs/missing.log", "\tat frame"),
    ).toBeUndefined();
  });
});

function createEvent(id: string): LogEvent {
  return {
    id,
    timestamp: "2026-07-29T10:15:30.000",
    receivedAt: "2026-07-29T10:15:30.100Z",
    sourceId: source.id,
    sourceName: source.name,
    filePath: "/logs/app.log",
    level: "INFO",
    message: "message",
    raw: "raw",
    fields: {},
  };
}
