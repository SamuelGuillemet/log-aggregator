// Throwaway: profiles the cold first-time parse of a real selection (no server, no
// network), and optionally a live-tail phase after it. Run with:
//   node --cpu-prof --cpu-prof-dir=profiles --import tsx scripts/flamegraph.ts \
//     [sourceId] [project] [date] [liveMs]
// Pair the liveMs option with `pnpm perf:logs:live -- --date <date>` running in
// another terminal to profile incremental polling on a file that keeps growing.
// Then open the .cpuprofile written to server/profiles/ in https://www.speedscope.app
import { loadConfig, readRuntimeOptions } from "../src/config/load.js";
import { LogStream } from "../src/domain/logStream.js";
import { resolveSources } from "../src/domain/sourceResolver.js";
import { FileNameMatcher } from "../src/ingest/fileNameMatcher.js";
import { LogParser } from "../src/ingest/parser.js";

const sourceId = process.argv[2] ?? "local-performance";
const project = process.argv[3] ?? "APP-001";
const date = process.argv[4] ?? new Date().toISOString().slice(0, 10);
const liveMs = Number.parseInt(process.argv[5] ?? "0", 10) || 0;

const runtime = readRuntimeOptions();
const config = await loadConfig();
const matcher = new FileNameMatcher(config.parser.logFileName);
const parser = new LogParser(config.parser);
const selection = { date, project, sourceId };
const sources = resolveSources(selection, config.sources);

if (sources.length === 0) {
  console.error(`No directories configured for source "${sourceId}"`);
  process.exit(1);
}

const stream = new LogStream({
  capacity: runtime.maxEventsPerStream,
  matcher,
  parser,
  pollIntervalMs: runtime.pollIntervalMs,
  selection,
  sources,
});

const started = process.hrtime.bigint();

// LogStream unref()s its poll timer (fine in the real server, which has the HTTP
// listener to stay alive on) so this script needs its own handle keeping the event
// loop open until priming (and, if requested, the live phase) finishes.
const keepAlive = setInterval(() => {}, 1_000);

let liveBatches = 0;
let liveEvents = 0;

// Kept subscribed past priming on purpose: unsubscribing in onReset would drop every
// batch the live phase is supposed to be counting.
const unsubscribe = stream.subscribe({
  onBatch: (events) => {
    liveBatches += 1;
    liveEvents += events.length;
  },
  onError: (message) => {
    throw new Error(message);
  },
  onReset: () => {},
});

await new Promise<void>((resolve) => {
  const unsubscribeReset = stream.subscribe({
    onBatch: () => {},
    onError: () => {},
    onReset: () => {
      unsubscribeReset();
      resolve();
    },
  });
  stream.start();
});

const primedMs = Number(process.hrtime.bigint() - started) / 1_000_000;

console.log(`selection: ${sourceId}/${project}/${date}`);
console.log(
  `first load primed ${stream.buffer.size.toLocaleString()} events in ${primedMs.toFixed(1)} ms`,
);

if (liveMs > 0) {
  const liveStarted = process.hrtime.bigint();

  await new Promise((resolve) => setTimeout(resolve, liveMs));

  const liveElapsedMs = Number(process.hrtime.bigint() - liveStarted) / 1_000_000;

  console.log(
    `live phase: ${liveBatches.toLocaleString()} batches, ${liveEvents.toLocaleString()} events over ${liveElapsedMs.toFixed(1)} ms (buffer size ${stream.buffer.size.toLocaleString()})`,
  );
}

unsubscribe();
await stream.stop();
clearInterval(keepAlive);
process.exit(0);
