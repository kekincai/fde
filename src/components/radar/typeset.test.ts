import assert from 'node:assert/strict';
import test from 'node:test';

import { countLabel, issueFileName, issueOf, kanjiNum, kanjiTime, splitHeadline } from './typeset';

test('kanji numerals: positional below 100, digit by digit above', () => {
  assert.equal(kanjiNum(0), '〇');
  assert.equal(kanjiNum(13), '十三');
  assert.equal(kanjiNum(40), '四十');
  assert.equal(kanjiNum(158), '一五八');
});

test('an unknown count prints a dash, not 〇件', () => {
  assert.equal(countLabel(undefined), '―');
  assert.equal(countLabel(0), '〇件');
  assert.equal(countLabel(12), '十二件');
});

test('noon and midnight print as 零時', () => {
  assert.equal(kanjiTime('2026-11-11T03:40:00Z'), '午後零時半');
  assert.equal(kanjiTime('2026-11-10T15:05:00Z'), '午前零時');
  assert.equal(kanjiTime('2026-11-11T00:00:00Z'), '午前九時');
});

test('collection times map onto 朝刊 and 夕刊 editions', () => {
  const at = (iso: string) => issueOf(new Date(iso));
  assert.deepEqual([at('2026-11-10T12:00:00Z').kind, at('2026-11-10T12:00:00Z').han], ['朝刊', 12]); // 21時 → next morning
  assert.deepEqual([at('2026-11-10T18:00:00Z').kind, at('2026-11-10T18:00:00Z').han], ['朝刊', 14]); // 3時
  assert.deepEqual([at('2026-11-11T00:00:00Z').kind, at('2026-11-11T00:00:00Z').han], ['夕刊', 3]);  // 9時
  assert.equal(issueFileName(at('2026-11-11T00:00:00Z'), '一面'), 'ＦＤＥレーダー_2026-11-11_夕刊第95号_3版_一面');
});

test('headlines split at a natural break into a main line and a 袖見出し', () => {
  assert.deepEqual(splitHeadline('Claude Code の権限設計：本番導入で確認すべき五項目'), { main: 'Claude Code の権限設計', sub: '本番導入で確認すべき五項目' });
  assert.deepEqual(splitHeadline('短い見出し'), { main: '短い見出し', sub: '' });
});
