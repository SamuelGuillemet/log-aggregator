// Throwaway smoke test for server. Not part of the build.
import { WebSocket } from "ws";

const port = process.argv[2] ?? "3123";
const project = process.argv[3] ?? "APP-001";
const date = process.argv[4] ?? "2026-09-12";

const health = await fetch(`http://127.0.0.1:${port}/api/health`, {
  headers: { origin: "http://localhost:5174" },
});
console.log("health", health.status, await health.json());

const blocked = await fetch(`http://127.0.0.1:${port}/api/health`, {
  headers: { origin: "https://evil.example.com" },
});
console.log("evil origin ->", blocked.status);

const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`, {
  headers: { origin: "http://localhost:5174" },
});
let clientId;

socket.on("open", () => {
  socket.send("this is not json");
  socket.send(JSON.stringify({ type: "__proto__" }));
  socket.send(
    JSON.stringify({
      type: "subscribe",
      selection: { sourceId: "local-performance", project, date },
    }),
  );
});

socket.on("message", async (raw) => {
  const message = JSON.parse(raw.toString());

  if (message.type === "connected") {
    clientId = message.clientId;
    console.log(
      "connected",
      clientId,
      "sources:",
      message.options.sources.map((s) => `${s.id}:${s.applications.join("|")}`),
    );
    return;
  }

  if (message.type === "error") {
    console.log("error frame:", message.message, message.details ?? "");
    return;
  }

  if (message.type === "status") {
    console.log("status: buffered", message.status.bufferedEvents);
    return;
  }

  if (message.type === "snapshot") {
    const { page, status } = message;
    console.log(
      "snapshot: buffered",
      status.bufferedEvents,
      "page",
      page.events.length,
      "hasMore",
      page.hasMore,
    );
    const newest = page.events[0];
    const oldest = page.events.at(-1);
    console.log("newest:", newest && newest.raw.slice(0, 90));
    console.log(
      "sourceName:",
      newest && newest.sourceName,
      "| fields:",
      newest && JSON.stringify(newest.fields),
    );

    if (oldest) {
      const res = await fetch(`http://127.0.0.1:${port}/api/logs`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-log-client-id": clientId,
          origin: "http://localhost:5174",
        },
        body: JSON.stringify({
          type: "before",
          limit: 50,
          cursor: {
            timestampMs: oldest.timestampMs,
            sourceId: oldest.sourceId,
            sourceSeq: oldest.sourceSeq,
          },
        }),
      });
      const older = await res.json();
      console.log("page /api/logs:", res.status, older.events?.length, "hasMore", older.hasMore);

      const bad = await fetch(`http://127.0.0.1:${port}/api/logs`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-log-client-id": clientId,
          origin: "http://localhost:5174",
        },
        body: JSON.stringify({ type: "sideways", limit: 999999 }),
      });
      console.log("bad query ->", bad.status, await bad.json());
    }

    socket.send(
      JSON.stringify({
        type: "filter",
        filter: { levels: ["ERROR", "FATAL"], text: "(a+)+", regex: true },
      }),
    );
    setTimeout(() => {
      socket.close();
      process.exit(0);
    }, 1500);
  }
});

socket.on("error", (error) => {
  console.error("socket error", error.message);
  process.exit(1);
});
