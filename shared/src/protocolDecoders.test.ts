import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decodeClientMessage, decodeHistoryQuery, decodeLogFilter } from "./protocolDecoders.js";

describe("decodeClientMessage", () => {
  it("decodes every valid message type", () => {
    for (const type of ["unsubscribe", "pause", "resume", "ping"] as const) {
      const decoded = decodeClientMessage(JSON.stringify({ type }));

      assert.equal(decoded.ok, true);
      assert.deepEqual(decoded.ok && decoded.value, { type });
    }
  });

  it("decodes subscribe and trims the project", () => {
    const decoded = decodeClientMessage(
      JSON.stringify({
        selection: { date: "2026-09-12", project: "  APP-001 ", sourceId: "local" },
        type: "subscribe",
      }),
    );

    assert.equal(decoded.ok, true);
    assert.deepEqual(decoded.ok && decoded.value, {
      selection: { date: "2026-09-12", project: "APP-001", sourceId: "local" },
      type: "subscribe",
    });
  });

  it("fills filter defaults and drops duplicate levels", () => {
    const decoded = decodeClientMessage(
      JSON.stringify({ filter: { levels: ["WARN", "WARN"], text: "boom" }, type: "filter" }),
    );

    assert.equal(decoded.ok, true);
    assert.deepEqual(decoded.ok && decoded.value, {
      filter: {
        caseSensitive: false,
        excludeAny: [],
        includeAll: [],
        includeAny: [],
        levels: ["WARN"],
        regex: false,
        text: "boom",
      },
      type: "filter",
    });
  });

  // v1 crashed the process on each of these: `handlers[type]` was undefined and
  // the resulting rejection was unhandled.
  it("rejects malformed input instead of throwing", () => {
    const malformed = [
      "not json",
      "null",
      "[]",
      '"string"',
      '{"type":"__proto__"}',
      '{"type":"constructor"}',
      '{"type":42}',
      "{}",
      '{"type":"subscribe"}',
      '{"type":"subscribe","selection":{"sourceId":"a","project":"b","date":"nope"}}',
      '{"type":"filter","filter":{"levels":"WARN"}}',
      '{"type":"filter","filter":{"includeAll":{}}}',
    ];

    for (const raw of malformed) {
      const decoded = decodeClientMessage(raw);

      assert.equal(decoded.ok, false, `expected ${raw} to be rejected`);
    }
  });

  it("rejects oversized filter payloads", () => {
    const decoded = decodeClientMessage(
      JSON.stringify({ filter: { text: "x".repeat(2_000) }, type: "filter" }),
    );

    assert.equal(decoded.ok, false);
  });
});

describe("decodeLogFilter", () => {
  it("defaults an empty object to the empty filter", () => {
    const decoded = decodeLogFilter({});

    assert.equal(decoded.ok, true);
    assert.deepEqual(decoded.ok && decoded.value, {
      caseSensitive: false,
      excludeAny: [],
      includeAll: [],
      includeAny: [],
      levels: [],
      regex: false,
      text: "",
    });
  });
});

describe("decodeHistoryQuery", () => {
  it("decodes a cursor page", () => {
    const decoded = decodeHistoryQuery({
      cursor: { sourceId: "a", sourceSeq: 7, timestampMs: 1_000 },
      limit: 50,
      type: "before",
    });

    assert.equal(decoded.ok, true);
  });

  it("rejects limits outside the allowed range", () => {
    for (const limit of [0, -1, 100_000, "50", Number.NaN]) {
      assert.equal(
        decodeHistoryQuery({ limit, timestampMs: 1, type: "until" }).ok,
        false,
        `expected limit ${String(limit)} to be rejected`,
      );
    }
  });

  it("rejects an unknown query type", () => {
    assert.equal(decodeHistoryQuery({ limit: 10, type: "sideways" }).ok, false);
  });
});
