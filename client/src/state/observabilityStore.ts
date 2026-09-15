import {
  EMPTY_OBSERVABILITY_STATS,
  type ObservabilityScope,
  type ObservabilityStats,
  type UrlKeyStats,
} from "@log-aggregator/shared";
import { create } from "zustand";

interface ObservabilityStore {
  stats: ObservabilityStats;
  /** Every tracked `method`+`url` key, busiest first, for the scope picker. */
  urlKeys: UrlKeyStats[];
  /** `undefined` means "whole stream"; otherwise stats are scoped to one key. */
  scope: ObservabilityScope | undefined;
  /** Distinguishes "no data yet" from "feature not configured for this source". */
  received: boolean;
  apply: (stats: ObservabilityStats, urlKeys: UrlKeyStats[]) => void;
  setScope: (scope: ObservabilityScope | undefined) => void;
  reset: () => void;
}

export const useObservabilityStore = create<ObservabilityStore>((set) => ({
  apply: (stats, urlKeys) => set({ received: true, stats, urlKeys }),
  received: false,
  reset: () =>
    set({ received: false, scope: undefined, stats: EMPTY_OBSERVABILITY_STATS, urlKeys: [] }),
  scope: undefined,
  setScope: (scope) => set({ scope }),
  stats: EMPTY_OBSERVABILITY_STATS,
  urlKeys: [],
}));
