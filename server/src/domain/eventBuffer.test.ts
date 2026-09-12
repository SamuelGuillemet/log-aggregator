import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { LogEvent } from "@log-aggregator/shared";
import { EventBuffer, MATCH_ALL, type StoredEvent } from "./eventBuffer.js";

function event(overrides: Partial<LogEvent> & Pick<LogEvent, "seq" | "timestampMs">): LogEvent {
  return {
    fields: {},
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
}

function seqs(events: LogEvent[]): number[] {
  return events.map((candidate) => candidate.seq);
}

describe("EventBuffer", () => {
  it("returns the newest matching events first", () => {
    const buffer = new EventBuffer(100);

    for (let index = 1; index <= 5; index += 1) {
      buffer.append(event({ seq: index, timestampMs: index * 1_000 }));
    }

    const page = buffer.latest(3, MATCH_ALL);

    assert.deepEqual(seqs(page.events), [5, 4, 3]);
    assert.equal(page.hasMore, true);
  });

  it("orders an out-of-order insert by timestamp", () => {
    const buffer = new EventBuffer(100);

    buffer.append(event({ seq: 1, timestampMs: 1_000 }));
    buffer.append(event({ seq: 2, timestampMs: 3_000 }));
    buffer.append(event({ seq: 3, timestampMs: 2_000 }));

    assert.deepEqual(seqs(buffer.latest(10, MATCH_ALL).events), [2, 3, 1]);
  });

  it("breaks timestamp ties by source then append order", () => {
    const buffer = new EventBuffer(100);

    buffer.append(event({ seq: 1, sourceId: "b", sourceSeq: 1, timestampMs: 1_000 }));
    buffer.append(event({ seq: 2, sourceId: "a", sourceSeq: 2, timestampMs: 1_000 }));
    buffer.append(event({ seq: 3, sourceId: "a", sourceSeq: 1, timestampMs: 1_000 }));

    assert.deepEqual(seqs(buffer.latest(10, MATCH_ALL).events), [1, 2, 3]);
  });

  it("pages backwards from a cursor without repeating the cursor event", () => {
    const buffer = new EventBuffer(100);

    for (let index = 1; index <= 10; index += 1) {
      buffer.append(event({ seq: index, timestampMs: index * 1_000 }));
    }

    const first = buffer.latest(4, MATCH_ALL);
    const last = first.events.at(-1);

    assert.ok(last);

    const second = buffer.before(
      { sourceId: last.sourceId, sourceSeq: last.sourceSeq, timestampMs: last.timestampMs },
      4,
      MATCH_ALL,
    );

    assert.deepEqual(seqs(first.events), [10, 9, 8, 7]);
    assert.deepEqual(seqs(second.events), [6, 5, 4, 3]);
    assert.equal(second.hasMore, true);
  });

  it("reports hasMore false once the oldest event is reached", () => {
    const buffer = new EventBuffer(100);

    buffer.append(event({ seq: 1, timestampMs: 1_000 }));
    buffer.append(event({ seq: 2, timestampMs: 2_000 }));

    assert.equal(buffer.latest(5, MATCH_ALL).hasMore, false);
  });

  it("seeks back to a timestamp", () => {
    const buffer = new EventBuffer(100);

    for (let index = 1; index <= 6; index += 1) {
      buffer.append(event({ seq: index, timestampMs: index * 1_000 }));
    }

    const page = buffer.until(4_000, 100, MATCH_ALL);

    assert.deepEqual(seqs(page.events), [6, 5, 4]);
    assert.equal(page.hasMore, false);
  });

  it("evicts the oldest events once capacity is exceeded", () => {
    const buffer = new EventBuffer(100);

    for (let index = 1; index <= 400; index += 1) {
      buffer.append(event({ seq: index, timestampMs: index * 1_000 }));
    }

    assert.ok(buffer.size <= 100, `expected at most 100 events, got ${buffer.size}`);
    assert.equal(buffer.latest(1, MATCH_ALL).events[0].seq, 400);
  });

  it("publishes a new object on update instead of mutating the old one", () => {
    const buffer = new EventBuffer(100);
    const original = event({ seq: 1, timestampMs: 1_000 });
    const stored = buffer.append(original);

    buffer.update(stored, { ...original, raw: `${original.raw}\n\tat Foo`, revision: 1 });

    assert.equal(original.raw, "line-1");
    assert.equal(buffer.latest(1, MATCH_ALL).events[0].raw, "line-1\n\tat Foo");
  });

  it("applies the predicate while scanning", () => {
    const buffer = new EventBuffer(100);

    for (let index = 1; index <= 10; index += 1) {
      buffer.append(
        event({
          level: index % 2 === 0 ? "ERROR" : "INFO",
          seq: index,
          timestampMs: index * 1_000,
        }),
      );
    }

    const onlyErrors = (stored: StoredEvent) => stored.event.level === "ERROR";

    assert.deepEqual(seqs(buffer.latest(3, onlyErrors).events), [10, 8, 6]);
  });
});
