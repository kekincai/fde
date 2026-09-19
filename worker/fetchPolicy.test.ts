import assert from 'node:assert/strict';
import test from 'node:test';

import { FETCH_USER_AGENT, isDeferredYoutubeFeedFailure, isPermanentFetchFailure, sourceBackoffSeconds } from './fetchPolicy.ts';

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
