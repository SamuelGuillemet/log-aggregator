import { appendFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { TailReader } from "./TailReader.js";

let tempDirectory: string;

beforeEach(async () => {
  tempDirectory = await mkdtemp(path.join(os.tmpdir(), "log-aggregator-"));
});

afterEach(async () => {
  await rm(tempDirectory, { recursive: true, force: true });
});

describe("TailReader", () => {
  it("reads only appended lines after the first read", async () => {
    const logPath = path.join(
      tempDirectory,
      "ACCOUNTING-API-serveur.2026-07-29-0.log",
    );
    const reader = new TailReader();

    await writeFile(logPath, "line one\n", "utf8");
    expect(await reader.readAppendedLines(logPath)).toEqual(["line one"]);

    await appendFile(logPath, "line two\nline three\n", "utf8");
    expect(await reader.readAppendedLines(logPath)).toEqual([
      "line two",
      "line three",
    ]);
  });

  it("recovers from truncation by reading from the beginning", async () => {
    const logPath = path.join(
      tempDirectory,
      "ACCOUNTING-API-fwk.2026-07-29-0.log",
    );
    const reader = new TailReader();

    await writeFile(logPath, "before rotation\n", "utf8");
    expect(await reader.readAppendedLines(logPath)).toEqual([
      "before rotation",
    ]);

    await writeFile(logPath, "after rotation\n", "utf8");
    expect(await reader.readAppendedLines(logPath)).toEqual(["after rotation"]);
  });

  it("can reset positions and read a selected file from the beginning again", async () => {
    const logPath = path.join(
      tempDirectory,
      "ACCOUNTING-API-serveur.2026-07-29-0.log",
    );
    const reader = new TailReader();

    await writeFile(logPath, "line one\n", "utf8");
    expect(await reader.readAppendedLines(logPath)).toEqual(["line one"]);
    expect(await reader.readAppendedLines(logPath)).toEqual([]);

    reader.reset();
    expect(await reader.readAppendedLines(logPath)).toEqual(["line one"]);
  });
});
