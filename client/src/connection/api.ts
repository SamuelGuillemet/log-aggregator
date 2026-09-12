import type { LogHistoryQuery, LogPage } from "@log-aggregator/shared";
import { API_URL } from "@/lib/env";

export async function fetchLogPage(clientId: string, query: LogHistoryQuery): Promise<LogPage> {
  const response = await fetch(`${API_URL}/api/logs`, {
    body: JSON.stringify(query),
    headers: { "content-type": "application/json", "x-log-client-id": clientId },
    method: "POST",
  });

  if (!response.ok) {
    const detail = (await response.json().catch(() => undefined)) as { error?: string } | undefined;

    throw new Error(detail?.error ?? `Failed to load logs (${response.status})`);
  }

  return (await response.json()) as LogPage;
}
