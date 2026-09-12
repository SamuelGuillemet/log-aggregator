# Log Aggregator v2 — Refactor Plan

Status: **delivered and verified end to end.** `shared-v2`, `server-v2` and `client-v2`
are complete, typechecked, linted, tested and exercised against `sample-logs`. The v1
packages are untouched and still runnable; deleting them is a separate, explicit step.

Run it: `pnpm dev:v2` (server on `127.0.0.1:3000`, client on `127.0.0.1:5174`).
Test it: `pnpm test` (55 tests: 46 in `server-v2`, 9 in `shared-v2`).
Package it: `pnpm package:v2` (self-verifying; see §8).

---

## 1. Why a rewrite

The v1 audit surfaced defects that are not patchable in place because they follow from
architecture, not from local mistakes:

| #   | Defect                                                                                 | Root cause                                                                                                                 |
| --- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 1   | One `LogAggregatorService` per WebSocket: N tabs = N watchers, N disk reads, N buffers | Ingestion and per-client querying are the same object                                                                      |
| 2   | Unbounded memory, guaranteed OOM                                                       | No capacity policy anywhere; `message` + `rawMessage` stored twice; `randomUUID()` per line                                |
| 3   | Short reads ignored → silent data loss and zero-filled garbage                         | `fileHandle.read()` return value discarded, position advanced to `stat.size` regardless                                    |
| 4   | Partial trailing lines parsed as complete events                                       | No carry buffer between reads                                                                                              |
| 5   | UTF-8 corruption at chunk boundaries                                                   | `buffer.toString("utf8")` on an arbitrary byte range                                                                       |
| 6   | Log rotation undetected                                                                | Truncation inferred from size only, no inode check                                                                         |
| 7   | ≥1s added latency on every live update, starvation under constant writes               | `awaitWriteFinish.stabilityThreshold: 1000` on continuously-appended files                                                 |
| 8   | Files created after subscribe are never read                                           | Watcher is seeded from a one-shot `readdir`, `ignoreInitial: true`, no `add` handler                                       |
| 9   | Empty directory at subscribe → permanently dead session                                | `startWatcher` early-returns and is never retried                                                                          |
| 10  | O(N) filter + O(N log N) re-sort + O(N) cursor scan per query                          | Flat array, `Date.parse` inside the sort comparator, cursor located by `findIndex` on `id`                                 |
| 11  | Two string allocations per event per filter evaluation                                 | `buildFullText()` then `.toLowerCase()` on the join                                                                        |
| 12  | Remote unauthenticated process kill                                                    | `JSON.parse(...) as ClientMessage`; unknown `type` → `handlers[type]` is `undefined` → `undefined()` → unhandled rejection |
| 13  | Any website can read your logs                                                         | No `Origin` check on upgrade, `access-control-allow-origin: *`                                                             |
| 14  | ReDoS pins the event loop                                                              | User regex compiled and run server-side with no guard                                                                      |
| 15  | Unbounded request body                                                                 | `readJsonBody` buffers without a cap                                                                                       |
| 16  | Server OOM on a slow/backgrounded client                                               | No `bufferedAmount` backpressure check                                                                                     |
| 17  | Leaked service + watcher per half-open socket                                          | No server-side heartbeat                                                                                                   |
| 18  | Continuation lost on the pagination path                                               | Events mutated in place via `Object.assign` while queued and already sent; `mergeEvents` drops duplicate ids               |
| 19  | Main-thread jank: full `Map` rebuild + full sort 10×/s                                 | `mergeLiveEvents` reprocesses the entire client array per batch                                                            |
| 20  | `PROTOCOL_VERSION` hand-copied into `server/src/config.ts`                             | Packaging problem worked around by duplication                                                                             |

Everything above is addressed below. Items kept from v1 are listed in §9.

---

## 2. Target architecture

