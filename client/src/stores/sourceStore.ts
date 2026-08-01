import type {
  ServerMessage,
  SourceOptions,
  SourceSelection,
} from "@log-aggregator/shared";
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SourceStore {
  options: SourceOptions;
  selection: SourceSelection;
  setSelection: (selection: Partial<SourceSelection>) => void;
  handleServerMessage: (message: ServerMessage) => void;
}

const emptyOptions: SourceOptions = {
  countriesByEnvironment: {},
  environments: [],
  tiers: ["back", "front"],
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
        country: "",
        date: defaultLogDate,
        environment: "",
        project: "",
        tier: "back",
      },
      setSelection: (selection) =>
        set((state) => {
          const nextSelection = { ...state.selection, ...selection };

          if (
            selection.environment &&
            selection.environment !== state.selection.environment
          ) {
            nextSelection.country =
              state.options.countriesByEnvironment[
                selection.environment
              ]?.[0] ?? "";
          }

          return { selection: nextSelection };
        }),
      handleServerMessage: (message) =>
        set((state) => {
          if (message.type !== "connected") {
            return state;
          }

          const options = message.payload.options;
          const environment = options.environments.includes(
            state.selection.environment,
          )
            ? state.selection.environment
            : (options.environments[0] ?? "");
          const countries = options.countriesByEnvironment[environment] ?? [];
          const country = countries.includes(state.selection.country)
            ? state.selection.country
            : (countries[0] ?? "");
          const tier = options.tiers.includes(state.selection.tier)
            ? state.selection.tier
            : (options.tiers[0] ?? "back");

          return {
            options,
            selection: {
              country,
              date: state.selection.date,
              environment,
              project: state.selection.project,
              tier,
            },
          };
        }),
    }),
    {
      name: "log-aggregator-source-selection",
      partialize: (state) => ({
        selection: {
          country: state.selection.country,
          environment: state.selection.environment,
          project: state.selection.project,
          tier: state.selection.tier,
        },
      }),
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
