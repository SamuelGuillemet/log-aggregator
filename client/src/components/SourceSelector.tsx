import type { ClientMessage, SourceSelection } from "@log-aggregator/shared";
import { ChevronDown, Play, Square } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useLogStore } from "@/stores/logStore";
import { useSourceStore } from "@/stores/sourceStore";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
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
  const selectedSource = options.sources.find((source) => source.id === selection.sourceId);
  const applications = selectedSource?.applications ?? [];
  const sourceGroups = options.sources.reduce((groups, source) => {
    const group = groups.get(source.group) ?? [];
    group.push(source);
    groups.set(source.group, group);
    return groups;
  }, new Map<string, typeof options.sources>());
  const project = selection.project.trim();
  const streaming = sources.length > 0;
  const canStartStream = Boolean(connected && selection.sourceId && project && selection.date);

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
    <details className="group atelier-card rounded-lg p-2" aria-label="Source selection" open>
      <summary className="atelier-section-title flex cursor-pointer list-none items-center gap-2 text-primary select-none">
        <ChevronDown size={16} className="transition-transform group-open:rotate-180" />
        <span>Source Selection</span>
      </summary>
      <div className="grid grid-cols-1 items-end gap-2 p-2 min-[760px]:grid-cols-[minmax(220px,1fr)_minmax(220px,1fr)_150px_auto]">
        <Label className="grid gap-1 text-xs text-muted-foreground">
          <span>Source</span>
          <Select
            disabled={streaming}
            value={selection.sourceId}
            onValueChange={(sourceId: string | null) =>
              updateSelection({ sourceId: sourceId ?? "" })
            }
          >
            <SelectTrigger aria-label="Log source">
              <SelectValue placeholder="Choose a source">{selectedSource?.name}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {[...sourceGroups].map(([group, groupSources]) => (
                <SelectGroup key={group}>
                  <SelectLabel>{group}</SelectLabel>
                  {groupSources.map((source) => (
                    <SelectItem key={source.id} value={source.id}>
                      {source.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </Label>
        <Label className="grid gap-1 text-xs text-muted-foreground">
          <span>Application</span>
          <Input
            aria-label="Application name"
            autoComplete="off"
            disabled={streaming}
            list="source-applications"
            placeholder="Application name"
            spellCheck={false}
            value={selection.project}
            onChange={(event) => updateSelection({ project: event.currentTarget.value })}
          />
          <datalist id="source-applications">
            {applications.map((application) => (
              <option key={application} value={application}>
                {application}
              </option>
            ))}
          </datalist>
        </Label>
        <Label className="grid gap-1 text-xs text-muted-foreground">
          <span>Date</span>
          <Input
            aria-label="Log date"
            disabled={streaming}
            type="date"
            value={selection.date}
            onChange={(event) => updateSelection({ date: event.currentTarget.value })}
          />
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
              title="Start log streaming for this application"
            >
              <Play size={16} />
              Start stream
            </Button>
          )}
        </div>
      </div>
    </details>
  );
}
