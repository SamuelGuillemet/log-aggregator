import type { LogSource } from "@log-aggregator/shared";
import { describe, expect, it } from "vitest";

import type { ParserConfig } from "../config/configLoader.js";
import { Parser } from "./Parser.js";

const source: LogSource = {
  id: "source-1",
  name: "DEV/FRANCE/back/dev-share",
  directory: "/tmp/dev-share/Java/apache-tomcat-back/logs",
  enabled: true,
};

const parserConfig: ParserConfig = {
  linePattern:
    "^(?<timestamp>\\d{4}-\\d{2}-\\d{2}[ T]\\d{2}:\\d{2}:\\d{2}(?:[,.]\\d{3})?)\\|(?<level>TRACE|DEBUG|INFO|WARN|ERROR|FATAL)\\|(?<requestId>[^|]*)\\|(?<application>[^|]*)\\|(?<logger>[^|]*)\\|(?<message>.*)$",
  groups: {
    timestamp: "timestamp",
    level: "level",
    requestId: "requestId",
    application: "application",
    logger: "logger",
    message: "message",
  },
};

describe("Parser", () => {
  const parser = new Parser(parserConfig);

  it("parses log events without shifting local log time", () => {
    const event = parser.parseLine(
      "2026-07-29 10:15:30,123|INFO|REQ-42|ACCOUNTING-API|accounting.Service|Created invoice",
      { source, filePath: "/logs/ACCOUNTING-API-serveur.2026-07-29-0.log" },
    );

    expect(event).toMatchObject({
      sourceId: source.id,
      sourceName: source.name,
      timestamp: "2026-07-29T10:15:30.123",
      level: "INFO",
      requestId: "REQ-42",
      application: "ACCOUNTING-API",
      logger: "accounting.Service",
      message: "Created invoice",
    });
  });

  it("creates parser columns from configured non-base groups", () => {
    expect(parser.getFieldGroups()[0]?.fields).toMatchObject([
      { id: "requestId", label: "Request ID", field: "requestId" },
      { id: "application", label: "Application", field: "application" },
      { id: "logger", label: "Logger", field: "logger" },
    ]);
  });

  it("returns no event for lines without timestamps", () => {
    const event = parser.parseLine("\tat stack trace line", {
      source,
      filePath: "/logs/ACCOUNTING-API-serveur.2026-07-29-0.log",
    });

    expect(event).toBeUndefined();
  });
});
