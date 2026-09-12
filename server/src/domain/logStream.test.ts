import assert from "node:assert/strict";
import { appendFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { LogEvent } from "@log-aggregator/shared";
import { logEventMessage } from "@log-aggregator/shared";
import type { ParserConfig } from "../config/types.js";
import { FileNameMatcher } from "../ingest/fileNameMatcher.js";
import { LogParser } from "../ingest/parser.js";
import { MATCH_ALL } from "./eventBuffer.js";
import { LogStream } from "./logStream.js";

const PARSER_CONFIG: ParserConfig = {
  groups: { level: "level", message: "message", timestamp: "timestamp" },
  linePattern: String.raw`^(?<timestamp>\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:[,.]\d{3})?) (?<level>TRACE|DEBUG|INFO|WARN|ERROR|FATAL) (?<message>.*)$`,
  logFileName: String.raw`^{project}-(?<kind>serveur|fwk)\.{date}-\d+\.log$`,
};
const SELECTION = { date: "2026-01-02", project: "APP-1", sourceId: "local" };

let directory = "";

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "log-stream-"));
});

afterEach(async () => {
  await rm(directory, { force: true, recursive: true });
});

function filePath(index = 0): string {
  return join(directory, `APP-1-serveur.2026-01-02-${index}.log`);
}

function line(index: number, level = "INFO"): string {
  return `2026-01-02 10:00:${String(index % 60).padStart(2, "0")},000 ${level} entry ${index}`;
}

interface Harness {
  stream: LogStream;
  batches: LogEvent[][];
  waitForReset: () => Promise<void>;
  waitForBatch: () => Promise<LogEvent[]>;
  stop: () => Promise<void>;
}

function createHarness(): Harness {
  const stream = new LogStream({
    capacity: 10_000,
    matcher: new FileNameMatcher(PARSER_CONFIG.logFileName),
    parser: new LogParser(PARSER_CONFIG),
    pollIntervalMs: 20,
    selection: SELECTION,
    sources: [{ directory, id: "local", name: "Local" }],
  });
  const batches: LogEvent[][] = [];
  let resolveReset: (() => void) | undefined;
  let resolveBatch: ((events: LogEvent[]) => void) | undefined;

  stream.subscribe({
    onBatch: (stored) => {
      const events = stored.map((entry) => entry.event);
      batches.push(events);
      resolveBatch?.(events);
      resolveBatch = undefined;
    },
    onError: () => undefined,
    onReset: () => {
      resolveReset?.();
      resolveReset = undefined;
    },
  });

  return {
    batches,
    stop: () => stream.stop(),
    stream,
    waitForBatch: () =>
      withTimeout(
        new Promise<LogEvent[]>((resolve) => {
          resolveBatch = resolve;
        }),
        "batch",
      ),
    waitForReset: () =>
      withTimeout(
        new Promise<void>((resolve) => {
          resolveReset = resolve;
        }),
        "reset",
      ),
  };
}

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`timed out waiting for ${label}`)), 5_000).unref(),
    ),
  ]);
}

describe("LogStream", () => {
  it("primes from the existing file without emitting a live batch", async () => {
    await writeFile(filePath(), `${line(1)}\n${line(2)}\n`);

    const harness = createHarness();
    const ready = harness.waitForReset();

    harness.stream.start();
    await ready;

    assert.equal(harness.stream.buffer.size, 2);
    assert.deepEqual(harness.batches, []);

    await harness.stop();
  });

  // Regression: an earlier batching guard keyed on the tick alone, so only the first
  // event of each file per tick ever reached the client.
  it("delivers every appended line in the live batch", async () => {
    await writeFile(filePath(), `${line(0)}\n`);

    const harness = createHarness();
    const ready = harness.waitForReset();

    harness.stream.start();
    await ready;

    const appended = Array.from({ length: 25 }, (_, index) => line(index + 1));
    const batch = harness.waitForBatch();
    await appendFile(filePath(), `${appended.join("\n")}\n`);

    const events = await batch;

    assert.equal(events.length, appended.length);
    assert.deepEqual(
      events.map((event) => logEventMessage(event)),
      appended.map((entry) => entry.slice(entry.indexOf("entry "))),
    );

    await harness.stop();
  });

  it("collapses a multi-line entry into one batch slot at its final revision", async () => {
    await writeFile(filePath(), `${line(0)}\n`);

    const harness = createHarness();
    const ready = harness.waitForReset();

    harness.stream.start();
    await ready;

    const batch = harness.waitForBatch();
    await appendFile(
      filePath(),
      `${line(1, "ERROR")}\n\tat Foo.bar(Foo.java:1)\n\tat Baz.qux(Baz.java:2)\n`,
    );

    const events = await batch;

    assert.equal(events.length, 1);
    assert.equal(events[0].revision, 2);
    assert.equal(
      logEventMessage(events[0]),
      "entry 1\n\tat Foo.bar(Foo.java:1)\n\tat Baz.qux(Baz.java:2)",
    );

    await harness.stop();
  });

  it("picks up a file created after the stream started", async () => {
    await writeFile(filePath(0), `${line(0)}\n`);

    const harness = createHarness();
    const ready = harness.waitForReset();

    harness.stream.start();
    await ready;

    const batch = harness.waitForBatch();
    await writeFile(filePath(1), `${line(5)}\n${line(6)}\n`);

    assert.equal((await batch).length, 2);

    await harness.stop();
  });

  it("ignores files belonging to another application or date", async () => {
    await writeFile(filePath(), `${line(1)}\n`);
    await writeFile(join(directory, "APP-2-serveur.2026-01-02-0.log"), `${line(2)}\n`);
    await writeFile(join(directory, "APP-1-serveur.2026-01-03-0.log"), `${line(3)}\n`);
    await writeFile(join(directory, "notes.txt"), `${line(4)}\n`);

    const harness = createHarness();
    const ready = harness.waitForReset();

    harness.stream.start();
    await ready;

    assert.equal(harness.stream.buffer.size, 1);

    await harness.stop();
  });

  it("rebuilds the buffer when a watched file is rotated", async () => {
    await writeFile(filePath(), `${line(1)}\n${line(2)}\n${line(3)}\n`);

    const harness = createHarness();
    const firstReady = harness.waitForReset();

    harness.stream.start();
    await firstReady;
    assert.equal(harness.stream.buffer.size, 3);

    const secondReady = harness.waitForReset();
    await writeFile(filePath(), `${line(9)}\n`);
    await secondReady;

    assert.equal(harness.stream.buffer.size, 1);
    assert.equal(harness.stream.buffer.latest(1, MATCH_ALL).events[0].raw, line(9));

    await harness.stop();
  });
});
