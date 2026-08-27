export type FetchFailureLike = {
  status?: number;
  retryAfterSeconds?: number;
};

// Some public-sector sites reject bare product user agents while accepting a
// standards-compatible, still transparent crawler identity.
export const FETCH_USER_AGENT =
  'Mozilla/5.0 (compatible; FDERadarBot/1.0; +https://github.com/kekincai/fde)';

export function isPermanentFetchFailure(failure: FetchFailureLike): boolean {
  return failure.status === 401 || failure.status === 403;
}

export function sourceBackoffSeconds(failure: FetchFailureLike, attempts: number, minimumSeconds = 60): number {
  if (isPermanentFetchFailure(failure)) return 7 * 86_400;
  if (failure.retryAfterSeconds !== undefined) return Math.max(minimumSeconds, failure.retryAfterSeconds);
  return Math.max(minimumSeconds, Math.min(86_400, 60 * 2 ** Math.min(Math.max(1, attempts), 11)));
}
