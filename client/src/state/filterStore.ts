import { EMPTY_FILTER, type LogFilter, type LogLevel } from "@log-aggregator/shared";
import { create } from "zustand";

interface FilterStore {
  filter: LogFilter;
  /**
   * Bumped only when the filter is replaced wholesale (favorite applied, cleared).
   * Lets text inputs keep their raw value while typing and re-sync exactly once when
   * the change came from elsewhere; v1 needed three comparison effects for this.
   */
  revision: number;
  setFilter: (patch: Partial<LogFilter>) => void;
  replaceFilter: (filter: LogFilter) => void;
  toggleLevel: (level: LogLevel) => void;
  clear: () => void;
}

export const useFilterStore = create<FilterStore>((set) => ({
  clear: () => set((state) => ({ filter: EMPTY_FILTER, revision: state.revision + 1 })),
  filter: EMPTY_FILTER,
  replaceFilter: (filter) => set((state) => ({ filter, revision: state.revision + 1 })),
  revision: 0,
  setFilter: (patch) => set((state) => ({ filter: { ...state.filter, ...patch } })),
  toggleLevel: (level) =>
    set((state) => ({
      filter: {
        ...state.filter,
        levels: state.filter.levels.includes(level)
          ? state.filter.levels.filter((candidate) => candidate !== level)
          : [...state.filter.levels, level],
      },
    })),
}));
