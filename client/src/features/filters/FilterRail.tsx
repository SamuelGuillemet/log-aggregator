import { SELECTABLE_LOG_LEVELS } from "@log-aggregator/shared";
import { CaseSensitive, Regex, Search, SlidersHorizontal, X } from "lucide-react";
import { useState } from "react";
import { levelColor } from "@/features/logs/levelStyles";
import { splitTerms } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useFilterStore } from "@/state/filterStore";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/ui/popover";
import { FavoritesMenu } from "./FavoritesMenu";

interface TermInputs {
  includeAny: string;
  includeAll: string;
  excludeAny: string;
}

export function FilterRail() {
  const filter = useFilterStore((state) => state.filter);
  const revision = useFilterStore((state) => state.revision);
  const setFilter = useFilterStore((state) => state.setFilter);
  const toggleLevel = useFilterStore((state) => state.toggleLevel);
  const clear = useFilterStore((state) => state.clear);
  const [terms, setTerms] = useState<TermInputs>(() => termsOf(filter));
  const [syncedRevision, setSyncedRevision] = useState(revision);

  // Re-derive the raw text only when the filter was replaced from outside this rail,
  // so typing "a, " is never normalised out from under the caret.
  if (revision !== syncedRevision) {
    setSyncedRevision(revision);
    setTerms(termsOf(filter));
  }

  const termCount = filter.includeAny.length + filter.includeAll.length + filter.excludeAny.length;
  const isActive = termCount > 0 || filter.levels.length > 0 || filter.text.length > 0;

  function updateTerms(key: keyof TermInputs, value: string) {
    setTerms((current) => ({ ...current, [key]: value }));
    setFilter({ [key]: splitTerms(value) });
  }

  return (
    <div className="flex items-center gap-2 border-b border-line bg-panel px-3 py-1.5">
      <div className="relative flex min-w-56 flex-1 items-center">
        <Search size={13} className="pointer-events-none absolute left-2.5 text-mute" />
        <Input
          className="data h-7 rounded-sm border-line bg-surface pl-8 text-[12px]"
          value={filter.text}
          onChange={(event) => setFilter({ text: event.target.value })}
          placeholder="Search every line"
          aria-label="Search every line"
        />
      </div>

      <div className="flex gap-1">
        <RailToggle
          active={filter.regex}
          label="Read the search as a regular expression"
          onClick={() => setFilter({ regex: !filter.regex })}
        >
          <Regex size={13} />
        </RailToggle>
        <RailToggle
          active={filter.caseSensitive}
          label="Match case"
          onClick={() => setFilter({ caseSensitive: !filter.caseSensitive })}
        >
          <CaseSensitive size={13} />
        </RailToggle>
      </div>

      {/* The level chips double as the colour legend for the whole table. */}
      <div className="flex gap-0.5" role="group" aria-label="Log levels">
        {SELECTABLE_LOG_LEVELS.map((level) => {
          const active = filter.levels.includes(level);

          return (
            <button
              key={level}
              type="button"
              aria-pressed={active}
              onClick={() => toggleLevel(level)}
              className={cn(
                "data h-7 rounded-sm border px-2 text-[10px] font-semibold tracking-widest transition-colors",
                active ? "border-transparent" : "border-line text-mute hover:text-fg",
              )}
              style={
                active
                  ? {
                      background: `color-mix(in srgb, ${levelColor(level)} 18%, transparent)`,
                      color: levelColor(level),
                    }
                  : undefined
              }
            >
              {level}
            </button>
          );
        })}
      </div>

      <Popover>
        <PopoverTrigger
          render={
            <Button
              variant="outline"
              size="sm"
              className="data h-7 gap-1.5 rounded-sm px-2 text-[11px]"
            />
          }
        >
          <SlidersHorizontal size={13} />
          Terms
          {termCount > 0 && <span className="text-fg">{termCount}</span>}
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 space-y-2.5 p-3">
          <TermField
            label="Has any"
            hint="matches a line containing at least one"
            placeholder="timeout, refused"
            value={terms.includeAny}
            onChange={(value) => updateTerms("includeAny", value)}
          />
          <TermField
            label="Has all"
            hint="matches a line containing every one"
            placeholder="order, retry"
            value={terms.includeAll}
            onChange={(value) => updateTerms("includeAll", value)}
          />
          <TermField
            label="Has none"
            hint="hides a line containing any of these"
            placeholder="healthcheck"
            value={terms.excludeAny}
            onChange={(value) => updateTerms("excludeAny", value)}
          />
        </PopoverContent>
      </Popover>

      <FavoritesMenu />

      {isActive && (
        <Button
          variant="ghost"
          size="sm"
          className="data h-7 gap-1 rounded-sm px-2 text-[11px]"
          onClick={clear}
          title="Clear every filter"
        >
          <X size={13} />
          Clear
        </Button>
      )}
    </div>
  );
}

interface RailToggleProps {
  active: boolean;
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}

function RailToggle({ active, children, label, onClick }: RailToggleProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "flex size-7 items-center justify-center rounded-sm border transition-colors",
        active ? "border-ring bg-accent text-fg" : "border-line text-mute hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}

interface TermFieldProps {
  hint: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}

function TermField({ hint, label, placeholder, value, onChange }: TermFieldProps) {
  return (
    <label className="block space-y-1">
      <span className="label-micro">{label}</span>
      <Input
        className="data h-7 rounded-sm border-line bg-surface text-[12px]"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => event.stopPropagation()}
        placeholder={placeholder}
        aria-label={`${label}: ${hint}`}
      />
      <span className="block text-[11px] text-mute">Comma separated · {hint}</span>
    </label>
  );
}

function termsOf(filter: { includeAny: string[]; includeAll: string[]; excludeAny: string[] }) {
  return {
    excludeAny: filter.excludeAny.join(", "),
    includeAll: filter.includeAll.join(", "),
    includeAny: filter.includeAny.join(", "),
  };
}
