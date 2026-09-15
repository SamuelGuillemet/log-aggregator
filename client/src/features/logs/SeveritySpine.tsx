import type { LogEvent, LogLevel } from "@log-aggregator/shared";
import { type RefObject, useEffect, useRef, useState } from "react";
import { levelColor } from "./levelStyles";

/** Fine enough to place a single error, coarse enough to stay cheap to rebuild. */
const SLICE_COUNT = 400;

type Mark = "none" | "error" | "fatal";

const MARK_LEVEL: Record<Exclude<Mark, "none">, LogLevel> = {
  error: "ERROR",
  fatal: "FATAL",
};

/** Higher rank must never be overwritten by a lower one when slices collide. */
const MARK_RANK: Record<Mark, number> = {
  none: 0,
  error: 2,
  fatal: 3,
};

const LEVEL_MARK: Partial<Record<LogLevel, Mark>> = {
  ERROR: "error",
  FATAL: "fatal",
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
 * part. It plots only warnings and errors against an empty track -- an earlier version
 * drew every level and became a rainbow barcode with no signal in it. Ordinary scrolling
 * does the same job, so this is hidden from assistive tech rather than being a second
 * thing to tab through.
 */
export function SeveritySpine({ events, scrollRef }: SeveritySpineProps) {
  const [viewport, setViewport] = useState({ height: 0, top: 0 });
  const dragFrame = useRef<number | null>(null);

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

  useEffect(() => {
    return () => {
      if (dragFrame.current !== null) {
        cancelAnimationFrame(dragFrame.current);
      }
    };
  }, []);

  const runs = buildRuns(events);
  const markCount = runs.filter((run) => run.mark !== "none").length;

  const scrollToClientY = (clientY: number, bounds: DOMRect) => {
    const element = scrollRef.current;

    if (!element) {
      return;
    }

    const fraction = (clientY - bounds.top) / bounds.height;
    element.scrollTo({ top: fraction * element.scrollHeight });
  };

  return (
    <div
      className="relative w-2.5 shrink-0 border-r border-line bg-surface"
      aria-hidden
      title={
        markCount > 0
          ? "Warnings and errors across the loaded buffer. Click and drag to jump."
          : "No warnings or errors in the loaded buffer."
      }
      style={{ cursor: events.length > 0 ? "pointer" : "default" }}
      onPointerDown={(event) => {
        if (events.length === 0) {
          return;
        }

        event.currentTarget.setPointerCapture(event.pointerId);
        scrollToClientY(event.clientY, event.currentTarget.getBoundingClientRect());
      }}
      onPointerMove={(event) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
          return;
        }

        const { clientY } = event;
        const bounds = event.currentTarget.getBoundingClientRect();

        // Throttle to one scroll update per frame so a fast drag doesn't flood the scroll container.
        if (dragFrame.current !== null) {
          cancelAnimationFrame(dragFrame.current);
        }
        dragFrame.current = requestAnimationFrame(() => {
          dragFrame.current = null;
          scrollToClientY(clientY, bounds);
        });
      }}
      onPointerUp={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
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
        style={{ height: `${viewport.height}%`, top: `${viewport.top}%`, minHeight: "8px" }}
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
    const mark = LEVEL_MARK[event.level];

    if (!mark) {
      continue;
    }

    const slice = Math.min(sliceCount - 1, Math.floor(index / perSlice));

    // A lone FATAL must never be hidden by a neighbouring ERROR or WARN.
    if (MARK_RANK[mark] > MARK_RANK[slices[slice]]) {
      slices[slice] = mark;
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
