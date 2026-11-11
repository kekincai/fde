import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  FETCH_USER_AGENT,
  ingestFailureKind,
  QUEUE_MAX_RETRIES,
  isDeferredYoutubeFeedFailure,
  isPermanentFetchFailure,
  shouldRetryYoutubeFeedFailure,
  sourceBackoffSeconds,
  willRetryInQueue,
  youtubeFeedRetryUrl
} from './fetchPolicy.ts';

test('uses a transparent browser-compatible crawler identity', () => {
  assert.match(FETCH_USER_AGENT, /^Mozilla\/5\.0/);
  assert.match(FETCH_USER_AGENT, /FDERadarBot/);
  assert.match(FETCH_USER_AGENT, /github\.com\/kekincai\/fde/);
});

test('only treats repeated access blocks as permanent', () => {
  assert.equal(isPermanentFetchFailure({ status: 401 }), true);
  assert.equal(isPermanentFetchFailure({ status: 403 }, 1), false);
  assert.equal(isPermanentFetchFailure({ status: 403 }, 2), false);
  assert.equal(isPermanentFetchFailure({ status: 403 }, 3), true);
  assert.equal(isPermanentFetchFailure({ status: 429 }), false);
  assert.equal(isPermanentFetchFailure({ status: 500 }), false);
});

test('briefly retries access blocks before a seven day manual-review backoff', () => {
  assert.equal(sourceBackoffSeconds({ status: 403 }, 1), 120);
  assert.equal(sourceBackoffSeconds({ status: 403 }, 2), 240);
  assert.equal(sourceBackoffSeconds({ status: 403 }, 3), 7 * 86_400);
});

test('honors retry-after and caps transient exponential backoff at one day', () => {
  assert.equal(sourceBackoffSeconds({ status: 429, retryAfterSeconds: 900 }, 1), 900);
  assert.equal(sourceBackoffSeconds({ status: 500 }, 20), 86_400);
});

test('allows rate-sensitive sources to enforce a longer minimum backoff', () => {
  assert.equal(sourceBackoffSeconds({ status: 429, retryAfterSeconds: 240 }, 2, 21_600), 21_600);
});

test('defers intermittent YouTube RSS 404s without hiding other missing resources', () => {
  const youtube = { fetchMode: 'rss', feedUrl: 'https://www.youtube.com/feeds/videos.xml?channel_id=example' };
  assert.equal(isDeferredYoutubeFeedFailure(youtube, { status: 404 }), true);
  assert.equal(isDeferredYoutubeFeedFailure(youtube, { status: 403 }), false);
  assert.equal(isDeferredYoutubeFeedFailure({ fetchMode: 'rss', feedUrl: 'https://example.com/feed' }, { status: 404 }), false);
  assert.equal(isDeferredYoutubeFeedFailure({ fetchMode: 'html' }, { status: 404 }), false);
  assert.equal(sourceBackoffSeconds({ status: 404 }, 1, 21_600), 21_600);
});

test('retries transient YouTube feed failures through an uncached URL', () => {
  const youtube = { fetchMode: 'rss', feedUrl: 'https://www.youtube.com/feeds/videos.xml?channel_id=example' };
  assert.equal(shouldRetryYoutubeFeedFailure(youtube, { status: 404 }), true);
  assert.equal(shouldRetryYoutubeFeedFailure(youtube, { status: 500 }), true);
  assert.equal(shouldRetryYoutubeFeedFailure(youtube, { status: 429 }), false);
  assert.equal(shouldRetryYoutubeFeedFailure({ fetchMode: 'rss', feedUrl: 'https://example.com/feed' }, { status: 500 }), false);
  assert.equal(
    youtubeFeedRetryUrl(youtube.feedUrl, 123),
    'https://www.youtube.com/feeds/videos.xml?channel_id=example&fde_retry=123'
  );
});

test('a failing run is retried by the Queue and only its last delivery is recorded', () => {
  const site = { fetchMode: 'rss', feedUrl: 'https://example.com/feed.xml' };
  const kind = ingestFailureKind(site, { status: 503 }, 1);
  assert.equal(kind, 'retryable');
  // max_retries = 3 → deliveries 1..4; deliveries 1-3 retry silently, delivery 4 records one failure.
  assert.deepEqual([1, 2, 3, 4].map((attempt) => willRetryInQueue(kind, attempt, 3)), [true, true, true, false]);
});

test('access blocks need three failed runs, not three Queue retries, before manual review', () => {
  const site = { fetchMode: 'html' };
  assert.equal(ingestFailureKind(site, { status: 403 }, 1), 'retryable');
  assert.equal(ingestFailureKind(site, { status: 403 }, 2), 'retryable');
  assert.equal(ingestFailureKind(site, { status: 403 }, 3), 'permanent');
  assert.equal(willRetryInQueue('permanent', 1, 3), false);
});

test('rate limits and missing YouTube feeds are deferred without a Queue retry', () => {
  assert.equal(ingestFailureKind({ fetchMode: 'html' }, { status: 429 }, 1), 'deferred');
  const youtube = { fetchMode: 'rss', feedUrl: 'https://www.youtube.com/feeds/videos.xml?channel_id=x' };
  assert.equal(ingestFailureKind(youtube, { status: 404 }, 1), 'deferred');
  assert.equal(willRetryInQueue('deferred', 1, 3), false);
});

test('QUEUE_MAX_RETRIES matches the queue consumer in wrangler.toml', () => {
  const toml = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
  assert.equal(Number(toml.match(/^max_retries\s*=\s*(\d+)$/m)?.[1]), QUEUE_MAX_RETRIES);
});
