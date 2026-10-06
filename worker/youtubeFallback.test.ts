import assert from 'node:assert/strict';
import test from 'node:test';

import { parseYoutubeChannelPage } from './youtubeFallback.ts';

test('parses current YouTube lockup view models without an API key', () => {
  const body = `<script>var ytInitialData = ${JSON.stringify({
    contents: [{
      lockupViewModel: {
        contentId: 'video-123',
        metadata: { lockupMetadataViewModel: {
          title: { content: 'Production AI agent evaluation' },
          metadata: { contentMetadataViewModel: { metadataRows: [{ metadataParts: [
            { text: { content: '1,000 views' } }, { text: { content: '4 days ago' } }
          ] }] } }
        } }
      }
    }]
  })};</script>`;
  assert.deepEqual(parseYoutubeChannelPage(body, new Date('2026-10-06T00:00:00.000Z')), [{
    videoId: 'video-123',
    title: 'Production AI agent evaluation',
    publishedAt: '2026-10-02T00:00:00.000Z',
    timeConfidence: 0.65
  }]);
});

test('supports Japanese relative publication labels and deduplicates videos', () => {
  const video = {
    lockupViewModel: {
      contentId: 'video-ja',
      metadata: { lockupMetadataViewModel: {
        title: { content: 'AIエージェントの本番導入' },
        metadata: { contentMetadataViewModel: { metadataRows: [{ metadataParts: [
          { text: { content: '7 時間前に配信済み' } }
        ] }] } }
      } }
    }
  };
  const body = `<script>var ytInitialData = ${JSON.stringify({ contents: [video, video] })};</script>`;
  assert.deepEqual(parseYoutubeChannelPage(body, new Date('2026-10-06T12:00:00.000Z')), [{
    videoId: 'video-ja',
    title: 'AIエージェントの本番導入',
    publishedAt: '2026-10-06T05:00:00.000Z',
    timeConfidence: 0.65
  }]);
});

test('supports YouTube compact English relative labels', () => {
  const body = `<script>var ytInitialData = ${JSON.stringify({
    lockupViewModel: {
      contentId: 'video-compact',
      metadata: { lockupMetadataViewModel: {
        title: { content: 'Agent deployment retrospective' },
        metadata: { contentMetadataViewModel: { metadataRows: [{ metadataParts: [
          { text: { content: '5mo ago' } }
        ] }] } }
      } }
    }
  })};</script>`;
  assert.deepEqual(parseYoutubeChannelPage(body, new Date('2026-10-06T00:00:00.000Z')), [{
    videoId: 'video-compact',
    title: 'Agent deployment retrospective',
    publishedAt: '2026-05-06T00:00:00.000Z',
    timeConfidence: 0.65
  }]);
});
