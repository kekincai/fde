import assert from 'node:assert/strict';
import test from 'node:test';

import { fromApi, isThinChapter, parseDate, usefulNote } from './model';

test('D1 timestamps without a zone are read as UTC', () => {
  assert.equal(parseDate('2026-11-11 00:30:00')?.toISOString(), '2026-11-11T00:30:00.000Z');
  assert.equal(parseDate(''), null);
  assert.equal(parseDate('nonsense'), null);
});

test('fromApi needs an id, a title and a URL, and rounds the REAL score', () => {
  assert.equal(fromApi({ id: 'a', title: 't' }), null);
  const article = fromApi({ id: 'a', title: 't', canonical_url: 'https://x', fde_score: 87.5, country_relevance: 'JP' });
  assert.equal(article?.score, 88);
  assert.equal(article?.region, 'Japan');
});

test('薄い章 means anything short of healthy, including empty', () => {
  assert.equal(isThinChapter({ status: 'healthy' }), false);
  assert.equal(isThinChapter({ status: 'thin' }), true);
  assert.equal(isThinChapter({ status: 'empty' }), true);
});

test('generated notes that restate the summary are dropped', () => {
  const article = { title: 'Agents in production', summary: '顧客の業務フローにエージェントを組み込み本番運用した事例。' };
  assert.equal(usefulNote('顧客の業務フローにエージェントを組み込み本番運用した事例です', article), '');
  assert.equal(usefulNote('権限設計と監視の要件を先に決めておく必要がある', article), '権限設計と監視の要件を先に決めておく必要がある');
});
