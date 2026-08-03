import { CaseSensitive, ChevronDown, Regex, Search } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { LOG_LEVELS } from "@/constants/log-levels";
import { cn } from "@/lib/utils";
import { toggleLevel, useLogStore } from "@/stores/logStore";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

export function FilterPanel() {
  const { filter, setFilter } = useLogStore(
    useShallow((state) => ({
      filter: state.filter,
      setFilter: state.setFilter,
    })),
  );

  return (
    <details
      className="group p-2 rounded-lg atelier-card"
      aria-label="Log filters"
      open
    >
      <summary className="flex items-center gap-2 text-primary cursor-pointer select-none list-none atelier-section-title">
        <ChevronDown
          size={16}
          className="group-open:rotate-180 transition-transform"
        />
        <span>Filters</span>
      </summary>
      <div className="flex max-md:flex-col flex-wrap items-center max-md:items-stretch gap-2 p-2">
        <label className="flex items-center gap-1.5 min-w-[min(420px,100%)]">
          <Search size={16} />
          <Input
            className="flex-1 min-w-48"
            value={filter.text}
            onChange={(event) => setFilter({ text: event.target.value })}
            placeholder="Filter text"
          />
        </label>
        <div className="flex gap-1.5 ml-1.5">
          <Button
            variant={filter.regex ? "secondary" : "outline"}
            size="icon"
            type="button"
            onClick={() => setFilter({ regex: !filter.regex })}
            title="Regex filter"
          >
            <Regex size={16} />
          </Button>
          <Button
            variant={filter.caseSensitive ? "secondary" : "outline"}
            size="icon"
            type="button"
            onClick={() => setFilter({ caseSensitive: !filter.caseSensitive })}
            title="Case sensitive filter"
          >
            <CaseSensitive size={16} />
          </Button>
        </div>
        <div
          className="flex flex-wrap gap-1.5"
          role="group"
          aria-label="Log levels"
        >
          {LOG_LEVELS.map((level) => (
            <Button
              key={level}
              variant={filter.levels.includes(level) ? "secondary" : "outline"}
              type="button"
              className={cn(
                "min-w-17 font-mono",
                filter.levels.includes(level) &&
                  level === "FATAL" &&
                  "border-l-4 border-l-[#dc2626]",
                filter.levels.includes(level) &&
                  level === "ERROR" &&
                  "border-l-4 border-l-[#ef580c]",
                filter.levels.includes(level) &&
                  level === "WARN" &&
                  "border-l-4 border-l-[#be8b2f]",
                filter.levels.includes(level) &&
                  level === "INFO" &&
                  "border-l-4 border-l-[#0284c7]",
                filter.levels.includes(level) &&
                  level === "DEBUG" &&
                  "border-l-4 border-l-[#6b7280]",
                filter.levels.includes(level) &&
                  level === "TRACE" &&
                  "border-l-4 border-l-[#9ca3af]",
              )}
              onClick={() =>
                setFilter({ levels: toggleLevel(filter.levels, level) })
              }
            >
              {level}
            </Button>
          ))}
        </div>
      </div>
    </details>
  );
}