```
                      ┌────────────────────────────┐
                      │  client-v2 (React 19)      │
                      │  bounded window · no resort│
                      └──────────┬─────────────────┘
                        WS /ws   │   POST /api/logs
                      ┌──────────▼─────────────────┐
                      │  transport                 │
                      │  origin allowlist          │
                      │  decoded messages          │
                      │  backpressure · heartbeat  │
                      └──────────┬─────────────────┘
                                 │  Session = { filter, cursor }
                      ┌──────────▼─────────────────┐
                      │  LogStreamRegistry         │
                      │  key: sourceId|project|date│
                      │  refcounted, deduplicated  │
                      └──────────┬─────────────────┘
                      ┌──────────▼─────────────────┐
                      │  LogStream                 │
                      │  DirectoryWatcher          │
                      │  FileTailer (per file)     │
                      │  LogParser                 │
                      │  EventBuffer (bounded)     │
                      └────────────────────────────┘
```

**The central change:** a session no longer owns an engine. A session is a _view_ —
a filter plus a cursor — over a `LogStream` that is shared by every session watching
the same `(sourceId, project, date)` triple. Ten tabs on the same application cost
one watcher, one parse pass, one buffer.

---

## 3. `shared-v2`

Single source of truth for the wire contract **and** its runtime validation.

```
shared-v2/src/
  index.ts
  logs.ts             LogLevel, LogEvent, LogFilter, LogPage, LogCursor
  sources.ts          LogSourceConfig, LogSourceOption, SourceSelection, SourceOptions
  table.ts            LogTableColumn, LogTableSchema
  protocol.ts         ClientMessage, ServerMessage, PROTOCOL_VERSION, compatibility table
  decode.ts           zero-dependency decoder primitives
  decodeProtocol.ts   decodeClientMessage, decodeHistoryQuery, decodeLogFilter
```

Decisions:

- **Zero runtime dependencies.** The Requirements doc mandates "lightweight with minimal
  dependencies"; a ~150-line decoder covers 8 message shapes and ships to the browser for free.
  Decoders return `{ ok: true, value } | { ok: false, error }` — no exceptions on the hot path.
