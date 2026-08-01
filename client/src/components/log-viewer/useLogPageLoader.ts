import type {
  LogEvent,
  LogFilter,
  LogHistoryQuery,
  LogPage,
} from "@log-aggregator/shared";
import {
  type RefObject,
  type UIEvent,
  useEffect,
  useRef,
  useState,
} from "react";

import { fetchLogPage } from "@/services/logApiClient";
import { toLogCursor } from "./logEventSorting";

const pageSize = 50;

interface UseLogPageLoaderOptions {
  appendLogPage: (page: LogPage) => void;
  filter: LogFilter;
  hasMore: boolean;
  oldestEvent: LogEvent | undefined;
  parentRef: RefObject<HTMLDivElement | null>;
  setError: (error: string | undefined) => void;
}

export function useLogPageLoader({
  appendLogPage,
  filter,
  hasMore,
  oldestEvent,
  parentRef,
  setError,
}: UseLogPageLoaderOptions) {
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [untilInput, setUntilInput] = useState("");
  const bottomLoadArmedRef = useRef(true);
  const loadingOlderRef = useRef(false);

  useEffect(() => {
    const element = parentRef.current;

    if (!element || !hasMore || !oldestEvent || loadingOlderRef.current) {
      return;
    }

    if (element.scrollHeight <= element.clientHeight + 4) {
      void loadOlderEvents();
    }
  }, [hasMore, oldestEvent, parentRef]);

  useEffect(() => {
    bottomLoadArmedRef.current = true;
  }, [filter]);

  function handleScroll(event: UIEvent<HTMLDivElement>) {
    const target = event.currentTarget;
    const distanceToBottom =
      target.scrollHeight - target.scrollTop - target.clientHeight;

    if (distanceToBottom > 360) {
      bottomLoadArmedRef.current = true;
      return;
    }

    if (distanceToBottom < 180 && bottomLoadArmedRef.current) {
      bottomLoadArmedRef.current = false;
      void loadOlderEvents();
    }
  }

  async function loadOlderEvents() {
    if (!hasMore || !oldestEvent) {
      return;
    }

    await loadPage({ beforeCursor: toLogCursor(oldestEvent), limit: pageSize });
  }

  function loadUntilTimestamp() {
    const timestamp = parseUntilInput(untilInput);

    if (!timestamp) {
      return;
    }

    void loadPage({ fromTimestamp: timestamp, limit: 1_000 });
  }

  async function loadPage(request: LogHistoryQuery) {
    if (loadingOlderRef.current) {
      return;
    }

    loadingOlderRef.current = true;
    setLoadingOlder(true);

    try {
      appendLogPage(await fetchLogPage({ ...request, filter }));
    } catch {
      setError("Failed to load older logs");
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlder(false);
    }
  }

  return {
    handleScroll,
    loadingOlder,
    loadOlderEvents,
    loadUntilTimestamp,
    setUntilInput,
    untilInput,
  };
}

function parseUntilInput(value: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value)) {
    return undefined;
  }

  return value.length === 16 ? `${value}:00.000` : `${value}.000`;
}
