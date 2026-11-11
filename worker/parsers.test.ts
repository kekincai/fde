import assert from 'node:assert/strict';
import test from 'node:test';

import { parseApiResponse, parseQiitaItem, parseRssResponse, safeIsoDate } from './parsers';
import type { SourceRecord } from './sourceRegistry';

const source: SourceRecord = {
  id: 'feed', name: 'Example Feed', homepage: 'https://example.com/', feedUrl: 'https://example.com/feed',
  fetchMode: 'rss', language: 'en', country: 'GLOBAL', kind: 'official', contentType: 'news',
  defaultPillar: 'Build', sourceTier: 1, weight: 90, minScore: 40, priority: 90, pollIntervalMinutes: 360
};

const rss = (items: string) => `<?xml version="1.0"?><rss><channel>${items}</channel></rss>`;
const item = (title: string, description = '', pubDate = 'Tue, 10 Nov 2026 03:00:00 GMT') =>
  `<item><title>${title}</title><link>https://example.com/${encodeURIComponent(title)}</link><description>${description}</description><pubDate>${pubDate}</pubDate></item>`;

test('RSS keeps items that only mention MCP or 大規模言語モデル (same AI vocabulary as the Hard Gate)', () => {
  const items = parseRssResponse(source, rss(item('Connecting tools over MCP') + item('大規模言語モデルの本番運用') + item('Quarterly earnings call')));
  assert.deepEqual(items.map((entry) => entry.title), ['Connecting tools over MCP', '大規模言語モデルの本番運用']);
});

test('RSS leaves includeTerms to the Hard Gate, so out-of-scope items are still recorded there', () => {
  const scoped = { ...source, includeTerms: ['Gemini'] };
  assert.equal(parseRssResponse(scoped, rss(item('Claude agents in production'))).length, 1);
});

test('RSS dates are normalised to ISO, and a missing date falls back to now', () => {
  const [dated] = parseRssResponse(source, rss(item('AI rollout', '', 'Tue, 10 Nov 2026 03:00:00 GMT')));
  assert.equal(dated.publishedAt, '2026-11-10T03:00:00.000Z');
  const before = Date.now();
  const [undated] = parseRssResponse(source, rss(item('AI rollout', '', '')));
  assert.ok(Date.parse(undated.publishedAt) >= before - 1000);
});

test('safeIsoDate accepts strings and numbers and never throws', () => {
  assert.equal(safeIsoDate('2026-06-01T00:00:00+09:00'), '2026-05-31T15:00:00.000Z');
  assert.equal(safeIsoDate(Date.UTC(2026, 0, 2)), '2026-01-02T00:00:00.000Z');
  for (const bad of [undefined, null, {}, 'not a date']) assert.ok(Number.isFinite(Date.parse(safeIsoDate(bad))));
});

test('career APIs keep only FDE roles with an AI context', () => {
  const careers = { ...source, kind: 'careers' as const, fetchMode: 'api' as const, name: 'Example Careers' };
  const jobs = parseApiResponse(careers, JSON.stringify({ jobs: [
    { id: 1, title: 'Forward Deployed Engineer', content: 'Deploy LLM agents with customers', absolute_url: 'https://jobs.example.com/1', location: { name: 'Tokyo, Japan' } },
    { id: 2, title: 'Account Executive', content: 'Sell AI', absolute_url: 'https://jobs.example.com/2' }
  ] }));
  assert.deepEqual(jobs.map((job) => job.title), ['Forward Deployed Engineer']);
  assert.equal(jobs[0].countryRelevance, 'JP');
});

test('Qiita posts need the role or a delivery context, not just an AI mention', () => {
  const base = { id: 'q', url: 'https://qiita.com/x/items/q', created_at: '2026-11-01T00:00:00+09:00', tags: [] };
  assert.equal(parseQiitaItem({ ...base, title: '生成AIを顧客の業務へ本番導入した話', body: '顧客企業の業務フローに組み込み、運用まで担当した。' }).length, 1);
  assert.equal(parseQiitaItem({ ...base, title: '生成AIで遊んでみた', body: '面白かった。' }).length, 0);
});
