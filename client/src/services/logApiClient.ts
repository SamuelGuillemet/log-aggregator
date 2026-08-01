import type { LogHistoryQuery, LogPage } from "@log-aggregator/shared";
import { API_URL } from "@/constants/url";

export async function fetchLogPage(
  clientId: string,
  query: LogHistoryQuery,
): Promise<LogPage> {
  const response = await fetch(`${API_URL}/api/logs`, {
    body: JSON.stringify(query),
    headers: {
      "content-type": "application/json",
      "x-log-client-id": clientId,
    },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`Failed to load logs: ${response.status}`);
  }

  return (await response.json()) as LogPage;
}
