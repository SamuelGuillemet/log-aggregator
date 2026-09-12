import { type RefObject, type UIEvent, useEffect, useState } from "react";
import { parseLocalDateTime } from "@/lib/format";
import { useLogsStore } from "@/state/logsStore";
import { loadLogsUntil, loadOlderLogs } from "./paging";

/** Distance from the bottom at which the next page starts loading. */
const LOAD_THRESHOLD_PX = 400;

export function useLogPaging(scrollRef: RefObject<HTMLDivElement | null>) {
  const [untilInput, setUntilInput] = useState("");
  const loading = useLogsStore((state) => state.loadingPage);
  const hasMore = useLogsStore((state) => state.hasMore);
  const oldestSeq = useLogsStore((state) => state.events.at(-1)?.seq);

  // A short page leaves the viewport unfilled, so the scroll handler is unreachable
  // and the user is stuck with whatever the first page returned.
  useEffect(() => {
    const element = scrollRef.current;

    if (element && hasMore && oldestSeq && element.scrollHeight <= element.clientHeight + 4) {
      void loadOlderLogs();
    }
  }, [hasMore, oldestSeq, scrollRef]);

  function handleScroll(event: UIEvent<HTMLDivElement>) {
    const target = event.currentTarget;

    if (target.scrollHeight - target.scrollTop - target.clientHeight < LOAD_THRESHOLD_PX) {
      void loadOlderLogs();
    }
  }

  function loadUntil() {
    const timestampMs = parseLocalDateTime(untilInput);

    if (timestampMs !== undefined) {
      void loadLogsUntil(timestampMs).then(() => setUntilInput(""));
    }
  }

  return { handleScroll, loadOlder: loadOlderLogs, loading, loadUntil, setUntilInput, untilInput };
}
