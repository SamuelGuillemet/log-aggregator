import { createWriteStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { once } from "node:events";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const args = parseArgs(process.argv.slice(2));
const mode = args.mode === "size" ? "size" : "lines";
const outputRoot = path.resolve(repositoryRoot, args.output ?? "sample-logs/perf-cluster");
const shares = ["perf-share-a", "perf-share-b", "perf-share-c"];

await rm(outputRoot, { force: true, recursive: true });

if (mode === "size") {
  await runSizeMode();
} else {
  await runLinesMode();
}

/**
 * Simulates first-time parsing of an already-rotated log: each app gets N "full"
 * rotation files at a fixed size plus one smaller, still-growing last file, all for
 * the same date. Timestamps advance with bytes written (not per file), so the whole
 * set reads as one continuous day once the rotation files are merged by the parser.
 */
async function runSizeMode() {
  const appCount = clampInteger(args.apps, 1, 1, 10_000);
  const dateCount = clampInteger(args.dates, 1, 1, 10);
  const rotations = clampInteger(args.rotations, 3, 1, 20);
  const rotationBytes = clampInteger(args["rotation-mb"], 100, 1, 10_000) * 1_024 * 1_024;
  const lastBytes = clampInteger(args["last-mb"], 25, 1, 10_000) * 1_024 * 1_024;
  const totalBytesPerApp = rotations * rotationBytes + lastBytes;

  const dates = buildDates(dateCount);
  const apps = buildApps(appCount);

  let createdFiles = 0;

  for (const share of shares) {
    const logDirectory = path.join(outputRoot, share);
    await mkdir(logDirectory, { recursive: true });

    for (const date of dates) {
      for (const app of apps) {
        const fileTargets = [
          ...Array.from({ length: rotations }, (_, index) => ({ bytes: rotationBytes, index })),
          { bytes: lastBytes, index: rotations },
        ];

        createdFiles += await writeRotatedApp({
          app,
          date,
          fileTargets,
          logDirectory,
          totalBytesPerApp,
        });
      }
    }
  }

  console.info(`Perf logs generated in ${path.relative(repositoryRoot, outputRoot)} (size mode)`);
  console.info(`Apps: ${appCount}`);
  console.info(`Dates: ${dates.join(", ")}`);
  console.info(
    `Rotations per app per share: ${rotations} x ${(rotationBytes / (1_024 * 1_024)).toFixed(0)}MB + 1 x ${(lastBytes / (1_024 * 1_024)).toFixed(0)}MB`,
  );
  console.info(`Files: ${createdFiles}`);
}

/** Writes one app's rotated file set for one date, timestamps continuous across files. */
async function writeRotatedApp({ app, date, fileTargets, logDirectory, totalBytesPerApp }) {
  const loggerName = `${app.toLowerCase().replaceAll("-", ".")}.Service`;
  let bytesWrittenTotal = 0;
  let lineIndex = 0;

  for (const target of fileTargets) {
    const filePath = path.join(logDirectory, `${app}-serveur.${date}-${target.index}.log`);
    const stream = createWriteStream(filePath);
    let bytesWrittenInFile = 0;

    while (bytesWrittenInFile < target.bytes) {
      const progress = Math.min(bytesWrittenTotal / totalBytesPerApp, 1);
      const timestamp = timestampForProgress(date, progress);
      const entry = buildLogEntry({ app, index: lineIndex, loggerName, timestamp });
      const chunk = `${entry}\n`;
      const chunkBytes = Buffer.byteLength(chunk);

      await writeAsync(stream, chunk);

      bytesWrittenInFile += chunkBytes;
      bytesWrittenTotal += chunkBytes;
      lineIndex += 1;
    }

    stream.end();
    await once(stream, "close");
  }

  return fileTargets.length;
}

async function writeAsync(stream, chunk) {
  if (!stream.write(chunk)) {
    await once(stream, "drain");
  }
}

/** Maps a [0, 1] progress fraction to a timestamp spanning the full day. */
function timestampForProgress(date, progress) {
  const dayStart = Date.parse(`${date}T00:00:00.000Z`);
  const dayDurationMs = 24 * 60 * 60 * 1_000 - 1;
  const timestampMs = dayStart + Math.round(progress * dayDurationMs);

  return `${date} ${new Date(timestampMs).toISOString().slice(11, 23).replace(".", ",")}`;
}

async function runLinesMode() {
  const appCount = clampInteger(args.apps, 100, 1, 10_000);
  const dateCount = clampInteger(args.dates, 4, 1, 10);
  const linesPerFile = clampInteger(args.lines, 25, 1, 20_000);

  const dates = buildDates(dateCount);
  const apps = buildApps(appCount);

  let createdFiles = 0;

  for (const share of shares) {
    const logDirectory = path.join(outputRoot, share);
    await mkdir(logDirectory, { recursive: true });

    for (const date of dates) {
      for (const app of apps) {
        const filePath = path.join(logDirectory, `${app}-serveur.${date}-0.log`);
        const stream = createWriteStream(filePath);

        await writeAsync(stream, buildLogContent(app, date, linesPerFile));
        stream.end();
        await once(stream, "close");
        createdFiles += 1;
      }
    }
  }

  console.info(`Perf logs generated in ${path.relative(repositoryRoot, outputRoot)} (lines mode)`);
  console.info(`Apps: ${appCount}`);
  console.info(`Dates: ${dates.join(", ")}`);
  console.info(`Files: ${createdFiles}`);
}

function parseArgs(rawArgs) {
  const parsed = {};

  for (let index = 0; index < rawArgs.length; index += 1) {
    const token = rawArgs[index];

    if (!token.startsWith("--")) {
      continue;
    }

    const [inlineKey, ...inlineRest] = token.slice(2).split("=");

    if (inlineRest.length > 0) {
      parsed[inlineKey] = inlineRest.join("=");
      continue;
    }

    const key = inlineKey;
    const value = rawArgs[index + 1];

    if (!value || value.startsWith("--")) {
      parsed[key] = "true";
      continue;
    }

    parsed[key] = value;
    index += 1;
  }

  return parsed;
}

function clampInteger(rawValue, fallback, min, max) {
  const value = Number.parseInt(String(rawValue ?? fallback), 10);

  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(Math.max(value, min), max);
}

function buildApps(appCount) {
  return Array.from(
    { length: appCount },
    (_, index) => `APP-${String(index + 1).padStart(3, "0")}`,
  );
}

function buildDates(dateCount) {
  const dates = [];
  const now = new Date();

  for (let index = 0; index < dateCount; index += 1) {
    const date = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - index),
    );

    dates.push(date.toISOString().slice(0, 10));
  }

  return dates;
}

