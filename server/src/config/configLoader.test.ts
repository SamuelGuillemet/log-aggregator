import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadEnvironmentMatrix, loadParserConfig } from "./configLoader.js";

let tempDirectory: string;

beforeEach(async () => {
  tempDirectory = await mkdtemp(path.join(os.tmpdir(), "log-aggregator-"));
});

afterEach(async () => {
  await rm(tempDirectory, { recursive: true, force: true });
});

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
        "2026-07-29 10:15:30 INFO [main] app.Logger - ok",
      ),
    ).toBe(true);
  });

  it("rejects parser configs without required groups", async () => {
    const parserPath = path.join(tempDirectory, "parser.json");

    await writeFile(
      parserPath,
      JSON.stringify({
        linePattern: "(?<message>.*)",
        groups: { message: "message" },
      }),
      "utf8",
    );

    expect(() => loadParserConfig(parserPath)).toThrow(
      "parser.groups.timestamp",
    );
  });

  it("rejects matrix entries without shares", async () => {
    const matrixPath = path.join(tempDirectory, "matrix.json");

    await writeFile(
      matrixPath,
      JSON.stringify([
        {
          environment: "DEV",
          country: "FRANCE",
          code: "DEV_FR",
          host: "DEVHOST01",
          shares: [],
        },
      ]),
      "utf8",
    );

    expect(() => loadEnvironmentMatrix(matrixPath)).toThrow("entry 0.shares");
  });
});
