import type { LogFilter } from "@log-aggregator/shared";
import { Star, Trash2 } from "lucide-react";
import { useState } from "react";
import { useFavoritesStore } from "@/state/favoritesStore";
import { useFilterStore } from "@/state/filterStore";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/ui/popover";

export function FavoritesMenu() {
  const favorites = useFavoritesStore((state) => state.favorites);
  const saveFavorite = useFavoritesStore((state) => state.save);
  const removeFavorite = useFavoritesStore((state) => state.remove);
  const replaceFilter = useFilterStore((state) => state.replaceFilter);
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);

  function handleSave() {
    const trimmed = name.trim();

    if (trimmed) {
      saveFavorite(trimmed, useFilterStore.getState().filter);
      setName("");
    }
  }

  function handleApply(filter: LogFilter) {
    replaceFilter(filter);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className="data h-7 gap-1.5 rounded-sm px-2 text-[11px]"
            title="Saved filters"
          />
        }
      >
        <Star size={13} />
        {favorites.length > 0 && <span className="text-fg">{favorites.length}</span>}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-2 p-3">
        <span className="label-micro">Save this filter</span>
        <div className="flex items-center gap-1.5">
          <Input
            className="data h-7 flex-1 rounded-sm border-line bg-surface text-[12px]"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => event.stopPropagation()}
            placeholder="Name it"
            aria-label="Filter name"
          />
          <Button
            variant="outline"
            className="h-7 rounded-sm px-2 text-[11px]"
            disabled={!name.trim()}
            onClick={handleSave}
          >
            Save
          </Button>
        </div>

        {favorites.length === 0 ? (
          <p className="text-[11px] text-mute">Saved filters land here, ready to reapply.</p>
        ) : (
          <div className="max-h-64 space-y-0.5 overflow-auto">
            {favorites.map((favorite) => (
              <div key={favorite.id} className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  className="data h-7 min-w-0 flex-1 justify-start rounded-sm px-2 text-[12px]"
                  onClick={() => handleApply(favorite.filter)}
                  title={`Apply "${favorite.name}"`}
                >
                  <span className="truncate">{favorite.name}</span>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 text-mute hover:text-level-error"
                  onClick={() => removeFavorite(favorite.id)}
                  title={`Delete "${favorite.name}"`}
                  aria-label={`Delete filter ${favorite.name}`}
                >
                  <Trash2 size={13} />
                </Button>
              </div>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
