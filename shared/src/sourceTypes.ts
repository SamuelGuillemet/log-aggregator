export type ConnectionStatus = "connected" | "disconnected" | "watching" | "error";

export interface LogSourceConfig {
  id: string;
  name: string;
  group: string;
  directories: string[];
}

export interface LogSourceOption {
  id: string;
  name: string;
  group: string;
  applications: string[];
}

export interface LogSource {
  id: string;
  name: string;
  directory: string;
  project?: string;
  date?: string;
}

export interface SourceSelection {
  sourceId: string;
  project: string;
  date: string;
}

export interface SourceOptions {
  sources: LogSourceOption[];
}
