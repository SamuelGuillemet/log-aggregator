import type {
  LogFilter,
  LogPage,
  LogPageRequest,
} from "@log-aggregator/shared";

export interface LogPageQuery extends LogPageRequest {
  filter: LogFilter;
}

export async function fetchLogPage(query: LogPageQuery): Promise<LogPage> {
  const response = await fetch(`${getApiBaseUrl()}/api/logs`, {
    body: JSON.stringify(query),
    headers: { "content-type": "application/json" },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`Failed to load logs: ${response.status}`);
  }

  return (await response.json()) as LogPage;
}

function getApiBaseUrl(): string {
  const configuredApiUrl = import.meta.env.VITE_API_URL as string | undefined;

  if (configuredApiUrl) {
    return trimTrailingSlash(configuredApiUrl);
  }

  const configuredWebSocketUrl = import.meta.env.VITE_WS_URL as
    | string
    | undefined;

  if (configuredWebSocketUrl) {
    try {
      const url = new URL(configuredWebSocketUrl);
      url.protocol = url.protocol === "wss:" ? "https:" : "http:";

      return url.origin;
    } catch {}
  }

  return "http://127.0.0.1:3000";
}

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}
