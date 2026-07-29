# WebSocket Protocol

The browser connects to `ws://127.0.0.1:3000/ws` by default.

## Client Messages

```json
{
  "type": "subscribe",
  "payload": { "environment": "LOCAL", "country": "SAMPLE", "tier": "back" }
}
```

```json
{ "type": "unsubscribe" }
```

```json
{ "type": "pause" }
```

```json
{ "type": "resume" }
```

```json
{ "type": "ping" }
```

## Server Messages

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

```json
{ "type": "snapshot", "payload": { "events": [], "stats": {}, "sources": [] } }
```

```json
{ "type": "log", "payload": {} }
```

```json
{ "type": "stats", "payload": {} }
```

```json
{ "type": "error", "payload": { "message": "..." } }
```

Shared TypeScript protocol types live in [shared/src/types.ts](../shared/src/types.ts).
