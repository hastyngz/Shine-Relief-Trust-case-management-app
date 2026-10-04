export interface NamedCandidate {
  id: string;
  name: string;
}

export interface NameMatchResult {
  exact: NamedCandidate[];
  possible: NamedCandidate[];
}

const ALIAS_GROUPS = [
  ['margaret', 'magret', 'maggie'],
  ['ida', 'idah', 'aida'],
  ['patience', 'petience'],
];

export function normalizePersonName(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function distance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    let diagonal = previous[0];
    previous[0] = row;
    for (let column = 1; column <= right.length; column += 1) {
      const above = previous[column];
      previous[column] = Math.min(
        previous[column] + 1,
        previous[column - 1] + 1,
        diagonal + (left[row - 1] === right[column - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return previous[right.length];
}

function sharesAlias(name: string, candidate: string): boolean {
  const nameTokens = new Set(name.split(' '));
  return ALIAS_GROUPS.some((group) => {
    const hasName = group.some((alias) => nameTokens.has(alias));
    const hasCandidate = group.some((alias) => candidate.split(' ').some((token) => token === alias));
    return hasName && hasCandidate;
  });
}

export function matchNameCandidates(
  sourceName: string,
  candidates: NamedCandidate[],
): NameMatchResult {
  const normalizedSource = normalizePersonName(sourceName);
  const exact = candidates.filter((candidate) => normalizePersonName(candidate.name) === normalizedSource);
  if (exact.length > 0) return { exact, possible: [] };
  const possible = candidates.filter((candidate) => {
    const normalizedCandidate = normalizePersonName(candidate.name);
    return sharesAlias(normalizedSource, normalizedCandidate) ||
      distance(normalizedSource, normalizedCandidate) <= 2;
  });
  return { exact: [], possible };
}
