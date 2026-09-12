const PROJECT_PLACEHOLDER = "{project}";
const DATE_PLACEHOLDER = "{date}";
const DISCOVERY_PROJECT = "(?<project>.+?)";
const DISCOVERY_DATE = String.raw`\d{4}-\d{2}-\d{2}`;

export interface FileNameMatch {
  project: string;
  /** Optional `kind` capture, used to disambiguate several files of one application. */
  kind: string | undefined;
}

/**
 * Compiles the configured log file-name template.
 *
 * v1 hardcoded `serveur|fwk|ui|batch` into two separate regexes in the domain layer
 * and a third in the client. One configured template now drives selection matching
 * and application discovery alike.
 */
export class FileNameMatcher {
  private readonly discoveryPattern: RegExp;
  private readonly selectionCache = new Map<string, RegExp>();

  constructor(private readonly template: string) {
    if (!template.includes(PROJECT_PLACEHOLDER) || !template.includes(DATE_PLACEHOLDER)) {
      throw new Error(
        `parser.logFileName must contain ${PROJECT_PLACEHOLDER} and ${DATE_PLACEHOLDER}`,
      );
    }

    this.discoveryPattern = new RegExp(
      template
        .replaceAll(PROJECT_PLACEHOLDER, DISCOVERY_PROJECT)
        .replaceAll(DATE_PLACEHOLDER, DISCOVERY_DATE),
      "i",
    );
  }

  /** Extracts the application name from any log file, for the autocomplete list. */
  discover(fileName: string): FileNameMatch | undefined {
    const groups = this.discoveryPattern.exec(fileName)?.groups;

    return groups?.project ? { kind: groups.kind, project: groups.project } : undefined;
  }

  matches(fileName: string, project: string, date: string): FileNameMatch | undefined {
    const match = this.selectionPattern(project, date).exec(fileName);

    return match ? { kind: match.groups?.kind, project } : undefined;
  }

  private selectionPattern(project: string, date: string): RegExp {
    const key = `${project}\u0000${date}`;
    const cached = this.selectionCache.get(key);

    if (cached) {
      return cached;
    }

    const pattern = new RegExp(
      this.template
        .replaceAll(PROJECT_PLACEHOLDER, escapeRegExp(project))
        .replaceAll(DATE_PLACEHOLDER, escapeRegExp(date)),
      "i",
    );

    this.selectionCache.set(key, pattern);

    return pattern;
  }
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}
