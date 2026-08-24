import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateCandidate, SEMANTIC_REVIEW_POLICY } from './intelligence.ts';
import type { SourceRecord } from './sourceRegistry.ts';

const source: SourceRecord = {
  id: 'test', name: 'Test', homepage: 'https://example.com', fetchMode: 'rss', language: 'ja',
  country: 'JP', kind: 'media', contentType: 'news', defaultPillar: 'Japan', sourceTier: 2,
  weight: 80, minScore: 45, priority: 80, pollIntervalMinutes: 360,
  stream: 'japan-enterprise', semanticPolicy: 'required'
};

test('defines FDE positively without unrelated role comparisons', () => {
  assert.match(SEMANTIC_REVIEW_POLICY, /課題発見.*本番導入.*利用定着/);
  assert.doesNotMatch(SEMANTIC_REVIEW_POLICY, /フロント|front.?end|前端/i);
});

test('rejects generic AI news without an FDE consequence', () => {
  const result = evaluateCandidate(source, {
    title: '新しい生成AIモデルを発表', summary: 'パラメータ数を増やしました。', tags: ['AI'], url: 'https://example.com/1'
  });
  assert.equal(result.decision, 'reject');
  assert.ok(result.reasons.includes('ai-without-fde-consequence'));
});

test('sends enterprise deployment evidence to semantic review', () => {
  const result = evaluateCandidate(source, {
    title: '生成AIを顧客業務へ本番導入',
    summary: '権限設計と評価を行い、現場のワークフローへ展開した。', tags: ['導入事例'], url: 'https://example.com/2'
  });
  assert.equal(result.decision, 'review');
  assert.ok(result.score >= source.minScore);
});

test('rejects broad government notices outside targeted AI scope', () => {
  const result = evaluateCandidate({ ...source, kind: 'government', includeTerms: ['生成AI', 'Gennai'] }, {
    title: '調達情報を更新しました', summary: '行政手続に関する一般のお知らせです。', tags: [], url: 'https://example.com/3'
  });
  assert.equal(result.decision, 'reject');
  assert.ok(result.reasons.includes('outside-source-scope'));
});

test('accepts explicit FDE role evidence with customer delivery scope', () => {
  const result = evaluateCandidate({ ...source, kind: 'careers', semanticPolicy: 'none' }, {
    title: 'Forward Deployed Engineer',
    summary: '顧客と一緒にAIを実装し、本番導入と運用を担う。', tags: ['FDE'], url: 'https://example.com/4'
  });
  assert.equal(result.decision, 'publish');
});

test('accepts an official generative AI privacy warning as governance evidence', () => {
  const result = evaluateCandidate({ ...source, kind: 'government', semanticPolicy: 'none', minScore: 30 }, {
    title: '生成AIサービスの利用に関する注意喚起',
    summary: '個人情報保護委員会が生成AI利用時の個人情報の取扱いを示した。',
    tags: ['生成AI', '個人情報'], url: 'https://example.com/5'
  });
  assert.equal(result.decision, 'publish');
  assert.ok(result.reasons.includes('control-context'));
});

test('recognizes ChatGPT and Codex customer workflow evidence', () => {
  const result = evaluateCandidate({ ...source, country: 'GLOBAL', kind: 'official' }, {
    title: 'How a customer uses ChatGPT Work',
    summary: 'The company used Codex to compress a production workflow from weeks to days.',
    tags: [], url: 'https://example.com/6'
  });
  assert.equal(result.decision, 'review');
  assert.ok(result.reasons.includes('customer-context'));
  assert.ok(result.reasons.includes('delivery-context'));
});

test('accepts an official Japanese AI guideline as governance evidence', () => {
  const result = evaluateCandidate({
    ...source, kind: 'government', semanticPolicy: 'none', minScore: 35,
    fixedChapter: 'govern.regulation'
  }, {
    title: 'AI事業者ガイドライン（METI/経済産業省）',
    summary: 'AI事業者向けの公式ガイドラインです。',
    tags: ['AI'], url: 'https://example.com/7'
  });
  assert.equal(result.decision, 'publish');
  assert.ok(result.reasons.includes('control-context'));
});
