import {
  DURATION_BUCKET_BOUNDS_MS,
  MAX_TRACKED_URLS,
  TOP_URLS_LIMIT,
  type DurationBucket,
  type ObservabilityScope,
  type ObservabilityStats,
  type SlowEntry,
  type UrlKeyStats,
} from "@log-aggregator/shared";
import type { ObservabilityFieldMapping } from "../config/types.js";
import type { StoredEvent } from "./eventBuffer.js";

const SLOWEST_LIMIT = 20;
const HOURS_PER_DAY = 24;

interface Sample {
  status: string;
  durationMs: number;
  url: string;
  method: string;
}

interface HourAccumulator {
  count: number;
  durationSum: number;
}

interface KeyEntry {
  method: string;
  url: string;
  bucket: Bucket;
}

/**
 * One scope's worth of exact, incrementally-maintained counters: either the whole
 * stream (the aggregator's `global` bucket) or a single `method`+`url` pair (one of
 * `byKey`'s buckets). Counts, sums and histogram tallies are O(1) per record/forget.
 * min/max and the slowest-N list are the exception: removing an arbitrary event can
 * invalidate them in a way that isn't knowable without a full scan, so `forget` only
 * flags `dirty`; the (bounded, infrequent) rescan happens lazily via `beginRecompute`.
 */
class Bucket {
  readonly statusCounts = new Map<string, number>();
  readonly durationBucketCounts: number[] = DURATION_BUCKET_BOUNDS_MS.map(() => 0);
  readonly hourly: HourAccumulator[] = Array.from({ length: HOURS_PER_DAY }, () => ({
    count: 0,
    durationSum: 0,
  }));
  count = 0;
  durationSum = 0;
  dirty = false;

  private minEvent: StoredEvent | undefined;
  private minDurationMs = 0;
  private maxEvent: StoredEvent | undefined;
  private maxDurationMs = 0;
  private slowest: { stored: StoredEvent; durationMs: number }[] = [];

  get avgDurationMs(): number {
    return this.count === 0 ? 0 : this.durationSum / this.count;
  }

  record(sample: Sample, stored: StoredEvent): void {
    this.adjust(sample, stored, 1);
    this.considerForExtremes(sample, stored);
  }

  forget(sample: Sample, stored: StoredEvent): void {
    this.adjust(sample, stored, -1);

    if (
      this.minEvent === stored ||
      this.maxEvent === stored ||
      this.slowest.some((entry) => entry.stored === stored)
    ) {
      this.dirty = true;
    }
  }

  considerForExtremes(sample: Sample, stored: StoredEvent): void {
    if (!this.minEvent || sample.durationMs < this.minDurationMs) {
      this.minEvent = stored;
      this.minDurationMs = sample.durationMs;
    }

    if (!this.maxEvent || sample.durationMs > this.maxDurationMs) {
      this.maxEvent = stored;
      this.maxDurationMs = sample.durationMs;
    }

    const worst = this.slowest.at(-1);

    if (this.slowest.length >= SLOWEST_LIMIT && worst && sample.durationMs <= worst.durationMs) {
      return;
    }

    const index = this.slowest.findIndex((candidate) => sample.durationMs > candidate.durationMs);

    this.slowest.splice(index === -1 ? this.slowest.length : index, 0, {
      durationMs: sample.durationMs,
      stored,
    });
    this.slowest.length = Math.min(this.slowest.length, SLOWEST_LIMIT);
  }

  /** Resets the (possibly stale) extremes so the caller can rebuild them via `considerForExtremes`. */
  beginRecompute(): void {
    this.minEvent = undefined;
    this.minDurationMs = 0;
    this.maxEvent = undefined;
    this.maxDurationMs = 0;
    this.slowest = [];
    this.dirty = false;
  }

  clear(): void {
    this.statusCounts.clear();
    this.durationBucketCounts.fill(0);

    for (const hour of this.hourly) {
      hour.count = 0;
      hour.durationSum = 0;
    }

    this.count = 0;
    this.durationSum = 0;
    this.beginRecompute();
  }

  stats(): ObservabilityStats {
    return {
      duration: {
        avgMs: this.avgDurationMs,
        buckets: this.bucketSnapshot(),
        count: this.count,
        maxMs: this.maxEvent ? this.maxDurationMs : 0,
        minMs: this.minEvent ? this.minDurationMs : 0,
      },
      hourly: this.hourly
        .map((bucket, hour) => ({
          avgDurationMs: bucket.count === 0 ? 0 : bucket.durationSum / bucket.count,
          count: bucket.count,
          hour,
        }))
        .filter((bucket) => bucket.count > 0),
      sampleCount: this.count,
      slowest: this.slowest.map((entry) => toSlowEntry(entry.stored, entry.durationMs)),
      statusCounts: Object.fromEntries(this.statusCounts),
    };
  }

  private adjust(sample: Sample, stored: StoredEvent, delta: 1 | -1): void {
    const nextStatusCount = (this.statusCounts.get(sample.status) ?? 0) + delta;

    if (nextStatusCount <= 0) {
      this.statusCounts.delete(sample.status);
    } else {
      this.statusCounts.set(sample.status, nextStatusCount);
    }

    this.durationBucketCounts[bucketIndex(sample.durationMs)] += delta;
    this.count += delta;
    this.durationSum += sample.durationMs * delta;

    const hour = this.hourly[new Date(stored.event.timestampMs).getHours()];
    hour.count += delta;
    hour.durationSum += sample.durationMs * delta;
  }

