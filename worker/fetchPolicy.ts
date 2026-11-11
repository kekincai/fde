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

/** `max_retries` of the queue consumer in wrangler.toml (fetchPolicy.test.ts keeps them in step). */
export const QUEUE_MAX_RETRIES = 3;

export type IngestFailureKind = 'permanent' | 'deferred' | 'retryable';

/** `runs` counts collection runs that failed in a row, including this one (not Queue attempts). */
export function ingestFailureKind(source: FetchSourceLike, failure: FetchFailureLike, runs: number): IngestFailureKind {
  if (isPermanentFetchFailure(failure, runs)) return 'permanent';
  if (isDeferredYoutubeFeedFailure(source, failure) || failure.status === 429) return 'deferred';
  return 'retryable';
}

/**
 * Whether the Queue will deliver this message again. Only the last delivery of a run records the
 * failure, so one outage costs one step of consecutive_failures, not one per retry.
 * `attempt` is the 1-based Message.attempts; `maxRetries` mirrors wrangler.toml.
 */
export function willRetryInQueue(kind: IngestFailureKind, attempt: number, maxRetries: number): boolean {
  return kind === 'retryable' && attempt <= maxRetries;
}

export function sourceBackoffSeconds(failure: FetchFailureLike, attempts: number, minimumSeconds = 60): number {
  if (isPermanentFetchFailure(failure, attempts)) return 7 * 86_400;
  if (failure.retryAfterSeconds !== undefined) return Math.max(minimumSeconds, failure.retryAfterSeconds);
  return Math.max(minimumSeconds, Math.min(86_400, 60 * 2 ** Math.min(Math.max(1, attempts), 11)));
}
