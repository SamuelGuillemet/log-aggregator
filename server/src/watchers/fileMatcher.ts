import type { LogSource } from "@log-aggregator/shared";

const logFileKindPattern = "(serveur|fwk)";
const anyDatedLogFilePattern = new RegExp(
  String.raw`^.+-${logFileKindPattern}\.\d{4}-\d{2}-\d{2}-\d+\.log$`,
  "i",
);

export function matchesLogFile(source: LogSource, filePath: string): boolean {
  return matchesLogFileName(source, getFileName(filePath));
}

export function matchesLogFileName(
  source: Pick<LogSource, "date" | "project">,
  fileName: string,
): boolean {
  if (!source.project || !source.date) {
    anyDatedLogFilePattern.lastIndex = 0;

    return anyDatedLogFilePattern.test(fileName);
  }

  const pattern = new RegExp(
    String.raw`^${escapeRegExp(source.project)}-${logFileKindPattern}\.${escapeRegExp(source.date)}-\d+\.log$`,
    "i",
  );

  return pattern.test(fileName);
}

function getFileName(filePath: string): string {
  return filePath.split(/[\\/]/).at(-1) ?? filePath;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}
