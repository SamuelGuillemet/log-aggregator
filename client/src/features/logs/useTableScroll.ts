import type { LogEvent } from "@log-aggregator/shared";
import { type RefObject, useLayoutEffect, useRef } from "react";
import { useLogsStore } from "@/state/logsStore";

const ROW_HEIGHT_PX = 24;

/**
 * Owns every scroll-repositioning rule for the log table, so LogTable itself only
 * renders. Two distinct triggers are handled:
 *
 * - An incremental batch (live events, or a "load newer" page) prepends rows above
 *   whatever the reader is looking at. Left alone that either strands them on rows
 *   that just moved down, or (if they were already pinned to the top) hides the new
 *   arrivals behind the browser's own scroll anchoring. Both are resolved by diffing
 *   the previous and current top row.
 * - A full replace (a time jump, or the snapshot a subscribe/resume sends) instead
 *   asks for an explicit position through the store's one-shot `scrollIntent`, since
 *   there is no previous top row in the new window to diff against.
 */
export function useTableScroll(scrollRef: RefObject<HTMLDivElement | null>, events: LogEvent[]): void {
  const topSeqRef = useRef<number | undefined>(undefined);
  const scrollIntent = useLogsStore((state) => state.scrollIntent);
  const consumeScrollIntent = useLogsStore((state) => state.consumeScrollIntent);

  useLayoutEffect(() => {
    const element = scrollRef.current;
    const previousTopSeq = topSeqRef.current;
    const currentTopSeq = events[0]?.seq;

    topSeqRef.current = currentTopSeq;

    if (!element || previousTopSeq === undefined || previousTopSeq === currentTopSeq) {
      return;
    }

    // Anything other than a small positive shift is a reset/jump, not a prepend; the
    // scroll position from before it is meaningless and best left alone (the intent
    // effect below handles those cases instead).
    const insertedAbove = events.findIndex((event) => event.seq === previousTopSeq);

    if (insertedAbove <= 0) {
      return;
    }

    if (element.scrollTop <= ROW_HEIGHT_PX) {
      // Pinned to the top: read as "follow the live edge", so new rows arrive in view.
      element.scrollTop = 0;
    } else {
      element.scrollTop += insertedAbove * ROW_HEIGHT_PX;
    }
  }, [events, scrollRef]);

  useLayoutEffect(() => {
    const element = scrollRef.current;

    if (!element || scrollIntent.type === "none") {
      return;
    }

    switch (scrollIntent.type) {
      case "top":
        element.scrollTop = 0;
        break;
      case "bottom":
        element.scrollTop = element.scrollHeight - element.clientHeight;
        break;
      case "middle":
        element.scrollTop = (element.scrollHeight - element.clientHeight) / 2;
        break;
    }

    consumeScrollIntent();
  }, [consumeScrollIntent, scrollIntent, scrollRef]);
}
