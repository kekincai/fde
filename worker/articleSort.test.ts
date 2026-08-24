import assert from 'node:assert/strict';
import test from 'node:test';

import { articleOrderBy, normalizeArticleSort } from './articleSort.ts';

test('defaults article sorting to first collection time', () => {
  assert.equal(normalizeArticleSort(undefined), 'newest');
  assert.match(articleOrderBy('newest'), /first_seen_at/);
  assert.doesNotMatch(articleOrderBy('newest'), /priority_score DESC/);
});

test('keeps priority and publication sorting explicit', () => {
  assert.equal(normalizeArticleSort('priority'), 'priority');
  assert.equal(normalizeArticleSort('published'), 'published');
  assert.equal(normalizeArticleSort('unsupported'), 'newest');
  assert.match(articleOrderBy('priority'), /priority_score DESC/);
  assert.match(articleOrderBy('published'), /published_at/);
});