- **`PROTOCOL_VERSION` lives here only.** The packaging workaround (§1 #20) is fixed by having
  `server-v2` compile the constant into its own output via a normal `import`, and by having the
  packager bundle `shared-v2` instead of stripping it.
- **Wire `LogEvent` changes** (see §4.2): `timestampMs: number` replaces re-parsed ISO strings,
  `raw` + `messageOffset` replace the duplicated `message`/`rawMessage` pair, `seq` replaces
  `randomUUID()`.

Wire event:

```ts
interface LogEvent {
  seq: number; // globally monotonic within a stream; doubles as the row key
  timestampMs: number; // epoch millis, parsed once at ingest
  timestampText: string; // original token, for exact display
  sourceId: string;
  sourceName: string;
  filePath: string;
  level: LogLevel;
  raw: string; // full original line(s), including continuations
  messageOffset: number; // message === raw.slice(messageOffset)
  fields: Record<string, string>;
  sourceSeq: number; // appearance order within the source, for stable ties
}
```

---

## 4. `server-v2`

```
server-v2/src/
  main.ts                      composition root, signal + crash handling
  config/
    load.ts                    read + decode sources.json / parser.json
    types.ts
  ingest/
    fileTailer.ts              chunked, partial-safe, rotation-aware reader
    directoryWatcher.ts        poll-based discovery of new/changed/removed files
    parser.ts                  regex → StoredEvent, schema derivation
    timestamp.ts               ISO-ish token → epoch millis, no Date.parse
  domain/
    eventBuffer.ts             bounded, ordered, O(log n) cursor queries
    filter.ts                  matcher compilation + regex safety
    logStream.ts               watcher + tailers + parser + buffer for one selection
    streamRegistry.ts          refcounted dedupe across sessions
    sourceResolver.ts          selection → directories and file matching
  transport/
    server.ts                  http + upgrade wiring
    origin.ts                  allowlist
    routes.ts                  POST /api/logs, GET /api/health
    wsGateway.ts               connection lifecycle, heartbeat
    session.ts                 filter + cursor + live batching
    outbound.ts                backpressure-aware send
  util/
    logger.ts                  levelled, off the hot path by default
```

### 4.1 Ingestion

**`DirectoryWatcher` replaces chokidar.** The sample sources are named
`perf-share-a/b/c` — network shares, where `fs.watch` is unreliable or silently
non-functional. A `readdir` + `stat` poll (default 250 ms, configurable) is:

- correct on SMB/NFS/containers/WSL, where inotify is not;
- uniform — new files, appends, truncation and deletion all fall out of the same diff;
- bounded latency by construction, instead of chokidar's `awaitWriteFinish` which
  _increases_ latency exactly when the file is busiest (§1 #7);
- one fewer dependency.

**`FileTailer` is written from scratch.** Per file it holds `{ fd, position, inode, carry, decoder }`:

- reads in fixed 64 KiB chunks in a loop until EOF — never `Buffer.alloc(size - position)` (§1, 500 MB burst);
- advances `position` by the **actual** `bytesRead` (fixes §1 #3);
- decodes through `StringDecoder` so multi-byte codepoints survive chunk boundaries (§1 #5);
- emits only newline-terminated lines and keeps the remainder in `carry` (§1 #4);
- detects rotation by `(ino, dev)` change or `size < position` and restarts from 0 (§1 #6).

**Parser.** Unchanged idea — config regex with named groups driving both event fields and
the client table schema, which is the best thing in v1. Changes: timestamp parsed to epoch
millis once via an explicit pattern (no `Date.parse` on ambiguous, TZ-less strings), `seq`
counter instead of `randomUUID()` per line, and `message` stored as an offset into `raw`
rather than a second copy of the text.

**Continuations no longer mutate a shared object** (§1 #18). A continuation line replaces the
buffer slot with a new frozen event carrying a bumped `revision`; clients upsert by `seq`,
so the pagination path can no longer drop it.

### 4.2 `EventBuffer`

- Ordered oldest-first by the total order `(timestampMs, sourceId, sourceSeq)`.
- Inserts binary-search their slot; the overwhelmingly common append-at-end case is O(1).
- **Bounded** by `LOG_AGGREGATOR_MAX_EVENTS` (default 500 000), evicted oldest-first in
  chunks so the `splice` cost is amortised.
- Queries iterate **backwards from the cursor and stop after `limit` matches** — the whole
  buffer is never materialised or re-sorted (fixes §1 #10).
- Cursor is the sort key itself, not an `id`, so locating it is a binary search instead of
  a linear `findIndex`.
- Internal `StoredEvent` keeps a **lazily computed, cached lowercase** projection of the
  searchable text, so a case-insensitive scan allocates once per event ever, not twice per
  event per query (fixes §1 #11).

### 4.3 Filtering and regex safety

`compileFilter(filter)` returns a single predicate, short-circuiting to `() => true` when
the filter is empty. User regexes go through `compileSafeRegex`, which rejects:

- patterns longer than 512 characters;
- nested quantifiers (`(a+)+`, `(a*)*`, `(a|a)+`) — the catastrophic-backtracking shapes.

and matching is capped to the first 16 KiB of a line. This is a heuristic, not a proof;
the plan records it as a deliberate limitation. The complete fix is RE2 or a worker with a
kill switch, which is tracked as follow-up rather than pulling a native dependency into a
local-first tool.

### 4.4 Transport

- **Origin allowlist** on both the WS upgrade and CORS, closing the drive-by
  log-exfiltration hole (§1 #13). Allowed by default: loopback on any port (the dev
  client), plus `https://samuelguillemet.github.io`. The canonical deployment serves
  the frontend from GitHub Pages while the backend runs on the user's own machine, so
  it is cross-origin _by design_ and the loopback rule alone would reject it. Extend
  with `LOG_AGGREGATOR_ALLOWED_ORIGINS` for a self-hosted frontend. Requests with no
  `Origin` (curl, native clients) are allowed only from loopback. Chrome's Private
  Network Access preflight is acknowledged, since an HTTPS page reaching a loopback
  server is refused without it.
- **Every inbound payload is decoded**, never cast. Unknown message types answer with an
  `error` frame instead of killing the process (§1 #12).
- **`switch` on the discriminated union** — exhaustiveness checking, correct narrowing,
  no per-message closure allocation. The v1 `handlers` record was strictly worse.
- **Backpressure**: `send()` skips live batches while `socket.bufferedAmount` exceeds 4 MiB
  and flags the client that the stream lagged, rather than buffering unboundedly (§1 #16).
- **Heartbeat**: server pings every 30 s, terminates sockets that miss two (§1 #17).
- **Body cap** of 1 MiB on `POST /api/logs` (§1 #15).
- `unhandledRejection` / `uncaughtException` handlers log and exit deliberately.

---

## 5. `client-v2`

```
client-v2/src/
  main.tsx, App.tsx, styles.css
  connection/  socket.ts, api.ts, compatibility.ts
  state/       connectionStore, logsStore, filterStore, sourceStore, favoritesStore
  features/
    logs/      LogTable, LogTableHeader, LogRows, LogToolbar, LogDetailDialog, LogLevelBadge
    filters/   FilterPanel, FavoritesMenu
    sources/   SourceSelector
  lib/         format.ts, useDebounced.ts, tableLayout.ts, cn.ts
  ui/          shadcn primitives (carried over verbatim)
```

- **Bounded window** (`MAX_CLIENT_EVENTS = 50 000`) — the tab can no longer OOM.
- **No full re-sort per batch.** The store holds a newest-first array; a live batch (already
  sorted, essentially always newer) is merged against the leading slice only, and the
  `Map`-rebuild-plus-full-sort of v1 is gone (fixes §1 #19).
- **Filter input is debounced** (200 ms) before it reaches the socket; v1 fired a full
  server-side rescan per keystroke.
- **Declarative reconnect.** The client holds the _desired_ subscription; on every
  `connected` frame it re-sends it. This replaces v1's `wasConnectedRef` + `sources.length > 0`
  race, which could silently fail to restore a subscription after a server restart.
- **`LogViewer` is decomposed.** The 19-prop toolbar reads the stores it needs directly
  instead of having a god component drill props into it.
- Reconnect uses exponential backoff **with jitter**, and the `setTimeout(..., 0)` StrictMode
  workaround is replaced by a proper effect-scoped generation guard.

---

## 6. Tests

`node:test` + `node --experimental-strip-types`, no test-framework dependency.

| Suite                                    | Covers                                                                                                                          |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `shared-v2/src/protocolDecoders.test.ts` | every valid message, and the malformed ones that used to crash v1                                                               |
| `timestamp.test.ts`                      | comma/dot millis, `T`/space separators, offsets, malformed input                                                                |
| `parser.test.ts`                         | field extraction, message offsets, schema derivation, file-name matching                                                        |
| `fileTailer.test.ts`                     | partial trailing lines, multi-byte split across chunks, truncation, rotation by inode, CRLF, multi-chunk reads                  |
| `eventBuffer.test.ts`                    | ordering, out-of-order insert, tie-breaking, eviction, cursor paging, timestamp seek, non-mutating update                       |
| `filter.test.ts`                         | levels, any/all/not, case sensitivity, regex, rejected catastrophic patterns                                                    |
| `origin.test.ts`                         | loopback and listed origins allowed, lookalikes and every other site rejected, missing `Origin` accepted only from this machine |
| `logStream.test.ts`                      | priming, full live-batch delivery, continuation collapsing, new files mid-stream, selection scoping, rotation rebuild           |

---

## 7. Configuration

| Variable                           | Default               | Purpose                |
| ---------------------------------- | --------------------- | ---------------------- |
| `HOST` / `PORT`                    | `127.0.0.1` / `3000`  | bind address           |
| `LOG_AGGREGATOR_SOURCES_FILE`      | `config/sources.json` | source definitions     |
| `LOG_AGGREGATOR_PARSER_FILE`       | `config/parser.json`  | line pattern + groups  |
| `LOG_AGGREGATOR_ALLOWED_ORIGINS`   | loopback + Pages      | extra allowed origins  |
| `LOG_AGGREGATOR_MAX_EVENTS`        | `500000`              | per-stream buffer cap  |
| `LOG_AGGREGATOR_POLL_INTERVAL_MS`  | `250`                 | directory poll cadence |
| `LOG_AGGREGATOR_BATCH_INTERVAL_MS` | `100`                 | live batch flush       |
| `LOG_AGGREGATOR_LOG_LEVEL`         | `info`                | server log verbosity   |

`parser.json` gains a `fileNamePattern` so the French-specific `serveur|fwk|ui|batch`
token, hardcoded into two separate regexes in v1's domain layer, becomes configuration.

---

## 8. Execution order

1. ~~`shared-v2` — types, protocol, decoders.~~ done
2. ~~`server-v2` ingest — timestamp, parser, tailer, watcher (+ tests).~~ done
3. ~~`server-v2` domain — buffer, filter, resolver, stream, registry (+ tests).~~ done
4. ~~`server-v2` transport — origin, routes, gateway, session.~~ done
5. ~~`client-v2` — state, connection, features.~~ done
6. ~~Workspace wiring, typecheck, tests, manual run against `sample-logs`.~~ done
7. Delete v1 packages. **Not done** — destructive, and left as an explicit decision.

### Verified against `sample-logs`

| Check               | Result                                                                                                                                   |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Ingest completeness | 6750/6750 lines across three shares, primed in 48 ms                                                                                     |
| Live tail           | appended lines appear within one poll interval                                                                                           |
| Origin guard        | `https://evil.example.com` → `403` on both HTTP and upgrade                                                                              |
| Pages deployment    | `https://samuelguillemet.github.io` → `200` and `101 Switching Protocols`; suffix lookalikes such as `...github.io.evil.com` still `403` |
| Malformed frames    | `not json`, `{"type":"__proto__"}` → `error` frame, process survives                                                                     |
| Bad history query   | `{"type":"sideways","limit":999999}` → `400` with a reason                                                                               |
| Unsafe regex        | `(a+)+` → rejected, reported, degraded to substring                                                                                      |
| Reconnect           | backend restart → client replays filter and subscription automatically                                                                   |
| Pagination          | `Load older` extends the view through `POST /api/logs`                                                                                   |
| Shared streams      | second connection reuses the primed buffer, no second read                                                                               |
| Packaged artifact   | extracted to a clean directory and re-run: boots, ingests, paginates, shuts down cleanly                                                 |

### Packaging

`pnpm package:v2` → [scripts/package-v2.mjs](../scripts/package-v2.mjs).

v1's packager **deletes** `@log-aggregator/shared` from the packaged manifest. That only
worked because the v1 server imported types alone, and it is precisely why
`PROTOCOL_VERSION` had to be hand-copied into `server/src/config.ts`. `server-v2` imports
nine runtime values from the shared package, so the same strip would ship an artifact
that dies with `ERR_MODULE_NOT_FOUND` on boot.

The v2 packager instead vendors it: `shared-v2/dist` is copied to `vendor/shared-v2`
and declared as `file:./vendor/shared-v2`, installed with `--install-links` so the
archive contains a real directory rather than a symlink. Declaration output is stripped
(nothing imports the packaged server as a library). The packager boots the staged server
and asserts a healthy `/api/health` **before** archiving, so a broken artifact cannot be
produced silently.

Artifact: `release/log-aggregator-local-v2.zip`, 104 KB, `start.cmd` + `start.sh`.
As in v1, the client is not part of the archive; it is built separately with `BASE_PATH`.

### One regression found and fixed during verification

The first cut of `LogStream.pushToBatch` keyed its de-duplication on the tick alone,
so only the _first_ event per file per tick reached the client — the buffer was correct
but live delivery silently dropped the rest. Found by running the live generator, not by
the unit tests, which is exactly the gap that
`server-v2/src/domain/logStream.test.ts` ("delivers every appended line in the live
batch") now closes.

---

## 9. Explicitly kept from v1

Good decisions; carried over rather than reinvented:

- Monorepo with a shared types package.
- Config-driven regex parser whose named groups derive the client table schema — the
  strongest idea in the codebase.
- WebSocket for live tail, HTTP for history pagination.
- Server-side filtering, so the wire stays small.
- ~100 ms live batching.
- `sourceSeq` tiebreaking for stable cross-source ordering.
- Hot reload of `sources.json`.
- TanStack Table + Virtual, Zustand, Tailwind, shadcn primitives, oxlint/oxfmt, strict TS, ESM.
- Protocol version negotiation and the compatibility/feature table.

## 10. Deliberately not done

- RE2 / worker-isolated regex (heuristic guard instead — see §4.3).
- Per-run auth token: the client is served from a different origin in dev, so the origin
  allowlist is the fix that actually works in both modes. A token requires the server to
  serve the built client, which is a packaging change.
- Persistence across restarts. The Requirements doc says no databases; the bounded
  in-memory buffer honours that.
