import type { LogLevel } from "@log-aggregator/shared";

export const LOG_LEVELS = [
  "TRACE",
  "DEBUG",
  "INFO",
  "WARN",
  "ERROR",
  "FATAL",
] satisfies LogLevel[];
