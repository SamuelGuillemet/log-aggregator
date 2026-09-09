import type { ServerMessage } from "@log-aggregator/shared";
import { create } from "zustand";
import { type CompatibilityResult, resolveCompatibility } from "@/lib/compatibility";

interface CompatibilityStore extends CompatibilityResult {
  handleServerMessage: (message: ServerMessage) => void;
}

// No message until a "connected" message is actually received - an absent
// protocol version only matters once we know we're talking to a backend.
const initialState: CompatibilityResult = {
  features: new Set(),
  message: undefined,
  status: "unknown",
};

export const useCompatibilityStore = create<CompatibilityStore>((set) => ({
  ...initialState,
  handleServerMessage: (message) => {
    if (message.type !== "connected") {
      return;
    }

    set(resolveCompatibility(message.payload.protocolVersion));
  },
}));
