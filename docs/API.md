# API Protocol

## WebSocket

The browser connects to `ws://127.0.0.1:3000/ws` by default.

### Client Messages

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

```json
{ "type": "unsubscribe" }
```

```json
{
  "type": "filter",
  "payload": {
    "levels": ["WARN", "ERROR"],
    "sourceIds": [],
    "text": "requestId=REQ-42",
    "regex": false,
    "caseSensitive": false
  }
}
```

```json
{ "type": "ping" }
```

### Server Messages

```json
{
  "type": "connected",
  "payload": {
    "options": {
      "environments": [],
      "countriesByEnvironment": {},
      "tiers": ["back", "front"]
    }
  }
}
```

`snapshot` includes the latest filtered page, active sources, the backend table schema, and whether older buffered events are available.

```json
{
  "type": "snapshot",
  "payload": {
    "events": [],
    "sources": [],
    "schema": { "columns": [] },
    "hasMore": false
  }
}
```

```json
{ "type": "log", "payload": {} }
```

```json
{ "type": "error", "payload": { "message": "..." } }
```

## HTTP

Historical pages are fetched over HTTP so WebSocket traffic stays live-only.

### `POST /api/logs`

Request older logs before the oldest displayed event:

```json
{
  "filter": {
    "levels": [],
    "sourceIds": [],
    "text": "",
    "regex": false,
    "caseSensitive": false
  },
  "beforeCursor": {
    "id": "event-id",
    "timestamp": "2026-07-29T10:15:30.123Z",
    "receivedAt": "2026-07-29T10:15:31.000Z",
    "filePath": "/logs/ACCOUNTING-API-serveur.2026-07-29-0.log"
  },
  "limit": 50
}
```

Request logs down to a timestamp:

```json
{
  "filter": {
    "levels": [],
    "sourceIds": [],
    "text": "",
    "regex": false,
    "caseSensitive": false
  },
  "fromTimestamp": "2026-07-29T10:00:00.000",
  "limit": 1000
}
```

Response:

```json
{ "append": "bottom", "events": [], "hasMore": false }
```

Shared TypeScript protocol types live under [shared/src](../shared/src).
