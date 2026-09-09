import type { ServerMessage, SourceOptions, SourceSelection } from "@log-aggregator/shared";
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SourceStore {
  options: SourceOptions;
  selection: SourceSelection;
  setSelection: (selection: Partial<SourceSelection>) => void;
  handleServerMessage: (message: ServerMessage) => void;
}

const emptyOptions: SourceOptions = {
  sources: [],
};

const defaultLogDate = new Date().toISOString().slice(0, 10);

type PersistedSourceStore = {
  selection: Omit<SourceSelection, "date">;
};

export const useSourceStore = create<SourceStore>()(
  persist(
    (set) => ({
      options: emptyOptions,
      selection: {
        date: defaultLogDate,
        project: "",
        sourceId: "",
      },
      setSelection: (selection) =>
        set((state) => ({ selection: { ...state.selection, ...selection } })),
      handleServerMessage: (message) =>
        set((state) => {
          if (message.type !== "connected" && message.type !== "source-options") {
            return state;
          }

          const options = message.type === "connected" ? message.payload.options : message.payload;

          if (!Array.isArray(options.sources)) {
            return state;
          }

          const sourceId = options.sources.some((source) => source.id === state.selection.sourceId)
            ? state.selection.sourceId
            : (options.sources[0]?.id ?? "");

          return {
            options,
            selection: {
              date: state.selection.date,
              project: state.selection.project,
              sourceId,
            },
          };
        }),
    }),
    {
      name: "log-aggregator-source-selection",
      partialize: (state) => ({
        selection: {
          project: state.selection.project,
          sourceId: state.selection.sourceId,
        },
      }),
      version: 2,
      migrate: (persistedState) => {
        const legacySelection = (
          persistedState as { selection?: { project?: unknown } } | undefined
        )?.selection;

        return {
          selection: {
            project: typeof legacySelection?.project === "string" ? legacySelection.project : "",
            sourceId: "",
          },
        };
      },
      merge: (persistedState, currentState) => ({
        ...currentState,
        selection: {
          ...currentState.selection,
          ...(persistedState as PersistedSourceStore | undefined)?.selection,
        },
      }),
    },
  ),
);
