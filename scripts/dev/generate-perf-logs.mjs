import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const args = parseArgs(process.argv.slice(2));
const appCount = clampInteger(args.apps, 100, 1, 10_000);
const dateCount = clampInteger(args.dates, 4, 1, 10);
const linesPerFile = clampInteger(args.lines, 25, 1, 20_000);
const outputRoot = path.resolve(
  repositoryRoot,
  args.output ?? "sample-logs/perf-cluster",
);

const shares = ["perf-share-a", "perf-share-b", "perf-share-c"];
const tiers = ["back"];
const dates = buildDates(dateCount);
const apps = buildApps(appCount);

await rm(outputRoot, { force: true, recursive: true });

let createdFiles = 0;

for (const share of shares) {
  for (const tier of tiers) {
    const logDirectory = path.join(
      outputRoot,
      share,
      "Java",
      `apache-tomcat-${tier}`,
      "logs",
    );
    await mkdir(logDirectory, { recursive: true });

    for (const date of dates) {
      for (const app of apps) {
        const filePath = path.join(logDirectory, `${app}-serveur.${date}-0.log`);
        await writeFile(filePath, buildLogContent(app, date, linesPerFile, tier));
        createdFiles += 1;
      }
    }
  }
}

console.info(`Perf logs generated in ${path.relative(repositoryRoot, outputRoot)}`);
console.info(`Apps: ${appCount}`);
console.info(`Dates: ${dates.join(", ")}`);
console.info(`Files: ${createdFiles}`);

function parseArgs(rawArgs) {
  const parsed = {};

  for (let index = 0; index < rawArgs.length; index += 1) {
    const token = rawArgs[index];

    if (!token.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
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
  return Array.from({ length: appCount }, (_, index) =>
    `APP-${String(index + 1).padStart(3, "0")}`,
  );
}

function buildDates(dateCount) {
  const dates = [];
  const now = new Date();

  for (let index = 0; index < dateCount; index += 1) {
    const date = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - index,
    ));

    dates.push(date.toISOString().slice(0, 10));
  }

  return dates;
}

function buildLogContent(app, date, linesPerFile, tier) {
  const levels = ["INFO", "DEBUG", "WARN", "ERROR"];
  const loggerName = `${app.toLowerCase().replaceAll("-", ".")}.${tier}.Service`;

  const lines = Array.from({ length: linesPerFile }, (_, index) => {
    const hour = String((8 + index) % 24).padStart(2, "0");
    const minute = String((index * 3) % 60).padStart(2, "0");
    const second = String((index * 7) % 60).padStart(2, "0");
    const millisecond = String((index * 37) % 1000).padStart(3, "0");
    const level = levels[index % levels.length];
    const requestId = `${app}-REQ-${String(index + 1).padStart(4, "0")}`;
    const sessionId = `${app}-SID-${String((index % 250) + 1).padStart(4, "0")}`;
    const transactionId = `${app}-TX-${date.replaceAll("-", "")}-${String(index + 1).padStart(4, "0")}`;
    const timestamp = `${date} ${hour}:${minute}:${second},${millisecond}`;

    return buildLogEntry({
      app,
      index,
      level,
      loggerName,
      requestId,
      sessionId,
      tier,
      timestamp,
      transactionId,
    });
  });

  return `${lines.join("\n")}\n`;
}

function buildLogEntry({
  app,
  index,
  level,
  loggerName,
  requestId,
  sessionId,
  tier,
  timestamp,
  transactionId,
}) {
  const message = `${timestamp} ${level} [worker-${(index % 8) + 1}] ${loggerName} - Perf event ${index + 1} requestId=${requestId} sessionId=${sessionId} transactionId=${transactionId}`;

  if (level !== "ERROR") {
    return message;
  }

  return [
    `${message} failure=java.lang.IllegalStateException`,
    `java.lang.IllegalStateException: Failed to process transaction ${transactionId} for ${app}`,
    `\tat com.example.${tier}.Service.handleRequest(Service.java:${120 + (index % 30)})`,
    `\tat com.example.${tier}.Service.persist(Service.java:${180 + (index % 25)})`,
    `\tat com.example.${tier}.Repository.save(Repository.java:${60 + (index % 20)})`,
    `Caused by: java.net.SocketTimeoutException: Read timed out`,
    `\tat java.base/sun.nio.ch.NioSocketImpl.timedRead(NioSocketImpl.java:${270 + (index % 15)})`,
    `\tat java.base/sun.nio.ch.NioSocketImpl.implRead(NioSocketImpl.java:${320 + (index % 15)})`,
  ].join("\n");
}
