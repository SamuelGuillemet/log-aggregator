export type ApplicationTier = "back" | "front";

export type ConnectionStatus =
  | "connected"
  | "disconnected"
  | "watching"
  | "error";

export interface EnvironmentMatrixEntry {
  environment: string;
  country: string;
  code: string;
  host: string;
  shares: string[];
}

export interface LogSource {
  id: string;
  name: string;
  directory: string;
  environment?: string;
  country?: string;
  project?: string;
  date?: string;
  tier?: ApplicationTier;
}

export interface SourceSelection {
  environment: string;
  country: string;
  tier: ApplicationTier;
  project: string;
  date: string;
}

export interface SourceOptions {
  environments: string[];
  countriesByEnvironment: Record<string, string[]>;
  tiers: ApplicationTier[];
}
