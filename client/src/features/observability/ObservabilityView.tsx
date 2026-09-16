import type { ObservabilityScope } from "@log-aggregator/shared";
import { useMemo } from "react";
import { formatCount, formatDurationMs } from "@/lib/format";
import { useObservabilityStore } from "@/state/observabilityStore";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/ui/select";

const HOURS_PER_DAY = 24;
const ALL_SCOPE_VALUE = "all";

/**
 * Reads the whole shared stream buffer's stats, not any session's filter -- see
 * ObservabilityAggregator on the server for why. Only ever has data for a source
 * whose parser config maps `observability` fields; otherwise this stays empty.
 */
export function ObservabilityView() {
  const stats = useObservabilityStore((state) => state.stats);
  const received = useObservabilityStore((state) => state.received);
  const urlKeys = useObservabilityStore((state) => state.urlKeys);
  const scope = useObservabilityStore((state) => state.scope);
  const setScope = useObservabilityStore((state) => state.setScope);

  const keysByValue = useMemo(() => {
    const map = new Map<string, ObservabilityScope>();

    for (const entry of urlKeys) {
      map.set(scopeValue(entry), entry);
    }

    return map;
  }, [urlKeys]);

  if (!received) {
    return <EmptyState message="Not configured for this stream, or no stream is active yet." />;
  }

  if (stats.sampleCount === 0) {
    return <EmptyState message="No events with observability fields have arrived yet." />;
  }

  const maxStatusCount = Math.max(...Object.values(stats.statusCounts), 1);
  const maxBucketCount = Math.max(...stats.duration.buckets.map((bucket) => bucket.count), 1);
  const hourly = fillHours(stats.hourly);
  const maxHourCount = Math.max(...hourly.map((bucket) => bucket.count), 1);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-auto p-4">
      <label className="flex shrink-0 items-center gap-2">
        <span className="label-micro">Scope</span>
        <Select
          value={scope ? scopeValue(scope) : ALL_SCOPE_VALUE}
          onValueChange={(value) =>
            setScope(value && value !== ALL_SCOPE_VALUE ? keysByValue.get(value) : undefined)
          }
        >
          <SelectTrigger
            aria-label="Observability scope"
            className="data h-7 w-200 rounded-sm border-line bg-surface text-[12px]"
          >
            <SelectValue placeholder="All requests">
              {scope ? `${scope.method}${scope.url}` : "All requests"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_SCOPE_VALUE}>All requests</SelectItem>
            {urlKeys.map((entry) => (
              <SelectItem key={scopeValue(entry)} value={scopeValue(entry)}>
                {entry.method}
                {entry.url}
                <span className="text-mute">
                  {" "}
                  ({formatCount(entry.count)}, avg{" "}
                  {formatDurationMs(Math.round(entry.avgDurationMs))})
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>

      <div className="grid min-h-0 grid-cols-2 gap-4">
        <Panel title="Overview">
          <div className="grid grow grid-cols-3 items-center gap-3 text-center">
            <Metric label="Samples" value={formatCount(stats.sampleCount)} tone="text-level-info" />
            <Metric
              label="Avg"
              value={formatDurationMs(Math.round(stats.duration.avgMs))}
              tone={durationTextTone(stats.duration.avgMs)}
            />
            <Metric
              label="Max"
              value={formatDurationMs(stats.duration.maxMs)}
              tone={durationTextTone(stats.duration.maxMs)}
            />
          </div>
        </Panel>

        <Panel title="By hour of day">
          <BarList
            entries={hourly.map((bucket) => [String(bucket.hour).padStart(2, "0"), bucket.count])}
            max={maxHourCount}
            colorOf={(_, index) => durationBucketToneClass(hourly[index]?.avgDurationMs ?? 0)}
            dense
          />
        </Panel>

        <Panel title="Response time distribution">
          <BarList
            entries={stats.duration.buckets
              .toSorted((left, right) => left.upperBoundMs - right.upperBoundMs)
              .map((bucket) => [`\u2264 ${formatDurationMs(bucket.upperBoundMs)}`, bucket.count])}
            max={maxBucketCount}
            colorOf={(_, index) =>
              durationBucketToneClass(stats.duration.buckets[index]?.upperBoundMs ?? 0)
            }
          />
        </Panel>

        <Panel title="Status codes">
          <BarList
            entries={Object.entries(stats.statusCounts).sort(
              ([left], [right]) => Number.parseInt(left) - Number.parseInt(right),
            )}
            max={maxStatusCount}
            colorOf={statusToneClass}
          />
        </Panel>

        <Panel title="Slowest requests" className="col-span-2">
          <div className="max-h-full space-y-0.5 overflow-y-auto">
            {stats.slowest.map((entry) => (
              <div
                key={entry.seq}
                className={`data grid grid-cols-[auto_auto_1fr] items-center gap-3 border-b border-l-2 border-line/60 px-2 py-1 text-[11px] last:border-b-0 ${durationBorderTone(entry.durationMs)}`}
              >
                <span
                  className={`w-16 text-right font-semibold ${durationTextTone(entry.durationMs)}`}
                >
                  {formatDurationMs(entry.durationMs)}
                </span>
                <span className="text-mute">{entry.sourceName}</span>
                <span className="truncate text-mute" title={entry.raw}>
                  {entry.raw}
                </span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center p-10 text-center">
      <p className="data max-w-sm text-[12px] text-mute">{message}</p>
    </div>
  );
}

function Panel({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`flex min-h-0 flex-col gap-2 border border-line bg-panel p-3 ${className ?? ""}`}
    >
      <h2 className="data text-[11px] font-semibold tracking-[0.08em] text-mute uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className={`data text-[15px] font-semibold ${tone ?? "text-fg"}`}>{value}</span>
      <span className="text-[10px] text-mute uppercase">{label}</span>
    </div>
  );
}

function BarList({
  entries,
  max,
  dense,
  colorOf,
}: {
  entries: Array<[string, number]>;
  max: number;
  dense?: boolean;
  colorOf?: (label: string, index: number) => string;
}) {
  return (
    <div className={dense ? "flex items-end gap-0.5" : "space-y-1"}>
      {entries.map(([label, count], index) => {
        const tone = colorOf ? colorOf(label, index) : "bg-level-info/60";

        return dense ? (
          <div
            key={label}
            className="flex flex-1 flex-col items-center gap-0.5"
            title={`${label}:00 — ${count}`}
          >
            <div className="flex h-16 w-full items-end">
              <div className={`w-full ${tone}`} style={{ height: `${(count / max) * 100}%` }} />
            </div>
            <span className="data text-[9px] text-mute">{label}</span>
          </div>
        ) : (
          <div key={label} className="data flex items-center gap-2 text-[11px]">
            <span className="w-24 shrink-0 text-mute">{label}</span>
            <div className="h-3 flex-1 bg-surface">
              <div className={`h-full ${tone}`} style={{ width: `${(count / max) * 100}%` }} />
            </div>
            <span className="w-12 shrink-0 text-right text-fg">{formatCount(count)}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Stable string identity for a `method`+`url` pair, used as both a Map key and a `<Select>` value. */
function scopeValue(scope: ObservabilityScope): string {
  return `${scope.method ?? ""}\u0000${scope.url}`;
}

function fillHours(hourly: { hour: number; count: number; avgDurationMs?: number }[]): {
  hour: number;
  count: number;
  avgDurationMs: number;
}[] {
  const byHour = new Map(hourly.map((bucket) => [bucket.hour, bucket]));

  return Array.from({ length: HOURS_PER_DAY }, (_, hour) => {
    const bucket = byHour.get(hour);

    return { avgDurationMs: bucket?.avgDurationMs ?? 0, count: bucket?.count ?? 0, hour };
  });
}

/** 2xx/3xx read as calm (info), 4xx as a caller-side warning, 5xx as a server-side error. */
function statusToneClass(status: string): string {
  const code = Number(status);

  if (!Number.isFinite(code)) {
    return "bg-level-unknown/60";
  }

  if (code >= 500) {
    return "bg-level-error/70";
  }

  if (code >= 400) {
    return "bg-level-warn/70";
  }

  return "bg-level-info/70";
}

/** Fast is calm (info), slow trends through warn into error — used for both bars and text. */
function durationBucketToneClass(durationMs: number): string {
  if (durationMs > 1_000) {
    return "bg-level-error/70";
  }

  if (durationMs > 250) {
    return "bg-level-warn/70";
  }

  return "bg-level-info/70";
}

function durationTextTone(durationMs: number): string {
  if (durationMs > 1_000) {
    return "text-level-error";
  }

  if (durationMs > 250) {
    return "text-level-warn";
  }

  return "text-level-info";
}

function durationBorderTone(durationMs: number): string {
  if (durationMs > 1_000) {
    return "border-l-level-error";
  }

  if (durationMs > 250) {
    return "border-l-level-warn";
  }

  return "border-l-level-info";
}
