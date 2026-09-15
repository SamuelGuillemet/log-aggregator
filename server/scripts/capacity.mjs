// Throwaway: proves what happens when a day's logs exceed the buffer cap.
import { WebSocket } from "ws";

const port = process.argv[2];
const date = process.argv[3];
const origin = "http://localhost";

let clientId;
let schemaSeen = false;

const started = Date.now();
const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers: { origin } });

socket.on("open", () =>
  socket.send(
    JSON.stringify({
      selection: { date, project: "APP-001", sourceId: "local-performance" },
      type: "subscribe",
    }),
  ),
);

socket.on("message", async (raw) => {
  const message = JSON.parse(raw.toString());

  if (message.type === "connected") {
    clientId = message.clientId;
    return;
  }

  if (message.type !== "snapshot" || schemaSeen) {
    return;
  }

  schemaSeen = true;
  console.log(`prime time:        ${Date.now() - started} ms`);
  console.log(`buffered on server: ${message.status.bufferedEvents.toLocaleString()}`);

  // Page all the way back and count what is actually retrievable.
  let events = [...message.page.events];
  let hasMore = message.page.hasMoreOlder;
  let requests = 0;

  while (hasMore && requests < 5000) {
    const oldest = events.at(-1);
    const response = await fetch(`http://127.0.0.1:${port}/api/logs`, {
      body: JSON.stringify({
        cursor: {
          sourceId: oldest.sourceId,
          sourceSeq: oldest.sourceSeq,
          timestampMs: oldest.timestampMs,
        },
        limit: 2000,
        type: "before",
      }),
      headers: { "content-type": "application/json", origin, "x-log-client-id": clientId },
      method: "POST",
    });
    const page = await response.json();
    requests += 1;
    events = events.concat(page.events);
    hasMore = page.hasMoreOlder;

    if (page.events.length === 0) {
      break;
    }
  }

  console.log(`retrievable by paging: ${events.length.toLocaleString()} (in ${requests} requests)`);
  console.log(`client was told "no more logs": ${!hasMore}`);
  console.log(`oldest retrievable line: ${events.at(-1)?.raw.slice(0, 60)}`);
  process.exit(0);
});

socket.on("error", (error) => {
  console.error(error.message);
  process.exit(1);
});
