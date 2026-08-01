import type { LogSource } from "@log-aggregator/shared";
import { describe, expect, it } from "vitest";

import { matchesLogFile, matchesLogFileName } from "./fileMatcher.js";

const source: LogSource = {
  id: "source-1",
  name: "DEV/FR/back/share",
  directory: "/logs",
  enabled: true,
  project: "ACCOUNTING-API",
  date: "2026-07-29",
};

describe("fileMatcher", () => {
  it("matches selected project/date serveur and fwk log files", () => {
    expect(
      matchesLogFileName(source, "ACCOUNTING-API-serveur.2026-07-29-0.log"),
    ).toBe(true);
    expect(
      matchesLogFileName(source, "ACCOUNTING-API-fwk.2026-07-29-1.log"),
    ).toBe(true);
  });

  it("rejects files for another project or date", () => {
    expect(
      matchesLogFileName(source, "BILLING-API-serveur.2026-07-29-0.log"),
    ).toBe(false);
    expect(
      matchesLogFileName(source, "ACCOUNTING-API-serveur.2026-07-30-0.log"),
    ).toBe(false);
  });

  it("escapes project names before building the matcher", () => {
    expect(
      matchesLogFileName(
        { project: "APP.API", date: "2026-07-29" },
        "APP.API-serveur.2026-07-29-0.log",
      ),
    ).toBe(true);
    expect(
      matchesLogFileName(
        { project: "APP.API", date: "2026-07-29" },
        "APPXAPI-serveur.2026-07-29-0.log",
      ),
    ).toBe(false);
  });

  it("falls back to any dated serveur/fwk log when source metadata is missing", () => {
    expect(
      matchesLogFileName({}, "ACCOUNTING-API-serveur.2026-07-29-0.log"),
    ).toBe(true);
    expect(matchesLogFileName({}, "ACCOUNTING-API.log")).toBe(false);
  });

  it("matches paths from either Unix or Windows separators", () => {
    expect(
      matchesLogFile(source, "/logs/ACCOUNTING-API-serveur.2026-07-29-0.log"),
    ).toBe(true);
    expect(
      matchesLogFile(
        source,
        String.raw`C:\logs\ACCOUNTING-API-serveur.2026-07-29-0.log`,
      ),
    ).toBe(true);
  });
});
