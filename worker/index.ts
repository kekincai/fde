/// <reference types="@cloudflare/workers-types" />

import { XMLParser } from 'fast-xml-parser';
import { Hono } from 'hono';

import { sourceRegistry, type SourceRecord } from './sourceRegistry';

export type IngestMessage = {
  sourceIds?: string[];
  reason?: 'scheduled' | 'manual';
};

type Env = {
  ASSETS: Fetcher;
  DB: D1Database;
  ARCHIVE: R2Bucket;
  CACHE: KVNamespace;
  INGEST_QUEUE: Queue<IngestMessage>;
};

type DiscoveredItem = {
  externalItemId: string;
  url: string;
  title: string;
  summary: string;
  publishedAt: string;
  tags: string[];
};

const app = new Hono<{ Bindings: Env }>();

app.get('/api/health', (c) =>
  c.json({
    ok: true,
    service: 'fde-radar-api',
    architecture: 'Astro + Hono + Workers + D1/FTS5 + R2 + KV + Queues',
    time: new Date().toISOString()
  })
);

app.get('/api/config', async (c) => {
  const cached = await c.env.CACHE?.get('config:public', 'json').catch(() => null);
  return c.json(
    cached ?? {
      topics: ['仕事への影響', '会社の実践', '暮らしとサービス', 'Webの変化', '学び方', 'イベント'],
      audiences: ['company', 'personal']
    }
  );
});

app.get('/api/articles', async (c) => {
  const query = c.req.query('q')?.trim() ?? '';
  const country = c.req.query('country') ?? 'ALL';
  const topic = c.req.query('topic') ?? 'すべて';
  const limit = Math.min(Number(c.req.query('limit') ?? 20), 50);

  try {
    if (query) {
      const result = await c.env.DB.prepare(
        `SELECT a.* , s.name AS source_name
         FROM articles_fts f
         JOIN articles a ON a.id = f.article_id
         JOIN sources s ON s.id = a.source_id
         WHERE articles_fts MATCH ?
         ORDER BY a.published_at DESC LIMIT ?`
      )
        .bind(query, limit)
        .all();
      return c.json({ articles: result.results, source: 'd1-fts5' });
    }

    const clauses = ['a.status = \'published\''];
    const values: Array<string | number> = [];
    if (country !== 'ALL') {
      clauses.push('a.country_relevance = ?');
      values.push(country);
    }
    if (topic !== 'すべて') {
      clauses.push('a.topic = ?');
      values.push(topic);
    }
    values.push(limit);
    const result = await c.env.DB.prepare(
      `SELECT a.*, s.name AS source_name
       FROM articles a JOIN sources s ON s.id = a.source_id
       WHERE ${clauses.join(' AND ')}
       ORDER BY a.published_at DESC LIMIT ?`
    )
      .bind(...values)
      .all();
    return c.json({ articles: result.results, source: 'd1' });
  } catch (error) {
    return c.json(
      {
        articles: [],
        source: 'fallback',
        message: 'D1 が未接続のため、ローカル表示は静的サンプルを使用します。',
        error: error instanceof Error ? error.message : 'unknown error'
      },
      200
    );
  }
});

app.post('/api/ingest/dispatch', async (c) => {
  const payload = (await c.req.json().catch(() => ({}))) as IngestMessage;
  const sourceIds = payload.sourceIds?.length ? payload.sourceIds : sourceRegistry.map((source) => source.id);
  await c.env.INGEST_QUEUE?.send({ sourceIds, reason: 'manual' }).catch(() => undefined);
  await c.env.CACHE?.put('ingest:last-dispatch', new Date().toISOString(), { expirationTtl: 60 * 60 * 24 });
  return c.json({ queued: sourceIds.length, sourceIds });
});

async function readSources(env: Env, sourceIds?: string[]): Promise<SourceRecord[]> {
  const selected = sourceIds?.length
    ? sourceRegistry.filter((source) => sourceIds.includes(source.id))
    : sourceRegistry;

  try {
    const result = await env.DB.prepare(
      'SELECT id, name, homepage, feed_url, api_url, fetch_mode, language, country, priority, poll_interval_minutes FROM sources WHERE allowed_fetch = 1'
    ).all<SourceRecord>();
    if (result.results.length) {
      return result.results.map((source) => ({
        id: source.id,
        name: source.name,
        homepage: source.homepage,
        feedUrl: (source as SourceRecord & { feed_url?: string }).feed_url,
        apiUrl: (source as SourceRecord & { api_url?: string }).api_url,
        fetchMode: (source as SourceRecord & { fetch_mode: SourceRecord['fetchMode'] }).fetch_mode,
        language: source.language,
        country: source.country,
        priority: source.priority,
        pollIntervalMinutes: source.pollIntervalMinutes ?? (source as SourceRecord & { poll_interval_minutes: number }).poll_interval_minutes
      }));
    }
  } catch {
    // Local development can run without a D1 binding.
  }
  return selected;
}

async function fetchRss(source: SourceRecord): Promise<DiscoveredItem[]> {
  if (!source.feedUrl) return [];
  const response = await fetch(source.feedUrl, {
    headers: {
      accept: 'application/atom+xml, application/rss+xml, application/xml, text/xml',
      'user-agent': 'FDE-Radar/0.1 (+https://github.com/kekincai/fde)'
    }
  });
  if (!response.ok) throw new Error(`${source.name}: HTTP ${response.status}`);
  const body = (await response.text()).slice(0, 1_500_000);
  const parsed = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' }).parse(body);
  const entries = parsed.feed?.entry ?? parsed.rss?.channel?.item ?? [];
  const list = Array.isArray(entries) ? entries : [entries];
  return list.slice(0, 30).flatMap((entry) => {
    const link = typeof entry.link === 'string' ? entry.link : entry.link?.['@_href'] ?? entry.link?.href;
    if (!link || !entry.title) return [];
    return [{
      externalItemId: String(entry.id ?? link),
      url: String(link),
      title: stripMarkup(String(entry.title)),
      summary: stripMarkup(String(entry.summary ?? entry.description ?? '')).slice(0, 280),
      publishedAt: new Date(entry.published ?? entry.pubDate ?? entry.updated ?? Date.now()).toISOString(),
      tags: ['Frontend']
    }];
  });
}

