const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const LOOPBACK_ADDRESSES = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

export type OriginGuard = (
  origin: string | undefined,
  remoteAddress: string | undefined,
) => boolean;

/**
 * v1 accepted any `Origin` on the WebSocket upgrade and answered
 * `access-control-allow-origin: *`, so any page the user visited could open
 * ws://127.0.0.1:3000/ws and read their logs. Loopback origins on any port are
 * allowed because the dev client is served from Vite; everything else must be
 * listed explicitly.
 */
export function createOriginGuard(allowedOrigins: string[]): OriginGuard {
  const explicit = new Set(allowedOrigins);

  return (origin, remoteAddress) => {
    if (origin === undefined || origin === "null") {
      // Non-browser clients send no Origin; accept them only from this machine.
      return isLoopbackAddress(remoteAddress);
    }

    if (explicit.has(origin)) {
      return true;
    }

    try {
      return LOOPBACK_HOSTS.has(new URL(origin).hostname);
    } catch {
      return false;
    }
  };
}

export function isLoopbackAddress(address: string | undefined): boolean {
  return address !== undefined && LOOPBACK_ADDRESSES.has(address);
}

export function corsHeaders(origin: string | undefined): Record<string, string> {
  return {
    "access-control-allow-headers": "content-type,x-log-client-id",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-origin": origin ?? "null",
    "access-control-max-age": "600",
    vary: "origin",
  };
}