function buildLogContent(app, date, linesPerFile) {
  const loggerName = `${app.toLowerCase().replaceAll("-", ".")}.Service`;

  const lines = Array.from({ length: linesPerFile }, (_, index) => {
    const hour = String((8 + index) % 24).padStart(2, "0");
    const minute = String((index * 3) % 60).padStart(2, "0");
    const second = String((index * 7) % 60).padStart(2, "0");
    const millisecond = String((index * 37) % 1000).padStart(3, "0");
    const timestamp = `${date} ${hour}:${minute}:${second},${millisecond}`;

    return buildLogEntry({ app, index, loggerName, timestamp });
  });

  return `${lines.join("\n")}\n`;
}

function buildLogEntry({ app, index, loggerName, timestamp }) {
  const levels = ["INFO", "DEBUG", "WARN", "ERROR"];
  const level = levels[index % levels.length];
  const requestId = `${app}-REQ-${String(index + 1).padStart(6, "0")}`;
  const sessionId = `${app}-SID-${String((index % 250) + 1).padStart(4, "0")}`;
  const transactionId = `${app}-TX-${timestamp.slice(0, 10).replaceAll("-", "")}-${String(index + 1).padStart(6, "0")}`;
  const message = `${timestamp} ${level} [worker-${(index % 8) + 1}] ${loggerName} - Perf event ${index + 1} requestId=${requestId} sessionId=${sessionId} transactionId=${transactionId}`;

  if (level !== "ERROR") {
    return message;
  }

  return [
    `${message} failure=java.lang.IllegalStateException`,
    `java.lang.IllegalStateException: Failed to process transaction ${transactionId} for ${app}`,
    `\tat com.example.Service.handleRequest(Service.java:${120 + (index % 30)})`,
    `\tat com.example.Service.persist(Service.java:${180 + (index % 25)})`,
    `\tat com.example.Repository.save(Repository.java:${60 + (index % 20)})`,
    `Caused by: java.net.SocketTimeoutException: Read timed out`,
    `\tat java.base/sun.nio.ch.NioSocketImpl.timedRead(NioSocketImpl.java:${270 + (index % 15)})`,
    `\tat java.base/sun.nio.ch.NioSocketImpl.implRead(NioSocketImpl.java:${320 + (index % 15)})`,
  ].join("\n");
}
