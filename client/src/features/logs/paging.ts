import { type LogHistoryQuery, type LogPage, toLogCursor } from "@log-aggregator/shared";
import { fetchLogPage } from "@/connection/api";
import { PAGE_SIZE } from "@/lib/env";
import { useConnectionStore } from "@/state/connectionStore";
import { useLogsStore } from "@/state/logsStore";

/** "Load 50ish logs at this time" — a jump replaces the view, it doesn't page 2000 deep. */
const JUMP_PAGE_SIZE = 50;

/**
 * Paging acts on stores, not on component state, so these stay module-scoped and
 * stable. Effects and handlers can call them without a memoized identity to track.
 */
async function runHistoryQuery(
  query: LogHistoryQuery,
  apply: (page: LogPage) => void,
  failureMessage: string,
): Promise<void> {
  const { clientId, setError } = useConnectionStore.getState();

  if (useLogsStore.getState().loadingPage) {
    return;
  }

  if (!clientId) {
    setError("Not connected to the log server");
    return;
  }

  useLogsStore.getState().setLoadingPage(true);

  try {
    apply(await fetchLogPage(clientId, query));
  } catch (error) {
    setError(error instanceof Error ? error.message : failureMessage);
  }

  useLogsStore.getState().setLoadingPage(false);
}

export async function loadOlderLogs(): Promise<void> {
  const { events, hasMoreOlder } = useLogsStore.getState();
  const oldest = events.at(-1);

  if (!hasMoreOlder || !oldest) {
    return;
  }

  await runHistoryQuery(
    { cursor: toLogCursor(oldest), limit: PAGE_SIZE, type: "before" },
    (page) => useLogsStore.getState().appendPage(page, "older"),
    "Failed to load older logs",
  );
}

export async function loadNewerLogs(): Promise<void> {
  const { events, hasMoreNewer } = useLogsStore.getState();
  const newest = events.at(0);

  if (!hasMoreNewer || !newest) {
    return;
  }

  await runHistoryQuery(
    { cursor: toLogCursor(newest), limit: PAGE_SIZE, type: "after" },
    (page) => useLogsStore.getState().appendPage(page, "newer"),
    "Failed to load newer logs",
  );
}

/** Replaces the loaded window with ~50 entries anchored at `timestampMs`. */
export async function jumpToTime(timestampMs: number): Promise<void> {
  await runHistoryQuery(
    { limit: JUMP_PAGE_SIZE, timestampMs, type: "until" },
    (page) => useLogsStore.getState().applyJump(page),
    "Failed to jump to that time",
  );
}
