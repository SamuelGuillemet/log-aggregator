import { type LogFilter, isEmptyFilter } from "@log-aggregator/shared";
import { MATCH_ALL, type EventPredicate, type StoredEvent } from "./eventBuffer.js";

const MAX_REGEX_LENGTH = 512;
/** Caps the input handed to a user regex, bounding backtracking by input size. */
const MAX_REGEX_INPUT = 16 * 1_024;

export interface CompiledFilter {
  match: EventPredicate;
  /** Set when the filter was accepted but degraded, e.g. an unsafe regex. */
  warning: string | undefined;
}

export function compileFilter(filter: LogFilter): CompiledFilter {
  if (isEmptyFilter(filter)) {
    return { match: MATCH_ALL, warning: undefined };
  }

  const { caseSensitive } = filter;
  const levels = filter.levels.length > 0 ? new Set(filter.levels) : undefined;
  const normalize = (term: string) => (caseSensitive ? term : term.toLowerCase());
  const includeAny = filter.includeAny.map(normalize).filter(Boolean);
  const includeAll = filter.includeAll.map(normalize).filter(Boolean);
  const excludeAny = filter.excludeAny.map(normalize).filter(Boolean);

  let warning: string | undefined;
  let regex: RegExp | undefined;
  let text = "";

  if (filter.text) {
    if (filter.regex) {
      const compiled = compileSafeRegex(filter.text, caseSensitive);

      if (compiled.ok) {
        regex = compiled.value;
      } else {
        // v1 silently degraded to a substring search, so the results quietly stopped
        // matching what the user asked for. Degrade, but say so.
        warning = `${compiled.error} Falling back to a plain text search.`;
        text = normalize(filter.text);
      }
    } else {
      text = normalize(filter.text);
    }
  }

  const needsText =
    Boolean(regex) ||
    text.length > 0 ||
    includeAny.length > 0 ||
    includeAll.length > 0 ||
    excludeAny.length > 0;

  return {
    match: (stored: StoredEvent) => {
      if (levels && !levels.has(stored.event.level)) {
        return false;
      }

      if (!needsText) {
        return true;
      }

      const haystack = searchText(stored, caseSensitive);

      if (includeAny.length > 0 && !includeAny.some((term) => haystack.includes(term))) {
        return false;
      }

      if (includeAll.length > 0 && !includeAll.every((term) => haystack.includes(term))) {
        return false;
      }

      if (excludeAny.some((term) => haystack.includes(term))) {
        return false;
      }

      if (regex) {
        return regex.test(haystack.slice(0, MAX_REGEX_INPUT));
      }

      return text.length === 0 || haystack.includes(text);
    },
    warning,
  };
}

/**
 * The raw line already contains the timestamp, level, parsed fields and message, so
 * matching it directly avoids building and lowercasing a joined string per event per
 * query the way v1's `buildFullText` did.
 */
function searchText(stored: StoredEvent, caseSensitive: boolean): string {
  if (caseSensitive) {
    return stored.event.raw;
  }

  stored.lowerRaw ??= stored.event.raw.toLowerCase();

  return stored.lowerRaw;
}

export type SafeRegexResult = { ok: true; value: RegExp } | { ok: false; error: string };

/**
 * Compiles a user-supplied pattern, refusing the shapes that cause catastrophic
 * backtracking. This is a heuristic, not a proof: it rejects nested quantifiers
 * such as `(a+)+`, but cannot detect every pathological alternation. Combined with
 * the input cap above it keeps a local-first server responsive without pulling in a
 * native RE2 binding. A worker-isolated matcher is the complete fix.
 */
export function compileSafeRegex(pattern: string, caseSensitive: boolean): SafeRegexResult {
  if (pattern.length > MAX_REGEX_LENGTH) {
    return { error: `Pattern is longer than ${MAX_REGEX_LENGTH} characters.`, ok: false };
  }

  if (hasNestedQuantifier(pattern)) {
    return { error: "Pattern contains nested quantifiers and could hang the server.", ok: false };
  }

  try {
    return { ok: true, value: new RegExp(pattern, caseSensitive ? "" : "i") };
  } catch {
    return { error: "Pattern is not a valid regular expression.", ok: false };
  }
}

function isQuantifier(character: string | undefined): boolean {
  return character === "*" || character === "+" || character === "{";
}

function hasNestedQuantifier(pattern: string): boolean {
  /** One entry per open group: whether that group already contains a quantifier. */
  const groups: boolean[] = [];
  let escaped = false;
  let inCharacterClass = false;

  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (character === "\\") {
      escaped = true;
      continue;
    }

    if (inCharacterClass) {
      inCharacterClass = character !== "]";
      continue;
    }

    if (character === "[") {
      inCharacterClass = true;
      continue;
    }

    if (character === "(") {
      groups.push(false);
      continue;
    }

    if (character === ")") {
      const containedQuantifier = groups.pop() ?? false;
      const quantified = isQuantifier(pattern[index + 1]);

      if (containedQuantifier && quantified) {
        return true;
      }

      if (groups.length > 0 && (containedQuantifier || quantified)) {
        groups[groups.length - 1] = true;
      }

      continue;
    }

    if (isQuantifier(character) && groups.length > 0) {
      groups[groups.length - 1] = true;
    }
  }

  return false;
}
