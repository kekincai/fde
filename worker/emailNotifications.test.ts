import assert from 'node:assert/strict';
import test from 'node:test';

import { jstDayWindow, renderDailyDigest, renderFailureEmail, sourceIssue, type SourceHealth } from './emailNotifications.ts';

const healthySource: SourceHealth = {
  id: 'source-1', name: '公式 <Source>', homepage: 'https://example.com/?a=1&b=2',
  poll_interval_minutes: 360, last_success_at: '2026-08-24T08:00:00.000Z',
  last_error_at: null, consecutive_failures: 0, backoff_until: null, created_at: '2026-08-01T00:00:00.000Z'
};

test('JST の日付境界を UTC に変換する', () => {
  assert.deepEqual(jstDayWindow(new Date('2026-08-24T09:30:00.000Z')), {
    day: '2026-08-24', start: '2026-08-23T15:00:00.000Z', end: '2026-08-24T09:30:00.000Z'
  });
});

test('3回連続失敗を異常と判定する', () => {
  const issue = sourceIssue({ ...healthySource, consecutive_failures: 3, last_error_at: '2026-08-24T09:00:00.000Z' }, new Date('2026-08-24T09:30:00.000Z'));
  assert.equal(issue?.reason, 'consecutive_failures');
  assert.match(issue?.detail ?? '', /3回連続/);
});

test('取得周期内の Source は正常と判定する', () => {
  assert.equal(sourceIssue(healthySource, new Date('2026-08-24T09:30:00.000Z')), null);
});

test('長期 backoff は1回目でも手動確認対象にする', () => {
  const issue = sourceIssue({
    ...healthySource, consecutive_failures: 1, last_error_at: '2026-08-24T09:00:00.000Z',
    backoff_until: '2026-08-31T09:00:00.000Z'
  }, new Date('2026-08-24T09:30:00.000Z'));
  assert.equal(issue?.reason, 'manual_review');
});

test('メール本文で外部コンテンツを HTML escape する', () => {
  const issue = sourceIssue({ ...healthySource, consecutive_failures: 3 }, new Date('2026-08-24T09:30:00.000Z'))!;
  const email = renderFailureEmail([issue], new Date('2026-08-24T09:30:00.000Z'));
  assert.match(email.html, /公式 &lt;Source&gt;/);
  assert.match(email.html, /a=1&amp;b=2/);
  assert.doesNotMatch(email.html, /公式 <Source>/);
});

test('日報は優先度・要約・取得健康度を含む', () => {
  const email = renderDailyDigest('2026-08-24', [{
    title: 'AI導入の実務', canonical_url: 'https://example.com/article', source_name: 'Example',
    core_pillar: 'Deploy', priority_level: 'P1', summary_ja: '現場導入の要点です。', summary: '',
    why_it_matters: '', recommended_action: '今週検証する', published_at: '2026-08-24T08:00:00.000Z'
  }], 1, { runs: 10, successful_runs: 9, failed_runs: 1, new_articles: 1 }, 60, 1);
  assert.match(email.subject, /新着 1件/);
  assert.match(email.html, /取得成功率 <b>90%/);
  assert.match(email.html, /現場導入の要点/);
  assert.match(email.text, /AI導入の実務/);
});
