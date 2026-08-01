# Server Contract

This document describes the current backend behavior implemented in the Node server under `server/src`. It covers HTTP routes, WebSocket messages, source resolution, parsing rules, buffering, pagination, and the operational constraints that matter to a client.

## Overview

The backend exposes two interfaces on the same port:

- HTTP on `http://127.0.0.1:3000`
- WebSocket on `ws://127.0.0.1:3000/ws`

The server is stateful. One `LogAggregatorService` instance is shared by all HTTP requests and all WebSocket clients.

That has two important consequences:

- WebSocket filters are per client connection.
- Source selection is global. When one client subscribes or unsubscribes, it changes the watched sources and in-memory buffer for every client.

There is no authentication, no authorization, and no persistence layer.

## Runtime Behavior

At startup the server:

- loads the environment matrix from `LOG_AGGREGATOR_MATRIX_FILE` or `server/config/environment-matrix.json`
- loads the parser config from `LOG_AGGREGATOR_PARSER_FILE` or `server/config/parser.json`
- creates one in-memory event buffer with a maximum size from `LOG_AGGREGATOR_BUFFER_SIZE` or `10000`
- starts an HTTP server and upgrades WebSocket connections on `/ws`

On shutdown (`SIGINT`, `SIGTERM`) the server:

- stops watchers
- clears active sources and buffered events
- closes the WebSocket server
- closes the HTTP server

## Data Contracts

### Source Selection

```ts
type ApplicationTier = "back" | "front";

interface SourceSelection {
  environment: string;
  country: string;
  tier: ApplicationTier;
  project: string;
  date: string;
}
```

Rules:

- `project` is trimmed before use.
- `date` must match `YYYY-MM-DD` exactly.
- if `project` is empty or `date` is invalid, the selection resolves to zero sources without throwing.

This is important, only the files that match the selected project and date are watched, not the directory as a whole.

### Source Options

```ts
interface SourceOptions {
  environments: string[];
  countriesByEnvironment: Record<string, string[]>;
  tiers: ["back", "front"] | string[];
}
```

Rules:

- environments are derived from the matrix and sorted alphabetically
- countries are grouped by environment and sorted alphabetically
- tiers are always `back` and `front`

### Log Event

```ts
type LogLevel =
  | "TRACE"
  | "DEBUG"
  | "INFO"
  | "WARN"
  | "ERROR"
  | "FATAL"
  | "UNKNOWN";

interface LogEvent {
  id: string;
  timestamp: string;
  receivedAt: string;
  sourceId: string;
  sourceName: string;
  filePath: string;
  level: LogLevel;
  message: string;
  raw: string;
  fields: Record<string, string>;
}
```

Notes:

- `id` is generated with `randomUUID()` when a new parsed event is created.
- `timestamp` comes from the log line and is normalized by replacing `,` with `.` and the first space with `T`.
- `receivedAt` is the server receive time, not the log timestamp.
- `fields` contains parser-defined extra captures only.

### Log Filter

```ts
interface LogFilter {
  levels: LogLevel[];
  text: string;
  regex: boolean;
  caseSensitive: boolean;
}
```

Default filter:

```json
{
  "levels": [],
  "text": "",
  "regex": false,
  "caseSensitive": false
}
```

Matching behavior:

- empty `levels` means all levels
- `text` is matched against `timestamp`, `sourceName`, `level`, `message`, and every value in `fields`
- when `regex` is `true`, the server tries to compile `text` as a regular expression
- invalid regex patterns do not fail the request; they fall back to plain substring matching
- non-case-sensitive matching lowercases both sides

### Snapshot And Pagination

```ts
interface LogCursor {
  id: string;
  timestamp: string;
  receivedAt: string;
  filePath: string;
}

interface LogHistoryQuery {
  beforeCursor?: LogCursor;
  fromTimestamp?: string;
  limit?: number;
}

interface LogPage {
  append: "top" | "bottom";
  events: LogEvent[];
  hasMore: boolean;
}

interface LogSnapshot {
  events: LogEvent[];
  sources: LogSource[];
  schema: LogTableSchema;
  hasMore: boolean;
}
```

Pagination behavior:

- results are sorted newest first
- sort order is `timestamp`, then `receivedAt`, then `filePath`, then `id`
- default page size is `50`
- minimum page size is `1`
- maximum page size is `1000`
- every current page response uses `append: "bottom"`
- `hasMore` indicates whether older matching buffered events still exist

