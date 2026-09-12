import type { LogFilter } from "@log-aggregator/shared";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface FavoriteFilter {
  id: string;
  name: string;
  filter: LogFilter;
}

interface FavoritesStore {
  favorites: FavoriteFilter[];
  save: (name: string, filter: LogFilter) => void;
  remove: (id: string) => void;
}

export const useFavoritesStore = create<FavoritesStore>()(
  persist(
    (set) => ({
      favorites: [],
      remove: (id) =>
        set((state) => ({ favorites: state.favorites.filter((entry) => entry.id !== id) })),
      save: (name, filter) =>
        set((state) => ({
          favorites: [
            ...state.favorites.filter((entry) => entry.name !== name),
            { filter, id: crypto.randomUUID(), name },
          ],
        })),
    }),
    { name: "log-aggregator:favorite-filters" },
  ),
);
