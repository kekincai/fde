export type FetchFailureLike = {
  status?: number;
  retryAfterSeconds?: number;
};

type FetchSourceLike = {
  fetchMode: string;
  feedUrl?: string;
};

// Some public-sector sites reject bare product user agents while accepting a
// standards-compatible, still transparent crawler identity.
export const FETCH_USER_AGENT =
  'Mozilla/5.0 (compatible; FDERadarBot/1.0; +https://github.com/kekincai/fde)';

export function isPermanentFetchFailure(failure: FetchFailureLike, attempts = 1): boolean {
  return failure.status === 401 || (failure.status === 403 && attempts >= 3);
}

export function isYoutubeFeedSource(source: FetchSourceLike): boolean {
  return source.fetchMode === 'rss'
    && source.feedUrl?.startsWith('https://www.youtube.com/feeds/videos.xml?') === true;
}

export function isDeferredYoutubeFeedFailure(source: FetchSourceLike, failure: FetchFailureLike): boolean {
  return failure.status === 404 && source.fetchMode === 'rss'
    && source.feedUrl?.startsWith('https://www.youtube.com/feeds/videos.xml?') === true;
}

export function shouldRetryYoutubeFeedFailure(source: FetchSourceLike, failure: FetchFailureLike): boolean {
  return isYoutubeFeedSource(source)
    && (failure.status === 404 || (failure.status !== undefined && failure.status >= 500 && failure.status <= 599));
}

export function youtubeFeedRetryUrl(rawUrl: string, nonce = Date.now()): string {
  const url = new URL(rawUrl);
  url.searchParams.set('fde_retry', String(nonce));
  return url.toString();
}

export function sourceBackoffSeconds(failure: FetchFailureLike, attempts: number, minimumSeconds = 60): number {
  if (isPermanentFetchFailure(failure, attempts)) return 7 * 86_400;
  if (failure.retryAfterSeconds !== undefined) return Math.max(minimumSeconds, failure.retryAfterSeconds);
  return Math.max(minimumSeconds, Math.min(86_400, 60 * 2 ** Math.min(Math.max(1, attempts), 11)));
}
