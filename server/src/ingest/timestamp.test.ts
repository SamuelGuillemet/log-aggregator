import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseTimestamp } from "./timestamp.js";

function local(...parts: [number, number, number, number, number, number, number]): number {
  return new Date(...parts).getTime();
}

describe("parseTimestamp", () => {
  it("accepts both the space and T separators", () => {
    const expected = local(2026, 8, 12, 23, 4, 1, 0);

    assert.equal(parseTimestamp("2026-09-12 23:04:01"), expected);
    assert.equal(parseTimestamp("2026-09-12T23:04:01"), expected);
  });

  it("accepts comma and dot fractional seconds", () => {
    const expected = local(2026, 8, 12, 23, 4, 1, 123);

    assert.equal(parseTimestamp("2026-09-12 23:04:01,123"), expected);
    assert.equal(parseTimestamp("2026-09-12T23:04:01.123"), expected);
  });

  it("truncates sub-millisecond precision instead of misreading it", () => {
    assert.equal(parseTimestamp("2026-09-12T23:04:01.123456"), local(2026, 8, 12, 23, 4, 1, 123));
    assert.equal(parseTimestamp("2026-09-12T23:04:01.1"), local(2026, 8, 12, 23, 4, 1, 100));
  });

  it("honours explicit UTC and numeric offsets", () => {
    const utc = Date.UTC(2026, 8, 12, 23, 4, 1, 0);

    assert.equal(parseTimestamp("2026-09-12T23:04:01Z"), utc);
    assert.equal(parseTimestamp("2026-09-12T23:04:01+00:00"), utc);
    assert.equal(parseTimestamp("2026-09-12T23:04:01+02:00"), utc - 7_200_000);
    assert.equal(parseTimestamp("2026-09-12T23:04:01-0330"), utc + 12_600_000);
  });

  it("returns undefined for anything it does not understand", () => {
    for (const value of [
      "",
      "not a date",
      "2026-09-12",
      "12/09/2026 23:04:01",
      "2026-09-12T23:04",
    ]) {
      assert.equal(parseTimestamp(value), undefined, `expected ${value} to be rejected`);
    }
  });
});
