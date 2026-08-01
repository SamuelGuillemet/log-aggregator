import { cn } from "@/lib/utils";

interface LogLevelBadgeProps {
  level: string;
}

export function LogLevelBadge({ level }: LogLevelBadgeProps) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={cn(
          "inline-block bg-muted-foreground rounded-full size-2",
          level === "WARN" && "bg-[#be8b2f]",
          (level === "ERROR" || level === "FATAL") && "bg-destructive",
          (level === "INFO" || level === "DEBUG" || level === "TRACE") &&
            "bg-primary",
        )}
      />
      {level}
    </span>
  );
}
