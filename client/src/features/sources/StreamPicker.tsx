import { isCompleteSelection, type LogSourceOption } from "@log-aggregator/shared";
import { ChevronDown, Play, Square } from "lucide-react";
import { useState } from "react";
import { useConnectionStore } from "@/state/connectionStore";
import { useSourceStore } from "@/state/sourceStore";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/ui/popover";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/ui/select";

interface StreamPickerProps {
  onStart: () => void;
  onStop: () => void;
}

/**
 * Choosing a stream is a once-per-session act, so it lives behind the identity
 * label in the status bar rather than occupying a permanent band above the logs.
 */
export function StreamPicker({ onStart, onStop }: StreamPickerProps) {
  const [open, setOpen] = useState(false);
  const connected = useConnectionStore((state) => state.connected);
  const options = useSourceStore((state) => state.options);
  const draft = useSourceStore((state) => state.draft);
  const active = useSourceStore((state) => state.active);
  const setDraft = useSourceStore((state) => state.setDraft);

  const selectedSource = options.sources.find((source) => source.id === draft.sourceId);
  const canStart = connected && isCompleteSelection(draft);
  const groups = groupByGroup(options.sources);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label="Choose the source, application and date to stream"
            className="data flex h-7 items-center gap-1.5 rounded-sm border border-line px-2 text-[12px] hover:border-ring"
          />
        }
      >
        {active ? (
          <>
            <span className="text-fg">{active.project}</span>
            <span className="text-mute">{active.date}</span>
          </>
        ) : (
          <span className="text-mute">Choose a stream</span>
        )}
        <ChevronDown size={12} className="text-mute" />
      </PopoverTrigger>

      <PopoverContent align="start" className="w-80 space-y-3 p-3">
        <label className="block space-y-1">
          <span className="label-micro">Source</span>
          <Select
            disabled={Boolean(active)}
            value={draft.sourceId}
            onValueChange={(sourceId: string | null) => setDraft({ sourceId: sourceId ?? "" })}
          >
            <SelectTrigger
              aria-label="Log source"
              className={"data h-7 rounded-sm border-line bg-surface text-[12px]"}
            >
              <SelectValue placeholder="Choose a source">{selectedSource?.name}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {[...groups].map(([group, groupSources]) => (
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
        </label>

        <label className="block space-y-1">
          <span className="label-micro">Application</span>
          <Input
            aria-label="Application name"
            autoComplete="off"
            disabled={Boolean(active)}
            list="source-applications"
            placeholder="APP-001"
            spellCheck={false}
            className={"data h-7 rounded-sm border-line bg-surface text-[12px]"}
            value={draft.project}
            onChange={(event) => setDraft({ project: event.currentTarget.value })}
          />
          <datalist id="source-applications">
            {(selectedSource?.applications ?? []).map((application) => (
              <option key={application} value={application}>
                {application}
              </option>
            ))}
          </datalist>
        </label>

        <label className="block space-y-1">
          <span className="label-micro">Date</span>
          <Input
            aria-label="Log date"
            disabled={Boolean(active)}
            type="date"
            className={"data h-7 rounded-sm border-line bg-surface text-[12px]"}
            value={draft.date}
            onChange={(event) => setDraft({ date: event.currentTarget.value })}
          />
        </label>

        {active ? (
          <Button
            variant="outline"
            className="h-7 w-full gap-1.5 rounded-sm text-[12px]"
            onClick={() => {
              onStop();
              setOpen(false);
            }}
          >
            <Square size={12} />
            Stop stream
          </Button>
        ) : (
          <Button
            className="h-7 w-full gap-1.5 rounded-sm text-[12px]"
            disabled={!canStart}
            onClick={() => {
              onStart();
              setOpen(false);
            }}
          >
            <Play size={12} />
            Start stream
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

function groupByGroup(sources: LogSourceOption[]): Map<string, LogSourceOption[]> {
  const groups = new Map<string, LogSourceOption[]>();

  for (const source of sources) {
    const existing = groups.get(source.group);

    if (existing) {
      existing.push(source);
    } else {
      groups.set(source.group, [source]);
    }
  }

  return groups;
}
