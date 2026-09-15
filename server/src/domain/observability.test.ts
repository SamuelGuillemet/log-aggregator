import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { LogEvent } from "@log-aggregator/shared";
import type { ObservabilityFieldMapping } from "../config/types.js";
import type { StoredEvent } from "./eventBuffer.js";
import { ObservabilityAggregator } from "./observability.js";

const MAPPING: ObservabilityFieldMapping = {
  durationField: "timeTakenMs",
  methodField: "method",
  statusField: "status",
  urlField: "url",
};

function event(
  overrides: Partial<LogEvent> & Pick<LogEvent, "seq" | "timestampMs">,
  fields: Record<string, string> = {},
): StoredEvent {
  const logEvent: LogEvent = {
    fields,
    filePath: "/logs/app.log",
    level: "INFO",
    messageOffset: 0,
    raw: `line-${overrides.seq}`,
    revision: 0,
    sourceId: "a",
    sourceName: "A",
    sourceSeq: overrides.seq,
    timestampText: "",
    ...overrides,
  };

  return { event: logEvent, lowerRaw: undefined };
}

/** No-op rescan: only exercised by tests that deliberately dirty the extremes. */
function noRescan(): void {
  assert.fail("rescan should not run unless an extreme was forgotten");
}

describe("ObservabilityAggregator", () => {
  it("reports nothing when no field mapping is configured", () => {
    const aggregator = new ObservabilityAggregator(undefined);

    aggregator.record(event({ seq: 1, timestampMs: 1_000 }, { status: "200", timeTakenMs: "5" }));

    assert.equal(aggregator.enabled, false);

    const stats = aggregator.snapshot(noRescan);

    assert.equal(stats.sampleCount, 0);
    assert.deepEqual(stats.statusCounts, {});
    assert.deepEqual(stats.hourly, []);
    assert.deepEqual(stats.slowest, []);
    assert.equal(stats.duration.count, 0);
    assert.ok(stats.duration.buckets.every((bucket) => bucket.count === 0));
  });

  it("ignores events missing or with an unparsable duration", () => {
    const aggregator = new ObservabilityAggregator(MAPPING);

    aggregator.record(event({ seq: 1, timestampMs: 1_000 }, { status: "200" }));
    aggregator.record(event({ seq: 2, timestampMs: 2_000 }, { status: "200", timeTakenMs: "n/a" }));

    assert.equal(aggregator.snapshot(noRescan).sampleCount, 0);
  });

  it("counts status codes and computes duration min/max/avg", () => {
    const aggregator = new ObservabilityAggregator(MAPPING);

    aggregator.record(event({ seq: 1, timestampMs: 1_000 }, { status: "200", timeTakenMs: "10" }));
    aggregator.record(event({ seq: 2, timestampMs: 2_000 }, { status: "200", timeTakenMs: "30" }));
    aggregator.record(event({ seq: 3, timestampMs: 3_000 }, { status: "500", timeTakenMs: "20" }));

    const stats = aggregator.snapshot(noRescan);

    assert.deepEqual(stats.statusCounts, { "200": 2, "500": 1 });
    assert.equal(stats.duration.count, 3);
    assert.equal(stats.duration.minMs, 10);
    assert.equal(stats.duration.maxMs, 30);
    assert.equal(stats.duration.avgMs, 20);
  });

  it("keeps the slowest entries capped and sorted, largest first", () => {
    const aggregator = new ObservabilityAggregator(MAPPING);

    for (let index = 1; index <= 25; index += 1) {
      aggregator.record(
        event(
          { seq: index, timestampMs: index * 1_000 },
          { status: "200", timeTakenMs: `${index}` },
        ),
      );
    }

    const { slowest } = aggregator.snapshot(noRescan);

    assert.equal(slowest.length, 20);
    assert.equal(slowest[0].durationMs, 25);
    assert.equal(slowest.at(-1)?.durationMs, 6);
    assert.ok(
      slowest.every(
        (entry, index) => index === 0 || entry.durationMs <= slowest[index - 1].durationMs,
      ),
    );
  });

  it("decrements exact counters when an event is forgotten", () => {
    const aggregator = new ObservabilityAggregator(MAPPING);
    const first = event({ seq: 1, timestampMs: 1_000 }, { status: "200", timeTakenMs: "10" });
    const second = event({ seq: 2, timestampMs: 2_000 }, { status: "200", timeTakenMs: "30" });

    aggregator.record(first);
    aggregator.record(second);
    aggregator.forget(first);

    const stats = aggregator.snapshot((visit) => visit(second));

    assert.deepEqual(stats.statusCounts, { "200": 1 });
    assert.equal(stats.duration.count, 1);
    assert.equal(stats.duration.avgMs, 30);
  });

  it("rescans to find the new max after the tracked max is forgotten", () => {
    const aggregator = new ObservabilityAggregator(MAPPING);
    const low = event({ seq: 1, timestampMs: 1_000 }, { status: "200", timeTakenMs: "10" });
    const high = event({ seq: 2, timestampMs: 2_000 }, { status: "200", timeTakenMs: "99" });

    aggregator.record(low);
    aggregator.record(high);
    aggregator.forget(high);

    const stats = aggregator.snapshot((visit) => visit(low));

    assert.equal(stats.duration.maxMs, 10);
    assert.equal(stats.slowest.length, 1);
    assert.equal(stats.slowest[0].seq, 1);
  });

  it("buckets duration into the fixed histogram and hour-of-day", () => {
    const aggregator = new ObservabilityAggregator(MAPPING);
    const localHour = new Date(2_000).getHours();

    aggregator.record(event({ seq: 1, timestampMs: 2_000 }, { status: "200", timeTakenMs: "5" }));
    aggregator.record(
      event({ seq: 2, timestampMs: 2_000 }, { status: "200", timeTakenMs: "5000" }),
    );

    const stats = aggregator.snapshot(noRescan);
    const smallBucket = stats.duration.buckets.find((bucket) => bucket.upperBoundMs === 10);
    const hourBucket = stats.hourly.find((bucket) => bucket.hour === localHour);

    assert.equal(smallBucket?.count, 1);
    assert.equal(hourBucket?.count, 2);
  });

  it("clears every counter and tracked extreme", () => {
    const aggregator = new ObservabilityAggregator(MAPPING);

    aggregator.record(event({ seq: 1, timestampMs: 1_000 }, { status: "200", timeTakenMs: "10" }));
    aggregator.clear();

    assert.deepEqual(aggregator.snapshot(noRescan).statusCounts, {});
    assert.equal(aggregator.snapshot(noRescan).sampleCount, 0);
  });

  it("tracks request count and average duration per method+url key, busiest first", () => {
    const aggregator = new ObservabilityAggregator(MAPPING);

    aggregator.record(
      event(
        { seq: 1, timestampMs: 1_000 },
        { method: "GET", status: "200", timeTakenMs: "10", url: "/api/users" },
      ),
    );
    aggregator.record(
      event(
        { seq: 2, timestampMs: 2_000 },
        { method: "GET", status: "200", timeTakenMs: "30", url: "/api/users" },
      ),
    );
    aggregator.record(
      event(
        { seq: 3, timestampMs: 3_000 },
        { method: "POST", status: "200", timeTakenMs: "20", url: "/api/orders" },
      ),
    );

    assert.deepEqual(aggregator.urlKeys(), [
      { avgDurationMs: 20, count: 2, method: "GET", url: "/api/users" },
      { avgDurationMs: 20, count: 1, method: "POST", url: "/api/orders" },
    ]);
  });

  it("scopes a snapshot to a single method+url key", () => {
    const aggregator = new ObservabilityAggregator(MAPPING);

    aggregator.record(
      event(
        { seq: 1, timestampMs: 1_000 },
        { method: "GET", status: "200", timeTakenMs: "10", url: "/api/users" },
      ),
    );
    aggregator.record(
      event(
        { seq: 2, timestampMs: 2_000 },
        { method: "POST", status: "500", timeTakenMs: "30", url: "/api/orders" },
      ),
    );

    const stats = aggregator.snapshot(noRescan, { method: "GET", url: "/api/users" });

    assert.equal(stats.sampleCount, 1);
    assert.deepEqual(stats.statusCounts, { "200": 1 });
    assert.equal(stats.duration.avgMs, 10);
  });

  it("decrements a key's count when its event is forgotten, dropping it once empty", () => {
    const aggregator = new ObservabilityAggregator(MAPPING);
    const only = event(
      { seq: 1, timestampMs: 1_000 },
      { method: "GET", status: "200", timeTakenMs: "10", url: "/api/users" },
    );

    aggregator.record(only);
    aggregator.forget(only);

    assert.deepEqual(aggregator.urlKeys(), []);
  });

  it("omits a key when no url field is present in a sample", () => {
    const aggregator = new ObservabilityAggregator(MAPPING);

    aggregator.record(event({ seq: 1, timestampMs: 1_000 }, { status: "200", timeTakenMs: "10" }));

    assert.deepEqual(aggregator.urlKeys(), []);
  });
});
