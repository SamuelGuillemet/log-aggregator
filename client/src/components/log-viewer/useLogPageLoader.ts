import type {
  LogEvent,
  LogFilter,
  LogHistoryQuery,
  LogPage,
} from "@log-aggregator/shared";
import {
  type RefObject,
  type UIEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { fetchLogPage } from "@/services/logApiClient";

const pageSize = 50;

interface UseLogPageLoaderOptions {
  appendLogPage: (page: LogPage) => void;
  clientId: string | undefined;
  filter: LogFilter;
  hasMore: boolean;
  oldestEvent: LogEvent | undefined;
  parentRef: RefObject<HTMLDivElement | null>;
  setError: (error: string | undefined) => void;
}

export function useLogPageLoader({
  appendLogPage,
  clientId,
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

  const loadPage = useCallback(
    async (request: LogHistoryQuery) => {
      if (loadingOlderRef.current) {
        return;
      }

      if (!clientId) {
        setError("Log stream is disconnected");
        return;
      }

      loadingOlderRef.current = true;
      setLoadingOlder(true);

      try {
        appendLogPage(await fetchLogPage(clientId, { ...request }));
      } catch {
        setError("Failed to load older logs");
      } finally {
        loadingOlderRef.current = false;
        setLoadingOlder(false);
      }
    },
    [appendLogPage, clientId, setError],
  );

  const loadOlderEvents = useCallback(async () => {
    if (!hasMore || !oldestEvent) {
      return;
    }

    await loadPage({
      type: "cursor",
      beforeCursor: { id: oldestEvent.id },
      limit: pageSize,
    });
  }, [hasMore, loadPage, oldestEvent]);

  const loadUntilTimestamp = useCallback(() => {
    const timestamp = parseUntilInput(untilInput);

    if (!timestamp) {
      return;
    }

    void loadPage({ fromTimestamp: timestamp, type: "timestamp" }).then(() => {
      setUntilInput("");

      // Scroll to the end of the log list after loading the page.
      setTimeout(() => {
        parentRef.current?.scrollTo({ top: parentRef.current.scrollHeight });
      }, 0);
    });
  }, [loadPage, parentRef, untilInput]);

  useEffect(() => {
    const element = parentRef.current;

    if (!element || !hasMore || !oldestEvent || loadingOlderRef.current) {
      return;
    }

    if (element.scrollHeight <= element.clientHeight + 4) {
      void loadOlderEvents();
    }
  }, [hasMore, oldestEvent, parentRef, loadOlderEvents]);

  useEffect(() => {
    bottomLoadArmedRef.current = true;
  }, [filter]);

  const handleScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
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
    },
    [loadOlderEvents],
  );

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
