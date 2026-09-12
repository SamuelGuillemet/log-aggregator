import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EMPTY_FILTER, type LogEvent, type LogFilter } from "@log-aggregator/shared";
import type { StoredEvent } from "./eventBuffer.js";
import { compileFilter, compileSafeRegex } from "./filter.js";

function stored(raw: string, level: LogEvent["level"] = "INFO"): StoredEvent {
  return {
    event: {
      fields: {},
      filePath: "/logs/app.log",
      level,
      messageOffset: 0,
      raw,
      revision: 0,
      seq: 1,
      sourceId: "a",
      sourceName: "A",
      sourceSeq: 1,
      timestampMs: 0,
      timestampText: "",
    },
    lowerRaw: undefined,
  };
}

function filter(overrides: Partial<LogFilter>): LogFilter {
  return { ...EMPTY_FILTER, ...overrides };
}

describe("compileFilter", () => {
  it("matches everything when the filter is empty", () => {
    const { match } = compileFilter(EMPTY_FILTER);

    assert.equal(match(stored("anything")), true);
  });

  it("filters by level", () => {
    const { match } = compileFilter(filter({ levels: ["ERROR", "FATAL"] }));

    assert.equal(match(stored("boom", "ERROR")), true);
    assert.equal(match(stored("boom", "INFO")), false);
  });

  it("is case insensitive by default and exact when asked", () => {
    assert.equal(compileFilter(filter({ text: "TIMEOUT" })).match(stored("read timeout")), true);
    assert.equal(
      compileFilter(filter({ caseSensitive: true, text: "TIMEOUT" })).match(stored("read timeout")),
      false,
    );
  });

  it("applies any / all / not term sets together", () => {
    const { match } = compileFilter(
      filter({
        excludeAny: ["healthcheck"],
        includeAll: ["order"],
        includeAny: ["failed", "retry"],
      }),
    );

    assert.equal(match(stored("order 42 failed")), true);
    assert.equal(match(stored("order 42 succeeded")), false);
    assert.equal(match(stored("payment failed")), false);
    assert.equal(match(stored("order 42 failed healthcheck")), false);
  });

  it("uses the regex when the pattern is safe", () => {
    const { match, warning } = compileFilter(filter({ regex: true, text: String.raw`user-\d+` }));

    assert.equal(warning, undefined);
    assert.equal(match(stored("logged in user-1234")), true);
    assert.equal(match(stored("logged in user-abc")), false);
  });

  // v1 fed this straight into `new RegExp` and ran it against every event.
  it("refuses catastrophic patterns and reports the fallback", () => {
    const { match, warning } = compileFilter(filter({ regex: true, text: "(a+)+$" }));

    assert.ok(warning?.includes("nested quantifiers"));
    assert.equal(match(stored("literally (a+)+$ here")), true);
  });

  it("reports invalid patterns instead of silently changing behaviour", () => {
    const { warning } = compileFilter(filter({ regex: true, text: "(unclosed" }));

    assert.ok(warning?.includes("not a valid regular expression"));
  });
});

describe("compileSafeRegex", () => {
  it("rejects nested quantifiers", () => {
    for (const pattern of ["(a+)+", "(a*)*", "(\\d+)+$", "((ab)+)+", "(a{2,}){3,}"]) {
      assert.equal(
        compileSafeRegex(pattern, false).ok,
        false,
        `expected ${pattern} to be rejected`,
      );
    }
  });

  it("allows ordinary patterns", () => {
    for (const pattern of ["(abc)+", String.raw`\d{4}-\d{2}`, "^ERROR", "foo|bar", "[a+b]+"]) {
      assert.equal(compileSafeRegex(pattern, false).ok, true, `expected ${pattern} to be allowed`);
    }
  });

  it("rejects oversized patterns", () => {
    assert.equal(compileSafeRegex("a".repeat(1_000), false).ok, false);
  });
});
