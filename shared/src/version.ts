/**
 * Wire protocol version for the ClientMessage/ServerMessage contract and the
 * HTTP API. Bump this whenever a change would break an older backend talking
 * to a newer frontend, and append an entry to COMPATIBILITY_TABLE below.
 * Never edit or remove past entries - already-installed backends keep
 * reporting them, and the frontend needs them to gate its own features.
 */
export const PROTOCOL_VERSION = 1 as const;

export type PROTOCOL_VERSION = typeof PROTOCOL_VERSION;

export interface CompatibilityEntry {
  protocolVersion: number;
  /** Frontend feature flags first supported at this protocol version. */
  features: readonly string[];
}

export const COMPATIBILITY_TABLE: readonly CompatibilityEntry[] = [
  {
    features: ["subscribe", "history-pagination", "favorites"],
    protocolVersion: 1,
  },
];

/** Oldest backend protocol version this frontend build still talks to. */
export const MIN_SUPPORTED_PROTOCOL_VERSION =
  COMPATIBILITY_TABLE[0].protocolVersion;
