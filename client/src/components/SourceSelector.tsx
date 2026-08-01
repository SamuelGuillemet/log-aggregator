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
  const { connected, sources } = useLogStore(
    useShallow((state) => ({
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
  const streaming = sources.length > 0;
  const canStartStream = Boolean(
    connected &&
      selection.environment &&
      selection.country &&
      project &&
      selection.date,
  );

  function updateSelection(nextSelection: Partial<SourceSelection>) {
    if (streaming) {
      return;
    }

    setSelection(nextSelection);
  }

  function startStream() {
    sendMessage({
      type: "subscribe",
      payload: { ...selection, project },
    });
  }

  function stopStream() {
    sendMessage({ type: "unsubscribe" });
  }

  return (
    <section
      className="gap-2 grid min-[1100px]:grid-cols-[minmax(280px,0.85fr)_minmax(420px,1.15fr)] p-2 rounded-lg atelier-card"
      aria-label="Source selection"
    >
      <div className="gap-2 grid grid-cols-1 min-[760px]:grid-cols-2">
        <div className="min-[760px]:col-span-2 text-primary atelier-section-title">
          Location
        </div>
        <Label className="gap-1 grid text-muted-foreground text-xs">
          <span>Environment</span>
          <Select
            disabled={streaming}
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
            disabled={streaming}
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
        <div className="min-[760px]:col-span-4 text-primary atelier-section-title">
          Project stream
        </div>
        <Label className="gap-1 grid text-muted-foreground text-xs">
          <span>Project</span>
          <Input
            aria-label="Project name"
            autoComplete="off"
            disabled={streaming}
            placeholder="Project name"
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
            disabled={streaming}
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
            disabled={streaming}
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
          {streaming ? (
            <Button
              variant="outline"
              type="button"
              onClick={stopStream}
              title="Stop current log stream"
            >
              <Square size={16} />
              Stop stream
            </Button>
          ) : (
            <Button
              type="button"
              disabled={!canStartStream}
              onClick={startStream}
              title="Start log streaming for this project"
            >
              <Play size={16} />
              Start stream
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