## HTTP API

All HTTP responses include these CORS headers:

- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Headers: content-type`
- `Access-Control-Allow-Methods: GET,POST,OPTIONS`

### `OPTIONS *`

Returns `204 No Content` for CORS preflight.

### `POST /api/logs`

Returns a filtered historical page from the current in-memory buffer.

Request body:

```json
{
  "filter": {
    "levels": [],
    "text": "requestId=REQ-42",
    "regex": false,
    "caseSensitive": false
  },
  "beforeCursor": {
    "id": "0b6f402f-4b28-44d1-b61d-57ce1e1a3f2a",
    "timestamp": "2026-07-29T10:15:30.123",
    "receivedAt": "2026-07-29T10:15:31.000Z",
    "filePath": "/logs/ACCOUNTING-API-serveur.2026-07-29-0.log"
  },
  "fromTimestamp": "2026-07-29T10:00:00.000",
  "limit": 50
}
```

Request rules:

- `filter` is optional; omitted fields fall back to the default filter
- `beforeCursor` is optional; when present, only strictly older events are returned
- `fromTimestamp` is optional; when present, only events at or after the timestamp are returned
- `limit` is optional and clamped to the range `1..1000`
- `beforeCursor` and `fromTimestamp` can be combined

Response `200`:

```json
{
  "append": "bottom",
  "events": [],
  "hasMore": false
}
```

Error response `400`:

```json
{ "error": "Invalid log page request" }
```

The `400` path is used when the body cannot be parsed as JSON or another exception is thrown while reading the request.

### Unknown Routes

Any unmatched route returns `404`:

```json
{ "error": "Not found" }
```

## WebSocket API

Endpoint: `ws://127.0.0.1:3000/ws`

### Connection Lifecycle

For every new connection, the server immediately sends two messages in order:

1. `connected`
2. `snapshot`

The first snapshot sent on connection always uses the default filter for that socket.

Each socket starts with its own filter state initialized to the default filter.

### Client Messages

#### `subscribe`

Starts watching the selected sources.

```json
{
  "type": "subscribe",
  "payload": {
    "environment": "LOCAL",
    "country": "SAMPLE",
    "tier": "back",
    "project": "ACCOUNTING-API",
    "date": "2026-07-29"
  }
}
```

Effects:

- resolves sources from the selected environment, country, tier, project, and date
- clears the existing in-memory event buffer
- clears multiline continuation state
- resets tail read positions
- stops any existing watchers and starts watching the new source files (only the ones that match the selected project and date)
- loads matching existing files into the buffer before returning
- sends a fresh `snapshot` back to the requesting socket using that socket's current filter

Important:

- because the service is shared, a subscribe from one socket replaces the active source set for all sockets

#### `unsubscribe`

Stops all watchers and clears current state.

```json
{ "type": "unsubscribe" }
```

Effects:

- clears active sources
- clears buffered events
- clears multiline continuation state
- resets tail positions
- stops all watchers
- sends a fresh `snapshot` back to the requesting socket using that socket's current filter

Important:

- because the service is shared, unsubscribe affects all connected sockets

#### `filter`

Updates the per-socket filter and returns a filtered snapshot.

```json
{
  "type": "filter",
  "payload": {
    "levels": ["WARN", "ERROR"],
    "text": "requestId=REQ-42",
    "regex": false,
    "caseSensitive": false
  }
}
```

Rules:

- the server merges the partial payload into the socket's existing filter
- omitted fields keep their previous values
- the updated filter affects future `log` broadcasts for that socket only
- the server responds with a `snapshot` after applying the new filter

#### `ping`

```json
{ "type": "ping" }
```

Response:

```json
{
  "type": "pong",
  "payload": {
    "timestamp": "2026-08-01T12:34:56.789Z"
  }
}
```

### Server Messages

#### `connected`

Sent once on connection.

```json
{
  "type": "connected",
  "payload": {
    "options": {
      "environments": ["LOCAL"],
      "countriesByEnvironment": {
        "LOCAL": ["SAMPLE"]
      },
      "tiers": ["back", "front"]
    }
  }
}
```

#### `snapshot`

Sent on connection, after `subscribe`, after `unsubscribe`, and after `filter`.

