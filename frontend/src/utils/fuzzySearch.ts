/**
 * Lightweight fuzzy matching for bridge search.
 *
 * Matching is token based. Every token of the query must match at least one
 * token of the bridge's searchable fields (name, supported asset symbols and
 * destination chains). A token matches when it is equal to, a prefix of, or
 * within a small edit distance of a candidate token. Known symbol aliases such
 * as "ether" for ETH are mapped to a canonical symbol first.
 */

export interface FuzzySearchable {
  name: string;
  /** Supported token symbols, e.g. ["USDC", "ETH"]. */
  assets?: readonly string[];
  /** Destination chains, e.g. ["Ethereum", "Base"]. */
  destinationChains?: readonly string[];
}

export interface MatchSegment {
  text: string;
  matched: boolean;
}

/** Canonical lowercase symbol -> alternative spellings (single words only). */
const TOKEN_ALIASES: Readonly<Record<string, readonly string[]>> = {
  eth: ["ether", "weth"],
  btc: ["bitcoin", "wbtc"],
  usdt: ["tether"],
};

const ALIAS_TO_CANONICAL: ReadonlyMap<string, string> = buildAliasIndex(TOKEN_ALIASES);

function buildAliasIndex(aliases: Readonly<Record<string, readonly string[]>>): Map<string, string> {
  const index = new Map<string, string>();
  for (const [canonical, alternatives] of Object.entries(aliases)) {
    index.set(canonical, canonical);
    for (const alternative of alternatives) {
      index.set(alternative, canonical);
    }
  }
  return index;
}

/** Lowercase alphanumeric words of `text`. Empty words are dropped. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 0);
}

/** Classic Levenshtein edit distance, computed with two rows. */
export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let previous: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current: number[] = [i];
    for (let j = 1; j <= b.length; j++) {
      const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + substitutionCost
      );
    }
    previous = current;
  }
  return previous[b.length];
}

/** Typos allowed for a query token: none for short tokens, more for longer ones. */
function allowedTypos(length: number): number {
  if (length <= 3) return 0;
  if (length <= 6) return 1;
  return 2;
}

function canonicalToken(token: string): string {
  return ALIAS_TO_CANONICAL.get(token) ?? token;
}

/** 3 = equal, 2 = prefix, 1 = within the typo budget, 0 = no match. */
function scoreToken(queryToken: string, candidateToken: string): number {
  if (candidateToken === queryToken) return 3;
  if (queryToken.length >= 2 && candidateToken.startsWith(queryToken)) return 2;
  const budget = allowedTypos(queryToken.length);
  if (budget > 0 && levenshteinDistance(queryToken, candidateToken) <= budget) return 1;
  return 0;
}

/**
 * Score `query` against a set of candidate strings.
 *
 * Every query token must match some candidate token. The score is the sum of
 * each query token's best match, so 0 means no match. A query with no tokens
 * also scores 0 here. Callers decide how to treat an empty query.
 */
export function scoreFuzzyMatch(query: string, candidates: readonly string[]): number {
  const queryTokens = tokenize(query).map(canonicalToken);
  if (queryTokens.length === 0) return 0;

  const candidateTokens = candidates.flatMap(tokenize).map(canonicalToken);
  let total = 0;
  for (const queryToken of queryTokens) {
    let best = 0;
    for (const candidateToken of candidateTokens) {
      best = Math.max(best, scoreToken(queryToken, candidateToken));
      if (best === 3) break;
    }
    if (best === 0) return 0;
    total += best;
  }
  return total;
}

function searchableFields(item: FuzzySearchable): string[] {
  return [item.name, ...(item.assets ?? []), ...(item.destinationChains ?? [])];
}

/**
 * Return the items that match `query`, best match first. Ties keep their
 * original order. An empty query returns a copy of all items unchanged.
 */
export function filterByFuzzyQuery<T extends FuzzySearchable>(
  items: readonly T[],
  query: string
): T[] {
  if (tokenize(query).length === 0) return [...items];

  const scored: { item: T; score: number; index: number }[] = [];
  items.forEach((item, index) => {
    const score = scoreFuzzyMatch(query, searchableFields(item));
    if (score > 0) scored.push({ item, score, index });
  });
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored.map((entry) => entry.item);
}

/**
 * Split `text` into matched and unmatched segments for highlighting. A segment
 * is matched when it is a case-insensitive exact occurrence of a query token.
 * Typo matches are not highlighted, because there is no exact span to mark.
 */
export function highlightSegments(text: string, query: string): MatchSegment[] {
  if (text.length === 0) return [];

  const lower = text.toLowerCase();
  // Lowercasing can change string length for some Unicode input. Skip
  // highlighting then, rather than mark the wrong characters.
  if (lower.length !== text.length) return [{ text, matched: false }];

  const ranges: Array<[number, number]> = [];
  for (const token of tokenize(query)) {
    let from = 0;
    for (;;) {
      const at = lower.indexOf(token, from);
      if (at === -1) break;
      ranges.push([at, at + token.length]);
      from = at + token.length;
    }
  }

  ranges.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const [start, end] of ranges) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) {
      last[1] = Math.max(last[1], end);
    } else {
      merged.push([start, end]);
    }
  }

  const segments: MatchSegment[] = [];
  let cursor = 0;
  for (const [start, end] of merged) {
    if (start > cursor) segments.push({ text: text.slice(cursor, start), matched: false });
    segments.push({ text: text.slice(start, end), matched: true });
    cursor = end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), matched: false });
  return segments;
}