  private bucketSnapshot(): DurationBucket[] {
    return DURATION_BUCKET_BOUNDS_MS.map((upperBoundMs, index) => ({
      count: this.durationBucketCounts[index],
      upperBoundMs,
    }));
  }
}

/**
 * Runs over the whole shared stream buffer, not any one session's filter: the
 * buffer is shared across sessions with different filters, so a per-session
 * aggregate would multiply update cost with connection count.
 *
 * Maintains one `global` Bucket plus one Bucket per distinct `method`+`url` key (up
 * to `MAX_TRACKED_URLS`), so a session can request either the whole stream's stats or
 * one key's -- both are exact and incrementally maintained the same way.
 */
export class ObservabilityAggregator {
  private readonly global = new Bucket();
  private readonly byKey = new Map<string, KeyEntry>();

  constructor(private readonly mapping: ObservabilityFieldMapping | undefined) {}

  get enabled(): boolean {
    return this.mapping !== undefined;
  }

  record(stored: StoredEvent): void {
    const sample = this.sampleOf(stored);

    if (!sample) {
      return;
    }

    this.global.record(sample, stored);

    if (sample.url !== undefined) {
      this.keyEntry({ ...sample, url: sample.url }, true)?.bucket.record(sample, stored);
    }
  }

  forget(stored: StoredEvent): void {
    const sample = this.sampleOf(stored);

    if (!sample) {
      return;
    }

    this.global.forget(sample, stored);

    if (sample.url !== undefined) {
      const key = keyString({ method: sample.method, url: sample.url });
      const entry = this.byKey.get(key);

      if (entry) {
        entry.bucket.forget(sample, stored);

        if (entry.bucket.count <= 0) {
          this.byKey.delete(key);
        }
      }
    }
  }

  clear(): void {
    this.global.clear();
    this.byKey.clear();
  }

  /** `rescan` is only invoked when an eviction may have invalidated min/max/slowest. */
  snapshot(
    rescan: (visit: (stored: StoredEvent) => void) => void,
    scope?: ObservabilityScope,
  ): ObservabilityStats {
    const key = scope ? keyString(scope) : undefined;
    const bucket = key === undefined ? this.global : this.byKey.get(key)?.bucket;

    if (!bucket) {
      return new Bucket().stats();
    }

    if (bucket.dirty) {
      this.recomputeExtremes(bucket, rescan, key);
    }

    return bucket.stats();
  }

  /** Every tracked `method`+`url` key, busiest first, for the scope picker. */
  urlKeys(): UrlKeyStats[] {
    return [...this.byKey.values()]
      .map((entry): UrlKeyStats => ({
        avgDurationMs: entry.bucket.avgDurationMs,
        count: entry.bucket.count,
        method: entry.method,
        url: entry.url,
      }))
      .sort((left, right) => right.count - left.count)
      .slice(0, TOP_URLS_LIMIT);
  }

  private keyEntry(sample: { method: string; url: string }, create: boolean): KeyEntry | undefined {
    const key = keyString(sample);
    const existing = this.byKey.get(key);

    if (existing || !create) {
      return existing;
    }

    // A brand-new key past the cap is silently untracked rather than evicting one
    // already held: an unbounded set of query-string variants can't grow forever,
    // and the busiest keys (the ones worth showing) are the ones already tracked.
    if (this.byKey.size >= MAX_TRACKED_URLS) {
      return undefined;
    }

    const entry: KeyEntry = { bucket: new Bucket(), method: sample.method, url: sample.url };

    this.byKey.set(key, entry);

    return entry;
  }

  private recomputeExtremes(
    bucket: Bucket,
    rescan: (visit: (stored: StoredEvent) => void) => void,
    key: string | undefined,
  ): void {
    bucket.beginRecompute();

    rescan((stored) => {
      const sample = this.sampleOf(stored);

      if (!sample) {
        return;
      }

      if (
        key !== undefined &&
        (sample.url === undefined || keyString({ method: sample.method, url: sample.url }) !== key)
      ) {
        return;
      }

      bucket.considerForExtremes(sample, stored);
    });
  }

  private sampleOf(stored: StoredEvent): Sample | undefined {
    if (!this.mapping) {
      return undefined;
    }

    const durationRaw = stored.event.fields[this.mapping.durationField];

    if (durationRaw === undefined) {
      return undefined;
    }

    const durationMs = Number(durationRaw);

    if (!Number.isFinite(durationMs)) {
      return undefined;
    }

    return {
      durationMs,
      method: stored.event.fields[this.mapping.methodField],
      status: stored.event.fields[this.mapping.statusField],
      url: stored.event.fields[this.mapping.urlField],
    };
  }
}

function keyString(sample: { method: string | undefined; url: string }): string {
  return `${sample.method ?? ""}\u0000${sample.url}`;
}

function bucketIndex(durationMs: number): number {
  const index = DURATION_BUCKET_BOUNDS_MS.findIndex((bound) => durationMs <= bound);

  return index === -1 ? DURATION_BUCKET_BOUNDS_MS.length - 1 : index;
}

function toSlowEntry(stored: StoredEvent, durationMs: number): SlowEntry {
  return {
    durationMs,
    raw: stored.event.raw,
    seq: stored.event.seq,
    sourceId: stored.event.sourceId,
    sourceName: stored.event.sourceName,
    timestampMs: stored.event.timestampMs,
  };
}
