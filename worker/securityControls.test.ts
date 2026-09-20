import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { BodyTooLargeError, consumeRequestLimit, hasConfiguredBearerToken, isPublicAnalyticsEvent, readLimitedText } from './securityControls.ts';

test('operator bearer authorization fails closed but accepts the configured secret', () => {
  assert.equal(hasConfiguredBearerToken(null), false);
  assert.equal(hasConfiguredBearerToken('Bearer anything'), false);
  assert.equal(hasConfiguredBearerToken(null, 'secret'), false);
  assert.equal(hasConfiguredBearerToken('Bearer wrong', 'secret'), false);
  assert.equal(hasConfiguredBearerToken('Bearer secret', 'secret'), true);
});

test('public analytics permits reading events but not server-owned bookmark events', () => {
  for (const event of ['page_view', 'section_view', 'article_open', 'source_click']) {
    assert.equal(isPublicAnalyticsEvent(event), true);
  }
  for (const event of ['bookmark_save', 'bookmark_remove', null, 'unknown']) {
    assert.equal(isPublicAnalyticsEvent(event), false);
  }
});

test('body reader accepts the byte limit and rejects misleading or absent lengths', async () => {
  assert.equal(await readLimitedText(new Response('1234'), 4), '1234');
  await assert.rejects(readLimitedText(new Response('12345'), 4), BodyTooLargeError);
  await assert.rejects(readLimitedText(new Response('12345', { headers: { 'content-length': '2' } }), 4), BodyTooLargeError);
  await assert.rejects(readLimitedText(new Response('123', { headers: { 'content-length': '5' } }), 4), BodyTooLargeError);
  await assert.rejects(readLimitedText(new Response('あ'), 2), BodyTooLargeError);
});

test('body reader cancels an oversized streamed response', async () => {
  let canceled = false;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('123'));
      controller.enqueue(new TextEncoder().encode('456'));
    },
    cancel() { canceled = true; }
  });
  await assert.rejects(readLimitedText(new Response(body), 4), BodyTooLargeError);
  assert.equal(canceled, true);
});

test('D1 rate limit counts atomically, rejects overflow, and resets after the window', async () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    sqlite.exec(readFileSync(new URL('../migrations/0024_request_rate_limits.sql', import.meta.url), 'utf8'));
    const db = {
      prepare(sql: string) {
        return {
          bind(...values: Array<string | number>) {
            return { first: async () => sqlite.prepare(sql).get(...values) };
          }
        };
      }
    } as unknown as D1Database;

    const concurrent = await Promise.all(Array.from({ length: 20 }, () => consumeRequestLimit(db, 'one-ip:login', 10, 600, 1_000)));
    assert.equal(concurrent.filter(Boolean).length, 10);
    const writesBeforeOverflow = sqlite.prepare('SELECT total_changes() AS count').get()?.count;
    assert.equal(await consumeRequestLimit(db, 'one-ip:login', 10, 600, 1_599), false);
    assert.equal(sqlite.prepare('SELECT total_changes() AS count').get()?.count, writesBeforeOverflow);
    assert.equal(await consumeRequestLimit(db, 'one-ip:login', 10, 600, 1_600), true);
    assert.equal(await consumeRequestLimit(db, 'other-ip:login', 10, 600, 1_000), true);
    assert.equal(await consumeRequestLimit(db, 'one-ip:analytics', 120, 600, 1_000), true);
  } finally {
    sqlite.close();
  }
});

test('bookmark actions are emitted only for a real saved-state transition', () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    sqlite.exec('CREATE TABLE user_bookmarks (user_id TEXT, article_id TEXT, PRIMARY KEY (user_id, article_id))');
    const add = sqlite.prepare('INSERT OR IGNORE INTO user_bookmarks (user_id, article_id) VALUES (?, ?)');
    const remove = sqlite.prepare('DELETE FROM user_bookmarks WHERE user_id = ? AND article_id = ?');
    assert.equal(add.run('user', 'article').changes, 1);
    assert.equal(add.run('user', 'article').changes, 0);
    assert.equal(remove.run('user', 'article').changes, 1);
    assert.equal(remove.run('user', 'article').changes, 0);
  } finally {
    sqlite.close();
  }
});

test('challenge and session expiry comparisons use actual time rather than ISO text order', () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    const expired = '2026-09-20T00:05:00.000Z';
    const now = '2026-09-20T00:06:00.000Z';
    assert.equal(sqlite.prepare('SELECT ? > ? AS active').get(expired, now.replace('T', ' ').replace('.000Z', ''))?.active, 1);
    assert.equal(sqlite.prepare('SELECT julianday(?) > julianday(?) AS active').get(expired, now)?.active, 0);
    assert.equal(sqlite.prepare('SELECT julianday(?) > julianday(?) AS active').get('2026-09-20T00:07:00.000Z', now)?.active, 1);
    const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /expires_at\s*(?:>|<=)\s*CURRENT_TIMESTAMP/);
  } finally {
    sqlite.close();
  }
});
