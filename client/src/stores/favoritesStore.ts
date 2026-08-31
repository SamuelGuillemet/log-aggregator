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
  saveFavorite: (name: string, filter: LogFilter) => void;
  deleteFavorite: (id: string) => void;
}

export const useFavoritesStore = create<FavoritesStore>()(
  persist(
    (set) => ({
      favorites: [],
      saveFavorite: (name, filter) =>
        set((state) => ({
          favorites: [
            ...state.favorites.filter((favorite) => favorite.name !== name),
            { id: crypto.randomUUID(), name, filter },
          ],
        })),
      deleteFavorite: (id) =>
        set((state) => ({
          favorites: state.favorites.filter((favorite) => favorite.id !== id),
        })),
    }),
    {
      name: "log-aggregator-favorite-filters",
    },
  ),
);
