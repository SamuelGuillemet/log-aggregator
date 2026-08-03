import { cn } from "@/lib/utils";

interface LogLevelBadgeProps {
  level: string;
}

export function LogLevelBadge({ level }: LogLevelBadgeProps) {
  const normalizedLevel = level.toUpperCase();

  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={cn(
          "inline-block rounded-full size-2",
          normalizedLevel === "FATAL" && "bg-[#dc2626]",
          normalizedLevel === "ERROR" && "bg-[#ef580c]",
          normalizedLevel === "WARN" && "bg-[#be8b2f]",
          normalizedLevel === "INFO" && "bg-[#0284c7]",
          normalizedLevel === "DEBUG" && "bg-[#6b7280]",
          normalizedLevel === "TRACE" && "bg-[#9ca3af]",
        )}
      />
      {level}
    </span>
  );
}
