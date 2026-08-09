import assert from 'node:assert/strict';
import test from 'node:test';

import { chapterDefinitions, inferChapter } from './chapters.ts';
import { chaptersFor, sourceRegistry } from './sourceRegistry.ts';

test('defines a complete 24 chapter FDE knowledge map', () => {
  assert.equal(chapterDefinitions.length, 24);
  assert.equal(new Set(chapterDefinitions.map((chapter) => chapter.id)).size, 24);
  for (const pillar of ['Customer', 'Build', 'Deploy', 'Govern', 'Organization']) {
    assert.ok(chapterDefinitions.some((chapter) => chapter.pillar === pillar));
  }
});

test('maps measurable customer outcomes to ROI', () => {
  assert.equal(inferChapter('Customer', '問い合わせ時間を50%削減しROIを確認'), 'customer.roi');
});

test('maps permission design to deployment identity', () => {
  assert.equal(inferChapter('Deploy', 'agent identity and permission design'), 'deploy.identity');
});

test('maps adoption and training to change management', () => {
  assert.equal(inferChapter('Organization', '全社研修でAI利用を現場へ定着'), 'organization.change');
});

test('gives every chapter at least three configured sources', () => {
  for (const chapter of chapterDefinitions) {
    const sources = sourceRegistry.filter((source) => source.enabled !== false && chaptersFor(source).includes(chapter.id));
    assert.ok(sources.length >= 3, `${chapter.id} only has ${sources.length} sources`);
  }
});
