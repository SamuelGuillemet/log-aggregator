import {
  COMPATIBILITY_TABLE,
  MIN_SUPPORTED_PROTOCOL_VERSION,
  PROTOCOL_VERSION,
} from "@log-aggregator/shared";

export type CompatibilityStatus = "unknown" | "compatible" | "server-outdated" | "server-newer";

export interface CompatibilityResult {
  status: CompatibilityStatus;
  /** Feature flags safe to use against the connected backend. */
  features: ReadonlySet<string>;
  message: string | undefined;
}

const RELEASES_URL = "https://github.com/SamuelGuillemet/log-aggregator/releases/latest";

export const UNKNOWN_COMPATIBILITY: CompatibilityResult = {
  features: new Set(),
  message: undefined,
  status: "unknown",
};

export function resolveCompatibility(serverProtocolVersion: number): CompatibilityResult {
  if (serverProtocolVersion < MIN_SUPPORTED_PROTOCOL_VERSION) {
    return {
      features: new Set(),
      message: `This backend speaks protocol v${serverProtocolVersion}; this app needs at least v${MIN_SUPPORTED_PROTOCOL_VERSION}. Update your local backend: ${RELEASES_URL}`,
      status: "server-outdated",
    };
  }

  const entry = COMPATIBILITY_TABLE.find(
    (candidate) => candidate.protocolVersion === serverProtocolVersion,
  );

  if (entry) {
    return { features: new Set(entry.features), message: undefined, status: "compatible" };
  }

  const latestKnown = COMPATIBILITY_TABLE.at(-1);

  return {
    features: new Set(latestKnown?.features ?? []),
    message: `This backend speaks protocol v${serverProtocolVersion}, newer than this app was built for (v${PROTOCOL_VERSION}). Refresh or update the app if something looks off.`,
    status: "server-newer",
  };
}
