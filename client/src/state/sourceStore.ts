import type { SourceOptions, SourceSelection } from "@log-aggregator/shared";
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SourceStore {
  options: SourceOptions;
  /** What the form currently shows. */
  draft: SourceSelection;
  /**
   * What the user asked to stream. Held client-side so a reconnect can restore the
   * subscription declaratively instead of racing v1's `wasConnectedRef` heuristic.
   */
  active: SourceSelection | undefined;
  setDraft: (patch: Partial<SourceSelection>) => void;
  setOptions: (options: SourceOptions) => void;
  startStream: () => SourceSelection;
  stopStream: () => void;
}

function today(): string {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");

  return `${now.getFullYear()}-${month}-${day}`;
}

export const useSourceStore = create<SourceStore>()(
  persist(
    (set, get) => ({
      active: undefined,
      draft: { date: today(), project: "", sourceId: "" },
      options: { sources: [] },
      setDraft: (patch) => set((state) => ({ draft: { ...state.draft, ...patch } })),
      setOptions: (options) =>
        set((state) => ({
          draft: {
            ...state.draft,
            sourceId: options.sources.some((source) => source.id === state.draft.sourceId)
              ? state.draft.sourceId
              : (options.sources[0]?.id ?? ""),
          },
          options,
        })),
      startStream: () => {
        const active = { ...get().draft, project: get().draft.project.trim() };

        set({ active });

        return active;
      },
      stopStream: () => set({ active: undefined }),
    }),
    {
      // The date is intentionally not persisted: yesterday's date is never what you
      // want on the next launch.
      name: "log-aggregator:source-selection",
      partialize: (state) => ({
        draft: { date: "", project: state.draft.project, sourceId: state.draft.sourceId },
      }),
      merge: (persisted, current) => {
        const draft = (persisted as { draft?: Partial<SourceSelection> } | undefined)?.draft;

        return {
          ...current,
          draft: {
            date: current.draft.date,
            project: draft?.project ?? current.draft.project,
            sourceId: draft?.sourceId ?? current.draft.sourceId,
          },
        };
      },
      version: 1,
    },
  ),
);
