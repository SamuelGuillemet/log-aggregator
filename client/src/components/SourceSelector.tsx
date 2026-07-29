import type { ClientMessage, SourceSelection } from "@log-aggregator/shared";
import { Play, Square } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useLogStore } from "@/stores/logStore";
import { useSourceStore } from "@/stores/sourceStore";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

interface SourceSelectorProps {
  sendMessage: (message: ClientMessage) => void;
}

export function SourceSelector({ sendMessage }: SourceSelectorProps) {
  const { clear, connected, sources } = useLogStore(
    useShallow((state) => ({
      clear: state.clear,
      connected: state.connected,
      sources: state.sources,
    })),
  );
  const { options, selection, setSelection } = useSourceStore(
    useShallow((state) => ({
      options: state.options,
      selection: state.selection,
      setSelection: state.setSelection,
    })),
  );
  const countries = options.countriesByEnvironment[selection.environment] ?? [];
  const project = selection.project.trim();
  const canStartStream = Boolean(
    connected &&
      selection.environment &&
      selection.country &&
      project &&
      selection.date,
  );

  function updateSelection(nextSelection: Partial<SourceSelection>) {
    clear();
    setSelection(nextSelection);
  }

  function startStream() {
    clear();
    sendMessage({
      type: "subscribe",
      payload: { ...selection, project },
    });
  }

  function stopStream() {
    clear();
    sendMessage({ type: "unsubscribe" });
  }

  return (
    <section
      className="gap-2 grid min-[1100px]:grid-cols-[minmax(280px,0.85fr)_minmax(420px,1.15fr)] bg-card/75 p-2 border border-[#b8b1a2]/75 rounded-lg"
      aria-label="Source selection"
    >
      <div className="gap-2 grid grid-cols-1 min-[760px]:grid-cols-2">
        <div className="min-[760px]:col-span-2 font-bold text-[#7b3025] text-xs uppercase">
          Location
        </div>
        <Label className="gap-1 grid text-muted-foreground text-xs">
          <span>Environment</span>
          <Select
            value={selection.environment}
            onValueChange={(environment) => updateSelection({ environment })}
          >
            <SelectTrigger aria-label="Environment">
              <SelectValue placeholder="Environment" />
            </SelectTrigger>
            <SelectContent>
              {options.environments.map((environment) => (
                <SelectItem key={environment} value={environment}>
                  {environment}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Label>
        <Label className="gap-1 grid text-muted-foreground text-xs">
          <span>Country</span>
          <Select
            value={selection.country}
            onValueChange={(country) => updateSelection({ country })}
          >
            <SelectTrigger aria-label="Country">
              <SelectValue placeholder="Country" />
            </SelectTrigger>
            <SelectContent>
              {countries.map((country) => (
                <SelectItem key={country} value={country}>
                  {country}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Label>
      </div>
      <div className="items-end gap-2 grid grid-cols-1 min-[760px]:grid-cols-[minmax(180px,1fr)_150px_140px_auto]">
        <div className="min-[760px]:col-span-4 font-bold text-[#7b3025] text-xs uppercase">
          Project stream
        </div>
        <Label className="gap-1 grid text-muted-foreground text-xs">
          <span>Project</span>
          <Input
            aria-label="Project name"
            autoComplete="off"
            placeholder="ACCOUNTING-API"
            spellCheck={false}
            value={selection.project}
            onChange={(event) =>
              updateSelection({ project: event.currentTarget.value })
            }
          />
        </Label>
        <Label className="gap-1 grid text-muted-foreground text-xs">
          <span>Date</span>
          <Input
            aria-label="Log date"
            type="date"
            value={selection.date}
            onChange={(event) =>
              updateSelection({ date: event.currentTarget.value })
            }
          />
        </Label>
        <Label className="gap-1 grid text-muted-foreground text-xs">
          <span>Side</span>
          <Select
            value={selection.tier}
            onValueChange={(tier) =>
              updateSelection({ tier: tier as SourceSelection["tier"] })
            }
          >
            <SelectTrigger aria-label="Application side">
              <SelectValue placeholder="Side" />
            </SelectTrigger>
            <SelectContent>
              {options.tiers.map((tier) => (
                <SelectItem key={tier} value={tier}>
                  {tier === "back" ? "Back project" : "Front project"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Label>
        <div className="flex gap-1.5 max-[759px]:pt-1">
          <Button
            type="button"
            disabled={!canStartStream}
            onClick={startStream}
            title="Start log streaming for this project"
          >
            <Play size={16} />
            Start stream
          </Button>
          <Button
            variant="outline"
            type="button"
            disabled={sources.length === 0}
            onClick={stopStream}
            title="Stop current log stream"
          >
            <Square size={16} />
            Stop stream
          </Button>
        </div>
      </div>
    </section>
  );
}
