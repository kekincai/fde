import assert from 'node:assert/strict';
import test from 'node:test';

import { FETCH_USER_AGENT, isPermanentFetchFailure, sourceBackoffSeconds } from './fetchPolicy.ts';

test('uses a transparent browser-compatible crawler identity', () => {
  assert.match(FETCH_USER_AGENT, /^Mozilla\/5\.0/);
  assert.match(FETCH_USER_AGENT, /FDERadarBot/);
  assert.match(FETCH_USER_AGENT, /github\.com\/kekincai\/fde/);
});

test('does not queue-retry authorization blocks', () => {
  assert.equal(isPermanentFetchFailure({ status: 401 }), true);
  assert.equal(isPermanentFetchFailure({ status: 403 }), true);
  assert.equal(isPermanentFetchFailure({ status: 429 }), false);
  assert.equal(isPermanentFetchFailure({ status: 500 }), false);
});

test('backs off blocked sources for seven days', () => {
  assert.equal(sourceBackoffSeconds({ status: 403 }, 1), 7 * 86_400);
});

test('honors retry-after and caps transient exponential backoff at one day', () => {
  assert.equal(sourceBackoffSeconds({ status: 429, retryAfterSeconds: 900 }, 1), 900);
  assert.equal(sourceBackoffSeconds({ status: 500 }, 20), 86_400);
});

test('allows rate-sensitive sources to enforce a longer minimum backoff', () => {
  assert.equal(sourceBackoffSeconds({ status: 429, retryAfterSeconds: 240 }, 2, 21_600), 21_600);
});
