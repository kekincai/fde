export type YoutubeFallbackItem = {
  videoId: string;
  title: string;
  publishedAt: string;
  timeConfidence: number;
};

function readAssignedJson(body: string): unknown {
  const marker = 'ytInitialData = ';
  const markerIndex = body.indexOf(marker);
  if (markerIndex < 0) throw new Error('YouTube channel page did not include ytInitialData');
  const start = body.indexOf('{', markerIndex + marker.length);
  if (start < 0) throw new Error('YouTube channel page included invalid ytInitialData');
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < body.length; index += 1) {
    const character = body[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === '{') depth += 1;
    else if (character === '}' && --depth === 0) return JSON.parse(body.slice(start, index + 1));
  }
  throw new Error('YouTube channel page included truncated ytInitialData');
}

function relativeDate(label: string, now: Date): string {
  const normalized = label.trim().toLowerCase();
  const match = normalized.match(/(\d+)\s*(minute|hour|day|week|month|year)s?\s+ago/)
    ?? normalized.match(/(\d+)\s*(mo|m|h|d|w|y)\s+ago/)
    ?? normalized.match(/(\d+)\s*(分|時間|日|週間|週|か月|ヶ月|月|年)前/);
  if (!match) return now.toISOString();
  const amount = Number(match[1]);
  const unit = match[2];
  const date = new Date(now);
  if (unit === 'month' || unit === 'mo' || unit === 'か月' || unit === 'ヶ月' || unit === '月') date.setUTCMonth(date.getUTCMonth() - amount);
  else if (unit === 'year' || unit === 'y' || unit === '年') date.setUTCFullYear(date.getUTCFullYear() - amount);
  else {
    const unitMs = unit === 'minute' || unit === 'm' || unit === '分' ? 60_000
      : unit === 'hour' || unit === 'h' || unit === '時間' ? 3_600_000
        : unit === 'week' || unit === 'w' || unit === '週間' || unit === '週' ? 604_800_000 : 86_400_000;
    date.setTime(date.getTime() - amount * unitMs);
  }
  return date.toISOString();
}

export function parseYoutubeChannelPage(body: string, now = new Date()): YoutubeFallbackItem[] {
  const root = readAssignedJson(body);
  const items: YoutubeFallbackItem[] = [];
  const seen = new Set<string>();
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    const record = value as Record<string, unknown>;
    const lockup = record.lockupViewModel as Record<string, unknown> | undefined;
    const videoId = typeof lockup?.contentId === 'string' ? lockup.contentId : '';
    if (videoId && !seen.has(videoId)) {
      const metadata = lockup?.metadata as Record<string, unknown> | undefined;
      const viewModel = metadata?.lockupMetadataViewModel as Record<string, unknown> | undefined;
      const title = ((viewModel?.title as Record<string, unknown> | undefined)?.content ?? '') as string;
      const contentMetadata = ((viewModel?.metadata as Record<string, unknown> | undefined)
        ?.contentMetadataViewModel ?? {}) as Record<string, unknown>;
      const rows = Array.isArray(contentMetadata.metadataRows) ? contentMetadata.metadataRows : [];
      const labels = rows.flatMap((row) => {
        const parts = ((row as Record<string, unknown>).metadataParts ?? []) as Array<Record<string, unknown>>;
        return parts.map((part) => String((part.text as Record<string, unknown> | undefined)?.content ?? ''));
      });
      const publishedLabel = labels.find((label) => /ago|前/i.test(label)) ?? '';
      if (title) {
        seen.add(videoId);
        items.push({
          videoId,
          title,
          publishedAt: relativeDate(publishedLabel, now),
          timeConfidence: publishedLabel ? 0.65 : 0.2
        });
      }
    }
    for (const child of Object.values(record)) visit(child);
  };
  visit(root);
  return items.slice(0, 60);
}
