import type { LogLevel } from "@log-aggregator/shared";
import { levelColor } from "./levelStyles";

export function LogLevelBadge({ level }: { level: LogLevel }) {
  return (
    <span
      className="data text-[11px] font-semibold tracking-[0.08em]"
      style={{ color: levelColor(level) }}
    >
      {level}
    </span>
  );
}
