import { type RefObject, type UIEvent, useEffect, useState } from "react";
import { parseLocalTimeOnDate } from "@/lib/format";
import { useLogsStore } from "@/state/logsStore";
import { useSourceStore } from "@/state/sourceStore";
import { jumpToTime, loadNewerLogs, loadOlderLogs } from "./paging";

/** Distance from an edge at which the next page starts loading. */
const LOAD_THRESHOLD_PX = 400;

export function useLogPaging(scrollRef: RefObject<HTMLDivElement | null>) {
  const [timeInput, setTimeInput] = useState("");
  const loading = useLogsStore((state) => state.loadingPage);
  const hasMoreOlder = useLogsStore((state) => state.hasMoreOlder);
  const oldestSeq = useLogsStore((state) => state.events.at(-1)?.seq);

  // A short page leaves the viewport unfilled, so the scroll handler is unreachable
  // and the user is stuck with whatever the first page returned.
  useEffect(() => {
    const element = scrollRef.current;

    if (element && hasMoreOlder && oldestSeq && element.scrollHeight <= element.clientHeight + 4) {
      void loadOlderLogs();
    }
  }, [hasMoreOlder, oldestSeq, scrollRef]);

  function handleScroll(event: UIEvent<HTMLDivElement>) {
    const target = event.currentTarget;

    if (target.scrollTop < LOAD_THRESHOLD_PX) {
      void loadNewerLogs();
    }

    if (target.scrollHeight - target.scrollTop - target.clientHeight < LOAD_THRESHOLD_PX) {
      void loadOlderLogs();
    }
  }

  function jumpToTimeInput() {
    const date = useSourceStore.getState().active?.date;
    const timestampMs = date ? parseLocalTimeOnDate(date, timeInput) : undefined;

    if (timestampMs !== undefined) {
      void jumpToTime(timestampMs).then(() => setTimeInput(""));
    }
  }

  return {
    handleScroll,
    jumpToTime: jumpToTimeInput,
    loading,
    setTimeInput,
    timeInput,
  };
}
