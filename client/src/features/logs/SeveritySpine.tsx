import type { LogEvent, LogLevel } from "@log-aggregator/shared";
import { type RefObject, useEffect, useState } from "react";
import { levelColor } from "./levelStyles";

/** Fine enough to place a single error, coarse enough to stay cheap to rebuild. */
const SLICE_COUNT = 400;

type Mark = "none" | "error" | "fatal";

const MARK_LEVEL: Record<Exclude<Mark, "none">, LogLevel> = {
  error: "ERROR",
  fatal: "FATAL",
};

interface Run {
  mark: Mark;
  percent: number;
}

interface SeveritySpineProps {
  events: LogEvent[];
  scrollRef: RefObject<HTMLDivElement | null>;
}

/**
 * A minimap of the whole loaded buffer answering one question: where is the bad
 * part. It plots only errors against an empty track -- an earlier version drew every
 * level and became a rainbow barcode with no signal in it. Ordinary scrolling does
 * the same job, so this is hidden from assistive tech rather than being a second
 * thing to tab through.
 */
export function SeveritySpine({ events, scrollRef }: SeveritySpineProps) {
  const [viewport, setViewport] = useState({ height: 0, top: 0 });

  useEffect(() => {
    const element = scrollRef.current;

    if (!element) {
      return;
    }

    const update = () => {
      const { clientHeight, scrollHeight, scrollTop } = element;

      setViewport(
        scrollHeight > 0
          ? { height: (clientHeight / scrollHeight) * 100, top: (scrollTop / scrollHeight) * 100 }
          : { height: 0, top: 0 },
      );
    };

    update();
    element.addEventListener("scroll", update, { passive: true });

    const observer = new ResizeObserver(update);
    observer.observe(element);

    return () => {
      element.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [scrollRef, events.length]);

  const runs = buildRuns(events);
  const markCount = runs.filter((run) => run.mark !== "none").length;

  return (
    <div
      className="relative w-2.5 shrink-0 border-r border-line bg-surface"
      aria-hidden
      title={
        markCount > 0
          ? "Errors across the loaded buffer. Click to jump."
          : "No errors in the loaded buffer."
      }
      style={{ cursor: events.length > 0 ? "pointer" : "default" }}
      onMouseDown={(event) => {
        const element = scrollRef.current;
        const bounds = event.currentTarget.getBoundingClientRect();

        if (element) {
          const fraction = (event.clientY - bounds.top) / bounds.height;
          element.scrollTo({ top: fraction * element.scrollHeight });
        }
      }}
    >
      {runs.map((run, index) => (
        <div
          key={`${run.mark}-${index}`}
          style={{
            background: run.mark === "none" ? undefined : levelColor(MARK_LEVEL[run.mark]),
            height: `${run.percent}%`,
            minHeight: run.mark === "none" ? undefined : "2px",
          }}
        />
      ))}
      <div
        className="pointer-events-none absolute inset-x-0 border-y border-spine-viewport/60 bg-spine-viewport/10"
        style={{ height: `${viewport.height}%`, top: `${viewport.top}%` }}
      />
    </div>
  );
}

function buildRuns(events: LogEvent[]): Run[] {
  if (events.length === 0) {
    return [];
  }

  const sliceCount = Math.min(SLICE_COUNT, events.length);
  const slices = Array.from({ length: sliceCount }, (): Mark => "none");
  const perSlice = events.length / sliceCount;

  for (const [index, event] of events.entries()) {
    if (event.level !== "ERROR" && event.level !== "FATAL") {
      continue;
    }

    const slice = Math.min(sliceCount - 1, Math.floor(index / perSlice));

    // A lone FATAL must never be hidden by a neighbouring ERROR.
    if (event.level === "FATAL" || slices[slice] === "none") {
      slices[slice] = event.level === "FATAL" ? "fatal" : "error";
    }
  }

  const runs: { mark: Mark; span: number }[] = [];

  for (const mark of slices) {
    const last = runs.at(-1);

    if (last?.mark === mark) {
      last.span += 1;
    } else {
      runs.push({ mark, span: 1 });
    }
  }

  return runs.map((run) => ({ mark: run.mark, percent: (run.span / sliceCount) * 100 }));
}
