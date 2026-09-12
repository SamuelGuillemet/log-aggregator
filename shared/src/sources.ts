export interface LogSourceConfig {
  id: string;
  name: string;
  group: string;
  directories: string[];
}

/** A configured source as advertised to the client, with its discovered applications. */
export interface LogSourceOption {
  id: string;
  name: string;
  group: string;
  applications: string[];
}

export interface SourceOptions {
  sources: LogSourceOption[];
}

/** One resolved directory of a configured source, for the active selection. */
export interface LogSource {
  id: string;
  name: string;
  directory: string;
}

export interface SourceSelection {
  sourceId: string;
  /** Application name; the log file prefix. */
  project: string;
  /** `YYYY-MM-DD`. */
  date: string;
}

export function isCompleteSelection(selection: SourceSelection): boolean {
  return (
    selection.sourceId.length > 0 &&
    selection.project.trim().length > 0 &&
    /^\d{4}-\d{2}-\d{2}$/.test(selection.date)
  );
}

export function selectionKey(selection: SourceSelection): string {
  return `${selection.sourceId}\u0000${selection.project.trim()}\u0000${selection.date}`;
}
