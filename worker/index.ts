/// <reference types="@cloudflare/workers-types" />

import { XMLParser } from 'fast-xml-parser';
import { Hono } from 'hono';
import postgres from 'postgres';

import { sourceRegistry, type SourceRecord } from './sourceRegistry';

export type IngestMessage = {
  sourceIds?: string[];
  reason?: 'scheduled' | 'manual';
};

type Env = {
  ASSETS: Fetcher;
  DB: D1Database;
  HYPERDRIVE?: Hyperdrive;
  ARCHIVE?: R2Bucket;
  CACHE: KVNamespace;
  INGEST_QUEUE: Queue<IngestMessage>;
  INGEST_TOKEN?: string;
};

type DbSourceRow = {
  id: string;
  name: string;
  homepage: string;
  feed_url: string | null;
  api_url: string | null;
  fetch_mode: SourceRecord['fetchMode'];
  language: SourceRecord['language'];
  country: SourceRecord['country'];
  priority: number;
  poll_interval_minutes: number;
  etag: string | null;
  last_modified: string | null;
  consecutive_failures: number;
  backoff_until: string | null;
};

type DiscoveredItem = {
  externalItemId: string;
  url: string;
  title: string;
  summary: string;
  publishedAt: string;
  tags: string[];
};

type FetchMeta = {
  mode: SourceRecord['fetchMode'];
  etag?: string | null;
  lastModified?: string | null;
  notModified?: boolean;
};

type FetchFailure = Error & {
  status?: number;
  retryAfterSeconds?: number;
};

const MAX_BODY_BYTES = 1_500_000;
const USER_AGENT = 'FDE-Radar/0.1 (+https://github.com/kekincai/fde)';
const app = new Hono<{ Bindings: Env }>();

