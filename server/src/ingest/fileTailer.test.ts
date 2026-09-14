import assert from "node:assert/strict";
import { mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { FileTailer } from "./fileTailer.js";

let directory = "";

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "tailer-"));
});

afterEach(async () => {
  await rm(directory, { force: true, recursive: true });
});

function collector() {
  const lines: string[] = [];

  return { lines, onLine: (line: string) => lines.push(line) };
}

describe("FileTailer", () => {
  it("emits only complete lines and resumes where it stopped", async () => {
    const filePath = join(directory, "app.log");
    const { lines, onLine } = collector();
    const tailer = new FileTailer(filePath, onLine);

    await writeFile(filePath, "first\nsecond\n");
    assert.deepEqual(await tailer.poll(), { lines: 2, restarted: false });
    assert.deepEqual(lines, ["first", "second"]);

    await writeFile(filePath, "first\nsecond\nthird\n");
    assert.deepEqual(await tailer.poll(), { lines: 1, restarted: false });
    assert.deepEqual(lines, ["first", "second", "third"]);

    await tailer.close();
  });

  // v1 parsed a half-written line as a complete event, then appended the rest as a
  // continuation of the previous one.
  it("holds a line that has no newline yet", async () => {
    const filePath = join(directory, "app.log");
    const { lines, onLine } = collector();
    const tailer = new FileTailer(filePath, onLine);

    await writeFile(filePath, "complete\npartial-");
    await tailer.poll();
    assert.deepEqual(lines, ["complete"]);

    await writeFile(filePath, "complete\npartial-tail\n");
    await tailer.poll();
    assert.deepEqual(lines, ["complete", "partial-tail"]);

    await tailer.close();
  });

  // v1 called buffer.toString("utf8") on an arbitrary byte range.
  it("keeps multi-byte characters intact across a chunk boundary", async () => {
    const filePath = join(directory, "app.log");
    const { lines, onLine } = collector();
    const tailer = new FileTailer(filePath, onLine);
    const padding = "a".repeat(65_535);

    await writeFile(filePath, `${padding}é\n`);
    await tailer.poll();

    assert.deepEqual(lines, [`${padding}é`]);
    await tailer.close();
  });

  it("reports a restart when the file is truncated", async () => {
    const filePath = join(directory, "app.log");
    const { lines, onLine } = collector();
    const tailer = new FileTailer(filePath, onLine);

    await writeFile(filePath, "one\ntwo\nthree\n");
    await tailer.poll();

    await writeFile(filePath, "fresh\n");
    assert.deepEqual(await tailer.poll(), { lines: 0, restarted: true });

    await tailer.poll();
    assert.deepEqual(lines, ["one", "two", "three", "fresh"]);

    await tailer.close();
  });

  // v1 only compared sizes, so a rotation to a *larger* file was invisible.
  it("reports a restart when the file is replaced by a larger one", async () => {
    const filePath = join(directory, "app.log");
    const { lines, onLine } = collector();
    const tailer = new FileTailer(filePath, onLine);

    await writeFile(filePath, "old\n");
    await tailer.poll();

    await rename(filePath, join(directory, "app.log.1"));
    await writeFile(filePath, "rotated-one\nrotated-two\nrotated-three\n");
    assert.deepEqual(await tailer.poll(), { lines: 0, restarted: true });

    await tailer.poll();
    assert.deepEqual(lines, ["old", "rotated-one", "rotated-two", "rotated-three"]);

    await tailer.close();
  });

  it("strips carriage returns from CRLF files", async () => {
    const filePath = join(directory, "app.log");
    const { lines, onLine } = collector();
    const tailer = new FileTailer(filePath, onLine);

    await writeFile(filePath, "one\r\ntwo\r\n");
    await tailer.poll();

    assert.deepEqual(lines, ["one", "two"]);
    await tailer.close();
  });

  it("reads a file larger than a single chunk without losing lines", async () => {
    const filePath = join(directory, "app.log");
    const { lines, onLine } = collector();
    const tailer = new FileTailer(filePath, onLine);
    const expected = Array.from({ length: 200_000 }, (_, index) => `line-${index}`);

    await writeFile(filePath, `${expected.join("\n")}\n`);
    assert.deepEqual(await tailer.poll(), { lines: expected.length, restarted: false });
    assert.deepEqual(lines, expected);

    await tailer.close();
  });

  // Regression: close() (e.g. the stream is stopped while priming a large backlog)
  // used to null the handle out from under a still-running poll(), which then threw
  // a raw TypeError instead of just stopping.
  it("does not throw when close() lands while poll() is still reading", async () => {
    const filePath = join(directory, "app.log");
    const { onLine } = collector();
    const tailer = new FileTailer(filePath, onLine);
    const expected = Array.from({ length: 200_000 }, (_, index) => `line-${index}`);

    await writeFile(filePath, `${expected.join("\n")}\n`);

    const polling = tailer.poll();
    await tailer.close();

    await assert.doesNotReject(polling);
  });

  // A huge pre-existing file on a slow network mount must not be read from byte 0:
  // only the tail portion within the cap is backfilled, then live tailing continues.
  it("backfills a file bigger than the cap only from its tail", async () => {
    const filePath = join(directory, "app.log");
    const { lines, onLine } = collector();
    const tailer = new FileTailer(filePath, onLine, { maxBackfillBytes: 14 });

    await writeFile(filePath, "one\ntwo\nthree\nfour\nfive\n");
    await tailer.poll();

    assert.deepEqual(lines, ["four", "five"]);

    await writeFile(filePath, "one\ntwo\nthree\nfour\nfive\nsix\n");
    await tailer.poll();
    assert.deepEqual(lines, ["four", "five", "six"]);

    await tailer.close();
  });

  it("reads a file smaller than the cap from the start", async () => {
    const filePath = join(directory, "app.log");
    const { lines, onLine } = collector();
    const tailer = new FileTailer(filePath, onLine, { maxBackfillBytes: 1_024 });

    await writeFile(filePath, "one\ntwo\n");
    await tailer.poll();

    assert.deepEqual(lines, ["one", "two"]);
    await tailer.close();
  });
});
