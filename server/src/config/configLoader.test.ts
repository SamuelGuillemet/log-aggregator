import path from "node:path";

import { describe, expect, it } from "vitest";

import { loadEnvironmentMatrix, loadParserConfig } from "./configLoader.js";

describe("configLoader", () => {
  it("loads the default matrix JSON and resolves relative shares", () => {
    const matrix = loadEnvironmentMatrix();
    const localEntry = matrix.find(
      (entry) => entry.environment === "LOCAL" && entry.country === "SAMPLE",
    );

    expect(localEntry?.shares[0]).toBe(
      path.resolve("..", "sample-logs/local-share-a"),
    );
  });

  it("loads the default parser JSON", () => {
    const config = loadParserConfig();

    expect(config.groups.timestamp).toBe("timestamp");
    expect(
      new RegExp(config.linePattern).test(
        "2026-07-29 10:15:30|INFO|REQ-42|ACCOUNTING-API|app.Logger|ok",
      ),
    ).toBe(true);
  });
});