```json
{
  "type": "snapshot",
  "payload": {
    "events": [],
    "sources": [],
    "schema": {
      "columns": []
    },
    "hasMore": false
  }
}
```

Payload notes:

- `events` contains the newest matching buffered events, not the full buffer
- `sources` is the global active source list
- `schema` is generated from fixed base columns plus parser-defined extra fields
- `hasMore` tells the client whether older matching events can be loaded through `POST /api/logs`

#### `log`

Sent for live updates only.

```json
{
  "type": "log",
  "payload": {
    "id": "0b6f402f-4b28-44d1-b61d-57ce1e1a3f2a",
    "timestamp": "2026-07-29T10:15:30.123",
    "receivedAt": "2026-08-01T12:34:56.789Z",
    "sourceId": "local-sample-local-sample-accounting-api-0-back",
    "sourceName": "LOCAL/SAMPLE/back/local-share-a",
    "filePath": "/path/to/ACCOUNTING-API-serveur.2026-07-29-0.log",
    "level": "INFO",
    "message": "Created invoice requestId=REQ-42",
    "raw": "2026-07-29 10:15:30,123 INFO [main] accounting.Service - Created invoice requestId=REQ-42",
    "fields": {
      "thread": "main",
      "logger": "accounting.Service"
    }
  }
}
```

Rules:

- only sockets whose current filter matches the event receive the message
- initial file loading during `subscribe` is buffered but not emitted as individual `log` messages
- live file additions and file changes after watcher readiness are emitted
- continuation lines for multiline events can produce another `log` message for the mutated existing event object when live broadcasting is enabled

#### `error`

Two kinds of errors exist:

1. connection-local protocol errors
2. backend watcher or processing errors broadcast to all clients

Connection-local invalid JSON error:

```json
{
  "type": "error",
  "payload": {
    "message": "Invalid JSON message"
  }
}
```

Broadcast operational error:

```json
{
  "type": "error",
  "payload": {
    "message": "Failed to process /path/to/file.log",
    "details": "Error: ..."
  }
}
```

## Source Resolution

The environment matrix is an array of:

```ts
interface EnvironmentMatrixEntry {
  environment: string;
  country: string;
  code: string;
  host: string;
  shares: string[];
}
```

For each matching matrix row and for each configured share, the backend creates one source for the selected tier only:

- `back` maps to `<share>/Java/apache-tomcat-back/logs`
- `front` maps to `<share>/Java/apache-tomcat-front/logs`

Relative share paths in the matrix file are resolved relative to the matrix file directory.

Generated source names use this format:

```text
<environment>/<country>/<tier>/<share-basename>
```

Example:

```text
LOCAL/SAMPLE/back/local-share-a
```

## Watched Files

Only files matching the selected project and date are watched, not the directory as a whole.

Accepted names:

- `<project>-serveur.<date>-N.log`
- `<project>-fwk.<date>-N.log`

Examples:

- `ACCOUNTING-API-serveur.2026-07-29-0.log`
- `ACCOUNTING-API-fwk.2026-07-29-1.log`

Matching is case-insensitive.

## Parsing And Multiline Behavior

The default parser configuration currently expects lines like:

```text
2026-07-29 10:15:30,123 INFO [main] accounting.Service - Created invoice requestId=REQ-42
```

Current parser captures:

- `timestamp`
- `level`
- `thread`
- `logger`
- `message`

Parsing rules:

- lines that match the configured regex create a new `LogEvent`
- unknown log levels are normalized to `UNKNOWN`
- lines that do not match are treated as continuation lines
- a continuation line is appended to the latest parsed event for the same source and file
- if no previous event exists for that file, the line is dropped and only a server-side warning is logged

Schema generation rules:

- base columns are always `timestamp`, `sourceName`, `level`
- parser-defined extra fields become hideable columns in the `Parsed fields` group
- `message` is always the last non-hideable column

With the current parser config, the extra columns are `thread` and `logger`.

## Buffering And History Limits

The server stores events in memory only.

Rules:

- newest events are appended to the buffer
- when the buffer exceeds `LOG_AGGREGATOR_BUFFER_SIZE`, the oldest events are discarded
- HTTP history paging and WebSocket snapshots only read from that in-memory buffer
- after `subscribe` or `unsubscribe`, the old buffer is cleared before new state is built

Shared TypeScript contracts live under [shared/src](../shared/src).
