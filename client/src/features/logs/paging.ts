import { type LogHistoryQuery, toLogCursor } from "@log-aggregator/shared";
import { fetchLogPage } from "@/connection/api";
import { PAGE_SIZE } from "@/lib/env";
import { useConnectionStore } from "@/state/connectionStore";
import { useLogsStore } from "@/state/logsStore";

/** Cap on a "load back to this time" request, which is otherwise unbounded. */
const UNTIL_PAGE_LIMIT = 2_000;

/**
 * Paging acts on stores, not on component state, so these stay module-scoped and
 * stable. Effects and handlers can call them without a memoized identity to track.
 */
export async function loadLogPage(query: LogHistoryQuery): Promise<void> {
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
    useLogsStore.getState().appendPage(await fetchLogPage(clientId, query));
  } catch (error) {
    setError(error instanceof Error ? error.message : "Failed to load older logs");
  }

  useLogsStore.getState().setLoadingPage(false);
}

export async function loadOlderLogs(): Promise<void> {
  const { events, hasMore } = useLogsStore.getState();
  const oldest = events.at(-1);

  if (!hasMore || !oldest) {
    return;
  }

  await loadLogPage({ cursor: toLogCursor(oldest), limit: PAGE_SIZE, type: "before" });
}

export async function loadLogsUntil(timestampMs: number): Promise<void> {
  await loadLogPage({ limit: UNTIL_PAGE_LIMIT, timestampMs, type: "until" });
}
