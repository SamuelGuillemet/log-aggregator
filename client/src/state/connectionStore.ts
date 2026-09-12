import { create } from "zustand";
import {
  type CompatibilityResult,
  UNKNOWN_COMPATIBILITY,
  resolveCompatibility,
} from "@/connection/compatibility";

interface ConnectionStore {
  connected: boolean;
  clientId: string | undefined;
  /** Latest transient problem: a bad filter, a stream error, a failed page load. */
  error: string | undefined;
  compatibility: CompatibilityResult;
  setConnected: (connected: boolean) => void;
  setIdentity: (clientId: string, protocolVersion: number) => void;
  setError: (error: string | undefined) => void;
}

export const useConnectionStore = create<ConnectionStore>((set) => ({
  clientId: undefined,
  compatibility: UNKNOWN_COMPATIBILITY,
  connected: false,
  error: undefined,
  setConnected: (connected) => set(connected ? { connected } : { clientId: undefined, connected }),
  setError: (error) => set({ error }),
  setIdentity: (clientId, protocolVersion) =>
    set({ clientId, compatibility: resolveCompatibility(protocolVersion) }),
}));
