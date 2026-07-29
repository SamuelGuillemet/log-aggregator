import type { LogSource } from "@log-aggregator/shared";
import { describe, expect, it } from "vitest";

import type { ParserConfig } from "../config/configLoader.js";
import { DefaultLogParser } from "./DefaultLogParser.js";

const source: LogSource = {
  id: "source-1",
  name: "DEV/FRANCE/back/dev-share",
  directory: "/tmp/dev-share/Java/apache-tomcat-back/logs",
  parser: "default",
  enabled: true,
};

const parserConfig: ParserConfig = {
  name: "default",
  filePattern: "^.+-(serveur|fwk)\\.\\d{4}-\\d{2}-\\d{2}-\\d+\\.log$",
  linePattern:
    "^(?<timestamp>\\d{4}-\\d{2}-\\d{2}[ T]\\d{2}:\\d{2}:\\d{2}(?:[,.]\\d{3})?)\\s+(?<level>TRACE|DEBUG|INFO|WARN|ERROR|FATAL)\\s+(?:\\[(?<thread>[^\\]]+)\\]\\s+)?(?:(?<logger>[\\w.$-]+)\\s+-\\s+)?(?<message>.*)$",
  groups: {
    timestamp: "timestamp",
    level: "level",
    thread: "thread",
    logger: "logger",
    message: "message",
  },
};

describe("DefaultLogParser", () => {
  const parser = new DefaultLogParser(parserConfig);

  it("supports project server and framework log files", () => {
    expect(parser.supports("/logs/BILLING-API-serveur.2026-07-29-0.log")).toBe(
      true,
    );
    expect(parser.supports("/logs/accounting-api-fwk.2026-07-29-3.log")).toBe(
      true,
    );
    expect(parser.supports("/logs/other.log")).toBe(false);
  });

  it("parses normalized log events with correlation fields", () => {
    const result = parser.parseLine(
      "2026-07-29 10:15:30,123 INFO [main] accounting.Service - Created invoice requestId=REQ-42 sessionId=SID-7 transactionId=TX-9",
      { source, filePath: "/logs/ACCOUNTING-API-serveur.2026-07-29-0.log" },
    );

    expect(result.parserFailure).toBe(false);
    expect(result.event).toMatchObject({
      sourceId: source.id,
      sourceName: source.name,
      level: "INFO",
      thread: "main",
      logger: "accounting.Service",
    });
  });

  it("turns malformed lines into warning events", () => {
    const result = parser.parseLine("not a known log format", {
      source,
      filePath: "/logs/ACCOUNTING-API-serveur.2026-07-29-0.log",
    });

    expect(result.parserFailure).toBe(true);
    expect(result.event.level).toBe("WARN");
    expect(result.event.message).toContain("Malformed log line");
  });
});
