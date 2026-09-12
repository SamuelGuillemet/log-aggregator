const LEVELS = { debug: 10, error: 40, info: 20, silent: 50, warn: 30 } as const;

export type LogLevelName = keyof typeof LEVELS;

function resolveLevel(): number {
  const configured = process.env.LOG_AGGREGATOR_LOG_LEVEL as LogLevelName | undefined;

  return LEVELS[configured ?? "info"] ?? LEVELS.info;
}

const threshold = resolveLevel();

function write(level: LogLevelName, target: "log" | "warn" | "error", message: string): void {
  if (LEVELS[level] < threshold) {
    return;
  }

  console[target](`${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} ${message}`);
}

/**
 * Hot-path tracing sits at `debug` and is compiled out of the default level, so
 * tailing a busy file does not block the event loop on synchronous stdout writes.
 */
export const logger = {
  debug: (message: string) => write("debug", "log", message),
  enabled: (level: LogLevelName) => LEVELS[level] >= threshold,
  error: (message: string, error?: unknown) =>
    write("error", "error", error === undefined ? message : `${message}: ${describe(error)}`),
  info: (message: string) => write("info", "log", message),
  warn: (message: string) => write("warn", "warn", message),
};

export function describe(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? `${error.name}: ${error.message}`;
  }

  return String(error);
}
