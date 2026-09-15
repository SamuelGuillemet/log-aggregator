/**
 * Stats over a whole stream's buffer, not the requesting session's filter: the
 * buffer is shared across sessions with different filters, so a per-session
 * aggregate would multiply cost with connection count. Absent when the active
 * source's parser config has no `observability` field mapping configured.
 *
 * Scoped to whichever `ObservabilityScope` the session last selected (or the whole
 * stream, unscoped, by default) -- see `urlKeys` on the wire message for the list of
 * scopes available to pick from.
 */
export interface ObservabilityStats {
  /** Events with a parsed duration, i.e. the ones every other field here is over. */
  sampleCount: number;
  statusCounts: Record<string, number>;
  duration: DurationStats;
  /** Hour-of-day (0-23) buckets, incrementally maintained. */
  hourly: HourBucket[];
  /** Recomputed on a bounded interval rather than incrementally; see docs. */
  slowest: SlowEntry[];
}

/** Picks out one `method`+`url` pair's stats instead of the whole stream's. */
export interface ObservabilityScope {
  method: string;
  url: string;
}

export interface DurationStats {
  count: number;
  minMs: number;
  maxMs: number;
  avgMs: number;
  buckets: DurationBucket[];
}

/** Count of samples with duration <= upperBoundMs (and > the previous bucket's bound). */
export interface DurationBucket {
  upperBoundMs: number;
  count: number;
}

export interface HourBucket {
  hour: number;
  count: number;
  avgDurationMs: number;
}

export interface SlowEntry {
  seq: number;
  timestampMs: number;
  durationMs: number;
  sourceId: string;
  sourceName: string;
  raw: string;
}

export interface UrlKeyStats {
  method: string;
  url: string;
  count: number;
  avgDurationMs: number;
}

export const EMPTY_OBSERVABILITY_STATS: ObservabilityStats = {
  duration: { avgMs: 0, buckets: [], count: 0, maxMs: 0, minMs: 0 },
  hourly: [],
  sampleCount: 0,
  slowest: [],
  statusCounts: {},
};

/** Cap on distinct `method`+`url` keys tracked, so an unbounded set of query-string
 * variants can't grow forever. */
export const MAX_TRACKED_URLS = 500;
/** How many of the busiest keys are surfaced for the scope picker. */
export const TOP_URLS_LIMIT = 20;

/** Upper bounds (ms) for the fixed-width duration histogram; last bucket is "and above". */
export const DURATION_BUCKET_BOUNDS_MS = [10, 25, 50, 100, 250, 500, 1_000, 2_500, 5_000, 10_000];
