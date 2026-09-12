import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ParserConfig } from "../config/types.js";
import { FileNameMatcher } from "./fileNameMatcher.js";
import { LogParser } from "./parser.js";

const config: ParserConfig = {
  groups: {
    level: "level",
    logger: "logger",
    message: "message",
    thread: "thread",
    timestamp: "timestamp",
  },
  linePattern: String.raw`^(?<timestamp>\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:[,.]\d{3})?)\s+(?<level>TRACE|DEBUG|INFO|WARN|ERROR|FATAL)\s+(?:\[(?<thread>[^\]]+)\]\s+)?(?:(?<logger>[\w.$-]+)\s+-\s+)?(?<message>.*)$`,
  logFileName: String.raw`^{project}-(?<kind>serveur|fwk|ui|batch)\.{date}-\d+\.log$`,
};

describe("LogParser", () => {
  const parser = new LogParser(config);

  it("extracts the level, fields and message offset", () => {
    const line = "2026-09-12 23:04:01,123 ERROR [main] com.acme.Boom - it broke";
    const parsed = parser.parse(line);

    assert.ok(parsed);
    assert.equal(parsed.level, "ERROR");
    assert.equal(parsed.timestampText, "2026-09-12 23:04:01,123");
    assert.deepEqual(parsed.fields, { logger: "com.acme.Boom", thread: "main" });
    assert.equal(line.slice(parsed.messageOffset), "it broke");
  });

  it("returns undefined for a line that is not an event", () => {
    assert.equal(parser.parse("\tat com.acme.Boom.explode(Boom.java:42)"), undefined);
    assert.equal(parser.parse(""), undefined);
  });

  it("derives the table schema from the configured groups, in config order", () => {
    const ids = parser.schema().columns.map((column) => column.id);

    assert.deepEqual(ids, ["timestamp", "sourceName", "level", "logger", "thread", "message"]);
  });

  it("omits optional groups that did not capture", () => {
    const parsed = parser.parse("2026-09-12T23:04:01 INFO started");

    assert.ok(parsed);
    assert.deepEqual(parsed.fields, {});
  });
});

describe("FileNameMatcher", () => {
  const matcher = new FileNameMatcher(config.logFileName);

  it("matches a file for the selected application and date", () => {
    assert.deepEqual(matcher.matches("APP-001-serveur.2026-09-12-0.log", "APP-001", "2026-09-12"), {
      kind: "serveur",
      project: "APP-001",
    });
  });

  it("rejects another application, kind or date", () => {
    assert.equal(
      matcher.matches("APP-002-serveur.2026-09-12-0.log", "APP-001", "2026-09-12"),
      undefined,
    );
    assert.equal(
      matcher.matches("APP-001-other.2026-09-12-0.log", "APP-001", "2026-09-12"),
      undefined,
    );
    assert.equal(
      matcher.matches("APP-001-serveur.2026-09-11-0.log", "APP-001", "2026-09-12"),
      undefined,
    );
  });

  it("escapes regex metacharacters in the application name", () => {
    assert.equal(matcher.matches("AxB-serveur.2026-09-12-0.log", "A.B", "2026-09-12"), undefined);
    assert.ok(matcher.matches("A.B-serveur.2026-09-12-0.log", "A.B", "2026-09-12"));
  });

  it("discovers application names for autocomplete", () => {
    assert.deepEqual(matcher.discover("APP-001-batch.2026-09-12-3.log"), {
      kind: "batch",
      project: "APP-001",
    });
    assert.equal(matcher.discover("notes.txt"), undefined);
  });

  it("refuses a template without both placeholders", () => {
    assert.throws(() => new FileNameMatcher("^{project}.log$"));
  });
});
