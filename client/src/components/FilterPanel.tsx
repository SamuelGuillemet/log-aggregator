import { CaseSensitive, Regex, Search } from "lucide-react";
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
    <section
      className="flex flex-col gap-3 p-2 rounded-lg atelier-card"
      aria-label="Log filters"
    >
      <div className="text-primary atelier-section-title">Filters</div>
      <div className="flex max-md:flex-col flex-wrap items-center max-md:items-stretch">
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
                  level === "WARN" &&
                  "border-l-4 border-l-[#be8b2f]",
                filter.levels.includes(level) &&
                  (level === "ERROR" || level === "FATAL") &&
                  "border-l-4 border-l-destructive",
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
    </section>
  );
}