app.get('/api/health', (c) =>
  c.json({
    ok: true,
    service: 'fde-radar-api',
    architecture: 'Astro + Hono + Workers + D1/FTS5 + Hyperdrive/PostgreSQL + KV + Queues (R2 optional)',
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
  const limit = Math.min(Math.max(Number(c.req.query('limit') ?? 20), 1), 50);

  try {
    const searchQuery = query ? buildFtsQuery(query) : '';
    if (searchQuery) {
      const result = await c.env.DB.prepare(
        `SELECT a.*, s.name AS source_name
         FROM articles_fts f
         JOIN articles a ON a.id = f.article_id
         JOIN sources s ON s.id = a.source_id
         WHERE articles_fts MATCH ?
         ORDER BY a.published_at DESC LIMIT ?`
      )
        .bind(searchQuery, limit)
        .all();
      return c.json({ articles: result.results, source: 'd1-fts5' }, 200, {
        'Cache-Control': 'public, max-age=30, s-maxage=300'
      });
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
    return c.json({ articles: result.results, source: 'd1' }, 200, {
      'Cache-Control': 'public, max-age=30, s-maxage=300'
    });
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

app.get('/api/ingest/status', async (c) => {
  try {
    const [sources, runs] = await Promise.all([
      c.env.DB.prepare(
        `SELECT id, name, fetch_mode, last_success_at, last_error_at, consecutive_failures, backoff_until
         FROM sources ORDER BY priority DESC`
      ).all(),
      c.env.DB.prepare(
        `SELECT source_id, status, discovered_count, unique_count, error_message, started_at, finished_at
         FROM fetch_runs ORDER BY started_at DESC LIMIT 20`
      ).all()
    ]);
    return c.json({ sources: sources.results, runs: runs.results });
  } catch (error) {
    return c.json({ sources: [], runs: [], message: error instanceof Error ? error.message : 'unknown error' }, 200);
  }
});

app.post('/api/ingest/dispatch', async (c) => {
  if (!isAuthorized(c.req.raw, c.env)) return c.json({ error: 'Unauthorized' }, 401);
  const payload = (await c.req.json().catch(() => ({}))) as IngestMessage;
  const sourceIds = payload.sourceIds?.length ? payload.sourceIds : sourceRegistry.map((source) => source.id);
  await c.env.INGEST_QUEUE.send({ sourceIds, reason: 'manual' });
  await c.env.CACHE?.put('ingest:last-dispatch', new Date().toISOString(), { expirationTtl: 60 * 60 * 24 });
  return c.json({ queued: sourceIds.length, sourceIds });
});

async function readSources(env: Env, sourceIds?: string[]): Promise<SourceRecord[]> {
  const selected = sourceIds?.length
    ? sourceRegistry.filter((source) => sourceIds.includes(source.id))
    : sourceRegistry;
  const now = new Date().toISOString();

  try {
    const result = await env.DB.prepare(
      `SELECT id, name, homepage, feed_url, api_url, fetch_mode, language, country, priority,
              poll_interval_minutes, etag, last_modified, consecutive_failures, backoff_until
       FROM sources
       WHERE allowed_fetch = 1 AND (backoff_until IS NULL OR backoff_until <= ?)
       ORDER BY priority DESC`
    ).bind(now).all<DbSourceRow>();
    return result.results
      .filter((source) => !sourceIds?.length || sourceIds.includes(source.id))
      .map((source) => ({
        id: source.id,
        name: source.name,
        homepage: source.homepage,
        feedUrl: source.feed_url ?? undefined,
        apiUrl: source.api_url ?? undefined,
        fetchMode: source.fetch_mode,
        language: source.language,
        country: source.country,
        priority: source.priority,
        pollIntervalMinutes: source.poll_interval_minutes,
        etag: source.etag ?? undefined,
        lastModified: source.last_modified ?? undefined,
        consecutiveFailures: source.consecutive_failures,
        backoffUntil: source.backoff_until ?? undefined
      }));
  } catch {
    // UI/local development can run without a D1 binding or migration.
    return selected;
  }
}

async function fetchSourceItems(source: SourceRecord): Promise<{ items: DiscoveredItem[]; meta: FetchMeta }> {
  const candidates: Array<{ mode: SourceRecord['fetchMode']; url?: string }> = [
    { mode: 'api' as const, url: source.apiUrl ? apiUrlForSource(source) : undefined },
    { mode: 'rss' as const, url: source.feedUrl },
    { mode: 'html' as const, url: source.homepage }
  ].filter((candidate) => candidate.url);
  let lastError: FetchFailure | undefined;

  for (const candidate of candidates) {
    try {
      const result = await fetchWithPolicy(source, candidate.url as string);
      if (result.notModified) return { items: [], meta: { ...result, mode: candidate.mode } };
      const items = candidate.mode === 'api'
        ? await parseApiResponse(source, result.response)
        : candidate.mode === 'rss'
          ? await parseRssResponse(source, result.response)
          : await parseHtmlResponse(source, result.response);
      if (!items.length && candidate.mode !== 'html') throw new Error(`${source.name}: ${candidate.mode} returned no usable items`);
      return { items, meta: { ...result, mode: candidate.mode } };
    } catch (error) {
      lastError = error as FetchFailure;
      // A source may expose both API and RSS. A 429/403 on one surface must not
      // make us bypass its policy; it only allows an explicitly listed fallback.
    }
  }
  throw lastError ?? new Error(`${source.name}: no fetch surface configured`);
}

async function fetchWithPolicy(source: SourceRecord, url: string): Promise<{ response: Response; etag: string | null; lastModified: string | null; notModified?: boolean }> {
  const headers = new Headers({
    accept: 'application/atom+xml, application/rss+xml, application/xml, text/xml, application/json, text/html',
    'user-agent': USER_AGENT
  });
  if (source.etag) headers.set('if-none-match', source.etag);
  if (source.lastModified) headers.set('if-modified-since', source.lastModified);

  const response = await fetch(url, { headers });
  if (response.status === 304) {
    return { response, etag: source.etag ?? null, lastModified: source.lastModified ?? null, notModified: true };
  }
  if (response.status === 429) {
    const failure = new Error(`${source.name}: HTTP 429`) as FetchFailure;
    failure.status = 429;
    failure.retryAfterSeconds = parseRetryAfter(response.headers.get('retry-after'));
    throw failure;
  }
  if (response.status === 403 || response.status === 401) {
    const failure = new Error(`${source.name}: HTTP ${response.status}; manual review required`) as FetchFailure;
    failure.status = response.status;
    throw failure;
  }
  if (!response.ok) throw new Error(`${source.name}: HTTP ${response.status}`);
  const contentLength = Number(response.headers.get('content-length') ?? 0);
  if (contentLength > MAX_BODY_BYTES) throw new Error(`${source.name}: response exceeds ${MAX_BODY_BYTES} bytes`);
  return {
    response,
    etag: response.headers.get('etag'),
    lastModified: response.headers.get('last-modified')
  };
}

async function parseApiResponse(source: SourceRecord, response: Response): Promise<DiscoveredItem[]> {
  const json = (await response.json()) as unknown;
  const rawItems = Array.isArray(json) ? json : (json as { items?: unknown[] })?.items ?? [];
  const qiitaTags = new Set(['javascript', 'typescript', 'react', 'vue.js', 'nuxt.js', 'next.js', 'astro', 'svelte', 'css', 'html', 'web', 'node.js', 'vite', 'playwright', 'accessibility', 'performance', 'ai']);
  return rawItems.slice(0, 30).flatMap((raw) => {
    const item = raw as Record<string, unknown>;
    const tags = Array.isArray(item.tags)
      ? item.tags.slice(0, 8).map((tag) => typeof tag === 'string' ? tag : String((tag as Record<string, unknown>).name ?? ''))
      : [];
    if (source.id === 'qiita' && !tags.some((tag) => qiitaTags.has(tag.trim().toLowerCase()))) return [];
    const url = String(item.url ?? item.html_url ?? '');
    const title = stripMarkup(String(item.title ?? item.name ?? ''));
    if (!url || !title) return [];
    return [{
      externalItemId: String(item.id ?? url),
      url,
      title,
      summary: stripMarkup(String(item.body ?? item.description ?? `${source.name} からの更新です。`)).slice(0, 280),
      publishedAt: safeIsoDate(String(item.created_at ?? item.published_at ?? item.updated_at ?? Date.now())),
      tags: tags.length ? tags : ['Webの変化']
    }];
  });
}

async function parseRssResponse(source: SourceRecord, response: Response): Promise<DiscoveredItem[]> {
  const body = (await response.text()).slice(0, MAX_BODY_BYTES);
  const parsed = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' }).parse(body);
  const entries = parsed.feed?.entry ?? parsed.rss?.channel?.item ?? parsed.channel?.item ?? [];
  const list = Array.isArray(entries) ? entries : [entries];
  return list.slice(0, 30).flatMap((entry) => {
    const link = readFeedLink(entry?.link, source.homepage);
    const title = stripMarkup(String(entry?.title ?? ''));
    if (!link || !title) return [];
    return [{
      externalItemId: String(entry?.id ?? link),
      url: link,
      title,
      summary: stripMarkup(String(entry?.summary ?? entry?.description ?? '')).slice(0, 280),
      publishedAt: safeIsoDate(String(entry?.published ?? entry?.pubDate ?? entry?.updated ?? Date.now())),
      tags: extractFeedTags(entry?.category).length ? extractFeedTags(entry?.category) : ['Webの変化']
    }];
  });
}

async function parseHtmlResponse(source: SourceRecord, response: Response): Promise<DiscoveredItem[]> {
  const candidates: DiscoveredItem[] = [];
  const seen = new Set<string>();
  let active: { url: string; title: string } | undefined;
  const rewriter = new HTMLRewriter();
  const capture = (element: Element) => {
    const href = element.getAttribute('href');
    if (!href) return;
    let url: string;
    try { url = new URL(href, source.homepage).toString(); } catch { return; }
    if (!/^https?:/i.test(url) || url === source.homepage || seen.has(url)) return;
    const candidate = { url, title: '' };
    active = candidate;
    element.onEndTag(() => {
      const title = stripMarkup(candidate.title);
      if (title.length >= 8 && title.length <= 180 && !/^(home|menu|login|read more)$/i.test(title)) {
        seen.add(url);
        candidates.push({
          externalItemId: url,
          url,
          title,
          summary: `${source.name} の公開ページから見つけた更新です。`,
          publishedAt: new Date().toISOString(),
          tags: ['Webの変化']
        });
      }
      if (active === candidate) active = undefined;
    });
  };
  for (const selector of ['article h2 a', 'article h3 a', 'main h2 a', 'main h3 a', '.post a', '.entry-title a']) {
    rewriter.on(selector, {
      element: capture,
      text: (text) => { if (active) active.title += text.text; }
    });
  }
  await rewriter.transform(response).arrayBuffer();
  return candidates.slice(0, 30);
}

async function ingestSource(env: Env, source: SourceRecord): Promise<{ discovered: number; unique: number; mode: string; notModified: boolean }> {
  const startedAt = new Date().toISOString();
  const runId = crypto.randomUUID();
  try {
    const result = await fetchSourceItems(source);
    let unique = 0;
    for (const item of result.items) {
      const canonicalUrl = normalizeUrl(item.url);
      if (!canonicalUrl || item.title.length < 4) continue;
      const id = crypto.randomUUID();
      const urlHash = await sha256(canonicalUrl);
      const titleNormalized = item.title.normalize('NFKC').toLowerCase();
      const topic = inferTopic(item.title, item.tags);
      const searchTokensJa = tokenizeJapanese(`${item.title} ${item.summary} ${item.tags.join(' ')}`);
      const inserted = await env.DB.prepare(
        `INSERT OR IGNORE INTO articles
        (id, canonical_url, canonical_url_hash, external_item_id, source_id, title, title_normalized, summary, language, country_relevance, topic, tags, search_tokens_ja, published_at, japan_score, quality_score, trend_score)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
        searchTokensJa,
        item.publishedAt,
        source.country === 'JP' ? 1 : 0.55,
        Math.min(1, source.priority / 100),
        Math.min(1, source.priority / 100)
      ).run();
      if (inserted.meta.changes > 0) {
        unique += 1;
        await env.DB.prepare(
          'INSERT INTO articles_fts (article_id, title, summary, tags, search_tokens_ja) VALUES (?, ?, ?, ?, ?)'
        ).bind(id, item.title, item.summary, item.tags.join(' '), searchTokensJa).run();
      }
    }
    await env.DB.prepare(
      `INSERT INTO fetch_runs (id, source_id, status, discovered_count, unique_count, started_at, finished_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(runId, source.id, result.meta.notModified ? 'not_modified' : 'success', result.items.length, unique, startedAt, new Date().toISOString()).run();
    await markSourceSuccess(env, source, result.meta);
    await persistArchive(env, source, result.items, result.meta.mode, startedAt);
    return { discovered: result.items.length, unique, mode: result.meta.mode, notModified: Boolean(result.meta.notModified) };
  } catch (error) {
    const failure = error as FetchFailure;
    const message = failure instanceof Error ? failure.message : 'unknown error';
    await env.DB.prepare(
      `INSERT INTO fetch_runs (id, source_id, status, error_message, started_at, finished_at)
       VALUES (?, ?, 'error', ?, ?, ?)`
    ).bind(runId, source.id, message, startedAt, new Date().toISOString()).run().catch(() => undefined);
    await markSourceFailure(env, source, failure);
    throw error;
  }
}

async function persistArchive(
  env: Env,
  source: SourceRecord,
  items: DiscoveredItem[],
  mode: SourceRecord['fetchMode'],
  fetchedAt: string
): Promise<void> {
  const payload = { sourceId: source.id, items, fetchedAt, mode };
  const serialized = JSON.stringify(payload);
  const contentHash = await sha256(serialized);

  if (env.HYPERDRIVE) {
    const sql = postgres(env.HYPERDRIVE.connectionString);
    try {
      await sql`
        INSERT INTO fde.source_archives (source_id, fetched_at, mode, content_hash, payload)
        VALUES (${source.id}, ${fetchedAt}, ${mode}, ${contentHash}, ${serialized}::jsonb)
        ON CONFLICT (source_id, content_hash) DO NOTHING
      `;
    } finally {
      await sql.end({ timeout: 1 }).catch(() => undefined);
    }
    return;
  }

  if (env.ARCHIVE) {
    await env.ARCHIVE.put(
      `ingest/${source.id}/${fetchedAt.replaceAll(':', '-')}.json`,
      serialized
    );
  }
}

async function markSourceSuccess(env: Env, source: SourceRecord, meta: FetchMeta): Promise<void> {
  await env.DB.prepare(
    `UPDATE sources
     SET etag = ?, last_modified = ?, last_success_at = ?, consecutive_failures = 0,
         backoff_until = NULL, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).bind(meta.etag ?? source.etag ?? null, meta.lastModified ?? source.lastModified ?? null, new Date().toISOString(), source.id).run();
}

async function markSourceFailure(env: Env, source: SourceRecord, failure: FetchFailure): Promise<void> {
  const attempts = (source.consecutiveFailures ?? 0) + 1;
  const delaySeconds = failure.retryAfterSeconds ?? Math.min(86_400, 60 * 2 ** Math.min(attempts, 8));
  const backoffUntil = new Date(Date.now() + delaySeconds * 1000).toISOString();
  await env.DB.prepare(
    `UPDATE sources
     SET last_error_at = ?, consecutive_failures = ?, backoff_until = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).bind(new Date().toISOString(), attempts, backoffUntil, source.id).run().catch(() => undefined);
}

async function dispatchSources(env: Env): Promise<void> {
  const sources = await readSources(env);
  if (!sources.length) return;
  await env.INGEST_QUEUE.send({ sourceIds: sources.map((source) => source.id), reason: 'scheduled' });
  await env.CACHE?.put('ingest:last-dispatch', new Date().toISOString(), { expirationTtl: 60 * 60 * 48 });
}

function isAuthorized(request: Request, env: Env): boolean {
  if (!env.INGEST_TOKEN) return true;
  return request.headers.get('authorization') === `Bearer ${env.INGEST_TOKEN}`;
}

function readFeedLink(rawLink: unknown, baseUrl: string): string | undefined {
  const links = Array.isArray(rawLink) ? rawLink : [rawLink];
  for (const link of links) {
    const value = typeof link === 'string' ? link : (link as Record<string, unknown> | undefined)?.['@_href'] ?? (link as Record<string, unknown> | undefined)?.href;
    if (!value) continue;
    try { return new URL(String(value), baseUrl).toString(); } catch { /* skip malformed item */ }
  }
  return undefined;
}

function apiUrlForSource(source: SourceRecord): string {
  const url = new URL(source.apiUrl as string);
  if (source.id === 'qiita') {
    url.searchParams.set('page', '1');
    url.searchParams.set('per_page', '30');
    url.searchParams.set('query', 'tag:JavaScript');
  }
  return url.toString();
}

function extractFeedTags(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return list.slice(0, 8).map((tag) => {
    if (typeof tag === 'string') return tag;
    const value = tag as Record<string, unknown>;
    return String(value?.['#text'] ?? value?.['@_term'] ?? value?.name ?? '');
  }).filter(Boolean);
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.min(86_400, Math.max(60, seconds));
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.min(86_400, Math.max(60, Math.ceil((timestamp - Date.now()) / 1000))) : undefined;
}

function safeIsoDate(value: string): string {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : new Date().toISOString();
}

function stripMarkup(value: string): string {
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].forEach((key) => url.searchParams.delete(key));
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return undefined;
  }
}

async function sha256(value: string): Promise<string> {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function tokenizeJapanese(value: string): string {
  const segmenter = new Intl.Segmenter('ja', { granularity: 'word' });
  return [...segmenter.segment(value.normalize('NFKC'))]
    .map((part) => part.segment.trim().toLowerCase())
    .filter((part) => part.length > 1 && /[\p{L}\p{N}]/u.test(part))
    .join(' ');
}

function buildFtsQuery(value: string): string {
  return tokenizeJapanese(value).split(/\s+/).filter(Boolean).map((token) => `"${token.replaceAll('"', '""')}"`).join(' OR ');
}

function inferTopic(title: string, tags: string[]): string {
  const haystack = `${title} ${tags.join(' ')}`.toLowerCase();
  if (/(ai|生成ai|採用|developer productivity|workflow|仕事)/i.test(haystack)) return '仕事への影響';
  if (/(mercari|line|cyberagent|team|組織|migration|基盤|会社)/i.test(haystack)) return '会社の実践';
  if (/(conf|conference|jsconf|event|イベント|cfp)/i.test(haystack)) return 'イベント';
  if (/(accessibility|アクセシビリティ|privacy|security|安全|暮らし)/i.test(haystack)) return '暮らしとサービス';
  if (/(learn|学習|tutorial|入門)/i.test(haystack)) return '学び方';
  return 'Webの変化';
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
      const failures: string[] = [];
      for (const source of sources) {
        try {
          await ingestSource(env, source);
        } catch (error) {
          failures.push(error instanceof Error ? `${source.id}: ${error.message}` : source.id);
        }
      }
      if (failures.length) {
        console.error('ingest batch failed', failures);
        message.retry({ delaySeconds: 60 });
      } else {
        message.ack();
      }
    }
  }
};

export default worker;
