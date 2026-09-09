import type { LogFilter } from "@log-aggregator/shared";
import { CaseSensitive, ChevronDown, Regex, Save, Search, Star, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { LOG_LEVELS } from "@/constants/log-levels";
import { cn } from "@/lib/utils";
import { useFavoritesStore } from "@/stores/favoritesStore";
import { toggleLevel, useLogStore } from "@/stores/logStore";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { Input } from "./ui/input";

function parseTerms(value: string): string[] {
  return value
    .split(",")
    .map((term) => term.trim())
    .filter(Boolean);
}

function sameTerms(a: string[], b: string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }

  return a.every((term, index) => term === b[index]);
}

export function FilterPanel() {
  const { filter, setFilter } = useLogStore(
    useShallow((state) => ({
      filter: state.filter,
      setFilter: state.setFilter,
    })),
  );
  const { deleteFavorite, favorites, saveFavorite } = useFavoritesStore(
    useShallow((state) => ({
      deleteFavorite: state.deleteFavorite,
      favorites: state.favorites,
      saveFavorite: state.saveFavorite,
    })),
  );
  const [favoriteName, setFavoriteName] = useState("");
  const [favoritesOpen, setFavoritesOpen] = useState(false);
  const [includeAnyInput, setIncludeAnyInput] = useState(filter.includeAny.join(", "));
  const [includeAllInput, setIncludeAllInput] = useState(filter.includeAll.join(", "));
  const [excludeAnyInput, setExcludeAnyInput] = useState(filter.excludeAny.join(", "));

  useEffect(() => {
    if (!sameTerms(parseTerms(includeAnyInput), filter.includeAny)) {
      setIncludeAnyInput(filter.includeAny.join(", "));
    }
  }, [filter.includeAny, includeAnyInput]);

  useEffect(() => {
    if (!sameTerms(parseTerms(includeAllInput), filter.includeAll)) {
      setIncludeAllInput(filter.includeAll.join(", "));
    }
  }, [filter.includeAll, includeAllInput]);

  useEffect(() => {
    if (!sameTerms(parseTerms(excludeAnyInput), filter.excludeAny)) {
      setExcludeAnyInput(filter.excludeAny.join(", "));
    }
  }, [filter.excludeAny, excludeAnyInput]);

  function handleSaveFavorite() {
    const name = favoriteName.trim();

    if (!name) {
      return;
    }

    saveFavorite(name, filter);
    setFavoriteName("");
  }

  function handleApplyFavorite(favoriteFilter: LogFilter) {
    setFilter(favoriteFilter);
    setFavoritesOpen(false);
  }

  return (
    <details className="group atelier-card rounded-lg p-2" aria-label="Log filters" open>
      <summary className="atelier-section-title flex cursor-pointer list-none items-center gap-2 text-primary select-none">
        <ChevronDown size={16} className="transition-transform group-open:rotate-180" />
        <span>Filters</span>
        <div className="ml-auto flex items-center gap-2">
          <DropdownMenu modal={false} open={favoritesOpen} onOpenChange={setFavoritesOpen}>
            <DropdownMenuTrigger
              render={
                <Button variant="outline" size="sm" onClick={(event) => event.preventDefault()} />
              }
            >
              <Star size={16} />
              Favorites
              {favorites.length > 0 && <Badge variant="secondary">{favorites.length}</Badge>}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72 space-y-2 p-2">
              <div className="flex items-center gap-1.5">
                <Input
                  className="flex-1"
                  value={favoriteName}
                  onChange={(event) => setFavoriteName(event.target.value)}
                  onKeyDown={(event) => event.stopPropagation()}
                  placeholder="Favorite name"
                />
                <Button
                  variant="outline"
                  type="button"
                  disabled={!favoriteName.trim()}
                  onClick={handleSaveFavorite}
                  title="Save current filter as favorite"
                >
                  <Save size={16} />
                  Save
                </Button>
              </div>
              {favorites.length === 0 ? (
                <p className="px-1 py-1 text-xs text-muted-foreground">No saved favorites yet.</p>
              ) : (
                <div className="max-h-64 space-y-1 overflow-auto">
                  {favorites.map((favorite) => (
                    <div
                      key={favorite.id}
                      className="flex items-center gap-1 rounded-md bg-muted/40"
                    >
                      <Button
                        variant="ghost"
                        className="min-w-0 flex-1 justify-start"
                        type="button"
                        onClick={() => handleApplyFavorite(favorite.filter)}
                        title={`Apply favorite "${favorite.name}"`}
                      >
                        <span className="truncate">{favorite.name}</span>
                      </Button>
                      <Button
                        variant="destructive"
                        size="icon-sm"
                        type="button"
                        onClick={() => deleteFavorite(favorite.id)}
                        title={`Delete favorite "${favorite.name}"`}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </summary>
      <div className="flex flex-wrap items-center gap-2 p-2 max-md:flex-col max-md:items-stretch">
        <label className="flex min-w-[min(420px,100%)] items-center gap-1.5">
          <Search size={16} />
          <Input
            className="min-w-48 flex-1"
            value={filter.text}
            onChange={(event) => setFilter({ text: event.target.value })}
            placeholder="Filter text"
          />
        </label>
        <div className="ml-1.5 flex gap-1.5">
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
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Log levels">
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
              onClick={() => setFilter({ levels: toggleLevel(filter.levels, level) })}
            >
              {level}
            </Button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 p-2 pt-0 max-md:flex-col max-md:items-stretch">
        <label className="flex min-w-[min(240px,100%)] flex-1 items-center gap-1.5">
          <span className="text-xs whitespace-nowrap text-muted-foreground">Has any</span>
          <Input
            className="flex-1"
            value={includeAnyInput}
            onChange={(event) => {
              const { value } = event.target;

              setIncludeAnyInput(value);
              setFilter({ includeAny: parseTerms(value) });
            }}
            placeholder="term A, term B"
          />
        </label>
        <label className="flex min-w-[min(240px,100%)] flex-1 items-center gap-1.5">
          <span className="text-xs whitespace-nowrap text-muted-foreground">Has all</span>
          <Input
            className="flex-1"
            value={includeAllInput}
            onChange={(event) => {
              const { value } = event.target;

              setIncludeAllInput(value);
              setFilter({ includeAll: parseTerms(value) });
            }}
            placeholder="term A, term B"
          />
        </label>
        <label className="flex min-w-[min(240px,100%)] flex-1 items-center gap-1.5">
          <span className="text-xs whitespace-nowrap text-muted-foreground">Has not</span>
          <Input
            className="flex-1"
            value={excludeAnyInput}
            onChange={(event) => {
              const { value } = event.target;

              setExcludeAnyInput(value);
              setFilter({ excludeAny: parseTerms(value) });
            }}
            placeholder="term C"
          />
        </label>
      </div>
    </details>
  );
}