async function fetchQiita(source: SourceRecord): Promise<DiscoveredItem[]> {
  if (!source.apiUrl) return [];
  const response = await fetch(`${source.apiUrl}?page=1&per_page=30&query=タグ:JavaScript`, {
    headers: { accept: 'application/json', 'user-agent': 'FDE-Radar/0.1 (+https://github.com/kekincai/fde)' }
  });
  if (!response.ok) throw new Error(`${source.name}: HTTP ${response.status}`);
  const items = (await response.json()) as Array<Record<string, unknown>>;
  return items.flatMap((item) => {
    if (!item.id || !item.url || !item.title) return [];
    const user = item.user as Record<string, unknown> | undefined;
    return [{
      externalItemId: String(item.id),
      url: String(item.url),
      title: String(item.title),
      summary: `Qiita の ${String(user?.name ?? '開発者')} による投稿です。`,
      publishedAt: new Date(String(item.created_at ?? Date.now())).toISOString(),
      tags: Array.isArray(item.tags) ? item.tags.slice(0, 5).map((tag) => String((tag as Record<string, unknown>).name ?? tag)) : ['JavaScript']
    }];
  });
}

async function ingestSource(env: Env, source: SourceRecord): Promise<{ discovered: number; unique: number }> {
  const startedAt = new Date().toISOString();
  const runId = crypto.randomUUID();
  let items: DiscoveredItem[] = [];
  try {
    items = source.fetchMode === 'api' ? await fetchQiita(source) : await fetchRss(source);
    let unique = 0;
    for (const item of items) {
      const id = crypto.randomUUID();
      const canonicalUrl = normalizeUrl(item.url);
      const urlHash = await sha256(canonicalUrl);
      const titleNormalized = item.title.normalize('NFKC').toLowerCase();
      const topic = inferTopic(item.title, item.tags);
      const japanScore = source.country === 'JP' ? 1 : 0.55;
      const result = await env.DB.prepare(
        `INSERT OR IGNORE INTO articles
        (id, canonical_url, canonical_url_hash, external_item_id, source_id, title, title_normalized, summary, language, country_relevance, topic, tags, published_at, japan_score, quality_score, trend_score)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        id,
        canonicalUrl,
        urlHash,
        item.externalItemId,
        source.id,
        item.title,
        titleNormalized,
        item.summary,
        source.language,
        source.country,
        topic,
        item.tags.join(' '),
        item.publishedAt,
        japanScore,
        Math.min(1, source.priority / 100),
        Math.min(1, source.priority / 100)
      ).run();
      if (result.meta.changes > 0) {
        unique += 1;
        await env.DB.prepare('INSERT INTO articles_fts (article_id, title, summary, tags) VALUES (?, ?, ?, ?)')
          .bind(id, item.title, item.summary, item.tags.join(' '))
          .run();
      }
    }
    await env.DB.prepare(
      `INSERT INTO fetch_runs (id, source_id, status, discovered_count, unique_count, started_at, finished_at)
       VALUES (?, ?, 'success', ?, ?, ?, ?)`
    ).bind(runId, source.id, items.length, unique, startedAt, new Date().toISOString()).run();
    await env.ARCHIVE?.put(`ingest/${source.id}/${startedAt.replaceAll(':', '-')}.json`, JSON.stringify({ source, items, fetchedAt: startedAt }));
    return { discovered: items.length, unique };
  } catch (error) {
    await env.DB.prepare(
      `INSERT INTO fetch_runs (id, source_id, status, error_message, started_at, finished_at)
       VALUES (?, ?, 'error', ?, ?, ?)`
    ).bind(runId, source.id, error instanceof Error ? error.message : 'unknown error', startedAt, new Date().toISOString()).run().catch(() => undefined);
    throw error;
  }
}

function stripMarkup(value: string): string {
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeUrl(value: string): string {
  const url = new URL(value);
  ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].forEach((key) => url.searchParams.delete(key));
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

async function sha256(value: string): Promise<string> {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function inferTopic(title: string, tags: string[]): string {
  const haystack = `${title} ${tags.join(' ')}`.toLowerCase();
  if (haystack.includes('react') || haystack.includes('next')) return 'React';
  if (haystack.includes('css') || haystack.includes('web standard')) return 'Web標準';
  if (haystack.includes('performance') || haystack.includes('パフォーマンス')) return 'パフォーマンス';
  return 'Frontend';
}

async function dispatchSources(env: Env): Promise<void> {
  const sources = await readSources(env);
  await env.INGEST_QUEUE?.send({ sourceIds: sources.map((source) => source.id), reason: 'scheduled' });
  await env.CACHE?.put('ingest:last-dispatch', new Date().toISOString(), { expirationTtl: 60 * 60 * 48 });
}

const worker = {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return app.fetch(request, env, ctx);
    return env.ASSETS.fetch(request);
  },
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(dispatchSources(env));
  },
  async queue(batch: MessageBatch<IngestMessage>, env: Env) {
    for (const message of batch.messages) {
      const sources = await readSources(env, message.body.sourceIds);
      for (const source of sources) {
        await ingestSource(env, source);
      }
      message.ack();
    }
  }
};

export default worker;
