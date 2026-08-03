import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const args = parseArgs(process.argv.slice(2));
const intervalSeconds = clampInteger(args.interval, 2, 1, 3_600);
const appCount = clampInteger(args.apps, 100, 1, 10_000);
const outputRoot = path.resolve(
  repositoryRoot,
  args.output ?? "sample-logs/perf-cluster",
);
const date = args.date ?? todayUtcDate();

const shares = ["perf-share-a", "perf-share-b", "perf-share-c"];
const tiers = ["back"];
const apps = buildApps(appCount);
const levelCycle = ["INFO", "DEBUG", "WARN", "ERROR"];
const tickByApp = new Map();

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
  }
}

console.info(
  `Live perf logs started: apps=${appCount}, interval=${intervalSeconds}s, date=${date}`,
);
console.info(`Target root: ${path.relative(repositoryRoot, outputRoot)}`);
console.info("Press Ctrl+C to stop.");

let stopped = false;
let running = false;

const timer = setInterval(() => {
  void writeTick();
}, intervalSeconds * 1_000);

void writeTick();

process.on("SIGINT", stop);
process.on("SIGTERM", stop);

async function writeTick() {
  if (stopped || running) {
    return;
  }

  running = true;

  try {
    const now = new Date();
    now.setDate(now.getDate() + 1); // Add 1 day to simulate future logs

    for (const share of shares) {
      for (const tier of tiers) {
        const logDirectory = path.join(
          outputRoot,
          share,
          "Java",
          `apache-tomcat-${tier}`,
          "logs",
        );

        for (const app of apps) {
          const nextTick = (tickByApp.get(app) ?? 0) + 1;
          tickByApp.set(app, nextTick);

          const filePath = path.join(
            logDirectory,
            `${app}-serveur.${date}-0.log`,
          );
          const line = buildLogLine(app, tier, now, nextTick, levelCycle);
          await appendFile(filePath, `${line}\n`, "utf8");
        }
      }
    }
  } catch (error) {
    console.error("Failed to append live logs", error);
  } finally {
    running = false;
  }
}

function stop() {
  if (stopped) {
    return;
  }

  stopped = true;
  clearInterval(timer);
  console.info("Live perf logs stopped.");
  process.exit(0);
}

function buildLogLine(app, tier, now, tick, levels) {
  const datePart = now.toISOString().slice(0, 10);
  const timePart = now.toISOString().slice(11, 23).replace(".", ",");
  const level = levels[tick % levels.length];
  const loggerName = `${app.toLowerCase().replace(/-/g, ".")}.${tier}.Service`;
  const requestId = `${app}-REQ-LIVE-${String(tick).padStart(6, "0")}`;
  const sessionId = `${app}-SID-LIVE-${String((tick % 500) + 1).padStart(4, "0")}`;
  const transactionId = `${app}-TX-LIVE-${datePart.replaceAll("-", "")}-${String(tick).padStart(6, "0")}`;

  return `${datePart} ${timePart} ${level} [worker-${(tick % 8) + 1}] ${loggerName} - Live perf event ${tick} requestId=${requestId} sessionId=${sessionId} transactionId=${transactionId}`;
}

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
  return Array.from(
    { length: appCount },
    (_, index) => `APP-${String(index + 1).padStart(3, "0")}`,
  );
}

function todayUtcDate() {
  return new Date().toISOString().slice(0, 10);
}
