import {
  COMPATIBILITY_TABLE,
  MIN_SUPPORTED_PROTOCOL_VERSION,
  PROTOCOL_VERSION,
} from "@log-aggregator/shared";

export type CompatibilityStatus =
  | "compatible"
  | "server-outdated"
  | "server-newer"
  | "unknown";

export interface CompatibilityResult {
  status: CompatibilityStatus;
  /** Feature flags safe to use against the connected backend. */
  features: ReadonlySet<string>;
  message: string | undefined;
}

/**
 * Resolves what the frontend can safely do against a connected backend.
 * `serverProtocolVersion` is undefined for backends predating this
 * negotiation, so those are treated as best-effort rather than a hard error.
 */
export function resolveCompatibility(
  serverProtocolVersion: number | undefined,
): CompatibilityResult {
  if (serverProtocolVersion === undefined) {
    return {
      features: new Set(),
      message:
        "This backend does not report a protocol version, so it may predate some features. Consider updating your local backend. https://github.com/SamuelGuillemet/log-aggregator/releases/latest",
      status: "unknown",
    };
  }

  if (serverProtocolVersion < MIN_SUPPORTED_PROTOCOL_VERSION) {
    return {
      features: new Set(),
      message: `This backend uses protocol v${serverProtocolVersion}, older than the minimum supported v${MIN_SUPPORTED_PROTOCOL_VERSION}. Please update your local backend. https://github.com/SamuelGuillemet/log-aggregator/releases/latest`,
      status: "server-outdated",
    };
  }

  const entry = COMPATIBILITY_TABLE.find(
    (candidate) => candidate.protocolVersion === serverProtocolVersion,
  );

  if (entry) {
    return {
      features: new Set(entry.features),
      message: undefined,
      status: "compatible",
    };
  }

  // Backend is ahead of what this frontend build's table knows about.
  const latestKnown = COMPATIBILITY_TABLE[COMPATIBILITY_TABLE.length - 1];

  return {
    features: new Set(latestKnown?.features ?? []),
    message: `This backend uses protocol v${serverProtocolVersion}, newer than this app was built for (v${PROTOCOL_VERSION}). Refresh or update the app if something looks off.`,
    status: "server-newer",
  };
}
