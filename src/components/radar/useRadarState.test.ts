import assert from 'node:assert/strict';
import test from 'node:test';

import { defaultState, urlFor } from './useRadarState';

test('list filters appear in the URL only on 一面', () => {
  const filtered = { ...defaultState, channel: 'career' as const, region: 'Japan' as const, query: 'MCP', page: 2 };
  assert.equal(urlFor(filtered), '?ch=career&region=Japan&q=MCP&page=2');
  assert.equal(urlFor({ ...filtered, view: 'knowledge' }), '?v=map');
});

test('a 二面 link carries the article id', () => {
  assert.equal(urlFor({ ...defaultState, article: 'abc' }), '?a=abc');
});
