/// <reference types="@cloudflare/workers-types" />

import { XMLParser } from 'fast-xml-parser';
import { Hono } from 'hono';
import postgres from 'postgres';

import { sourceRegistry, type SourceKind, type SourceRecord } from './sourceRegistry';

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
  source_kind: SourceKind;
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
  signalType: string;
  location: string;
  sector: string;
  countryRelevance: 'JP' | 'APAC' | 'GLOBAL';
  fdeScore: number;
};

type FetchMeta = {
  mode: SourceRecord['fetchMode'];
  etag?: string | null;
  lastModified?: string | null;
  notModified?: boolean;
};

type FetchFailure = Error & { status?: number; retryAfterSeconds?: number };

const MAX_BODY_BYTES = 6_000_000;
const USER_AGENT = 'FDE-Radar/0.2 (+https://github.com/kekincai/fde)';
const app = new Hono<{ Bindings: Env }>();

const ROLE_PATTERN = /(forward deployed|deployment engineer|deployment engineering|applied ai (engineer|architect)|technical deployment lead|customer deployment|beneficial deployments|フォワード.?デプロイド|AI導入エンジニア|AIソリューションエンジニア)/i;
const AI_PATTERN = /\b(ai|artificial intelligence|llm|large language model|generative ai|genai|agentic|model)\b|生成AI|人工知能/i;
const FIELD_PATTERN = /(customer|client|enterprise|government|public sector|現場|顧客|企業)/i;
const DELIVERY_PATTERN = /(deploy|deployment|production|rollout|adoption|implementation|integrat|workflow|pilot|本番|導入|実装|運用)/i;
const QUALITY_PATTERN = /(eval|evaluation|reliability|observability|guardrail|security|governance|safety|品質|評価|安全|ガバナンス)/i;

app.get('/api/health', (c) => c.json({
  ok: true,
  service: 'ai-fde-radar-api',
  architecture: 'Astro + Hono + Workers + D1/FTS5 + Hyperdrive/PostgreSQL + KV + Queues',
  time: new Date().toISOString()
}));

app.get('/api/config', (c) => c.json({
  topics: ['すべて', '導入事例', '本番化・運用', '評価・品質', '安全・ガバナンス', '採用・役割'],
  regions: ['ALL', 'JP', 'APAC', 'GLOBAL'],
  audiences: ['business', 'career']
}));

app.get('/api/articles', async (c) => {
  const query = c.req.query('q')?.trim() ?? '';
  const region = c.req.query('region') ?? c.req.query('country') ?? 'ALL';
  const signalType = c.req.query('signal') ?? c.req.query('topic') ?? 'すべて';
  const limit = Math.min(Math.max(Number(c.req.query('limit') ?? 30), 1), 50);
  try {
    const clauses = ["a.status = 'published'", 'a.fde_score >= 4'];
    const values: Array<string | number> = [];
    if (region !== 'ALL') {
      clauses.push('a.country_relevance = ?');
      values.push(region);
    }
    if (signalType !== 'すべて') {
      clauses.push('a.signal_type = ?');
      values.push(signalType);
    }
    const searchQuery = query ? buildFtsQuery(query) : '';
    const from = searchQuery
      ? 'articles_fts f JOIN articles a ON a.id = f.article_id JOIN sources s ON s.id = a.source_id'
      : 'articles a JOIN sources s ON s.id = a.source_id';
    if (searchQuery) {
      clauses.unshift('articles_fts MATCH ?');
      values.unshift(searchQuery);
    }
    values.push(limit);
    const result = await c.env.DB.prepare(
      `SELECT a.*, s.name AS source_name, s.source_kind
       FROM ${from}
       WHERE ${clauses.join(' AND ')}
       ORDER BY a.published_at DESC, a.fde_score DESC LIMIT ?`
    ).bind(...values).all();
    return c.json({ articles: result.results, source: searchQuery ? 'd1-fts5' : 'd1' }, 200, {
      'Cache-Control': 'public, max-age=30, s-maxage=300'
    });
  } catch (error) {
    return c.json({ articles: [], source: 'unavailable', error: errorMessage(error) }, 503);
  }
});

app.get('/api/overview', async (c) => {
  try {
    const [counts, sources, latest] = await Promise.all([
      c.env.DB.prepare(
        `SELECT COUNT(*) AS total,
          SUM(CASE WHEN country_relevance = 'JP' THEN 1 ELSE 0 END) AS japan,
          SUM(CASE WHEN signal_type = '採用・役割' THEN 1 ELSE 0 END) AS careers
         FROM articles WHERE status = 'published' AND fde_score >= 4`
      ).first(),
      c.env.DB.prepare(
        `SELECT id, name, source_kind, homepage, last_success_at, last_error_at, consecutive_failures
         FROM sources WHERE allowed_fetch = 1 ORDER BY priority DESC`
      ).all(),
      c.env.DB.prepare(
        `SELECT MAX(discovered_at) AS last_ingested_at, MAX(published_at) AS latest_published_at
         FROM articles WHERE status = 'published' AND fde_score >= 4`
      ).first()
    ]);
    return c.json({ counts, sources: sources.results, ...latest }, 200, {
      'Cache-Control': 'public, max-age=30, s-maxage=300'
    });
  } catch (error) {
    return c.json({ counts: { total: 0, japan: 0, careers: 0 }, sources: [], error: errorMessage(error) }, 503);
  }
});

app.get('/api/ingest/status', async (c) => {
  try {
    const [sources, runs] = await Promise.all([
      c.env.DB.prepare(
        `SELECT id, name, source_kind, fetch_mode, last_success_at, last_error_at, consecutive_failures, backoff_until
         FROM sources WHERE allowed_fetch = 1 ORDER BY priority DESC`
      ).all(),
      c.env.DB.prepare(
        `SELECT source_id, status, discovered_count, unique_count, error_message, started_at, finished_at
         FROM fetch_runs ORDER BY started_at DESC LIMIT 20`
      ).all()
    ]);
    return c.json({ sources: sources.results, runs: runs.results });
  } catch (error) {
    return c.json({ sources: [], runs: [], error: errorMessage(error) }, 503);
  }
});

app.post('/api/ingest/dispatch', async (c) => {
  if (!isAuthorized(c.req.raw, c.env)) return c.json({ error: 'Unauthorized' }, 401);
  const payload = (await c.req.json().catch(() => ({}))) as IngestMessage;
  const sourceIds = payload.sourceIds?.length ? payload.sourceIds : sourceRegistry.map((source) => source.id);
  await c.env.INGEST_QUEUE.send({ sourceIds, reason: 'manual' });
  await c.env.CACHE.put('ingest:last-dispatch', new Date().toISOString(), { expirationTtl: 172800 });
  return c.json({ queued: sourceIds.length, sourceIds });
});

async function readSources(env: Env, sourceIds?: string[], force = false): Promise<SourceRecord[]> {
  const now = new Date().toISOString();
  try {
    const dueClause = force ? '' : "AND (last_success_at IS NULL OR datetime(last_success_at, '+' || poll_interval_minutes || ' minutes') <= datetime(?))";
    const statement = env.DB.prepare(
      `SELECT id, name, homepage, feed_url, api_url, fetch_mode, language, country, source_kind,
              priority, poll_interval_minutes, etag, last_modified, consecutive_failures, backoff_until
       FROM sources
       WHERE allowed_fetch = 1 AND (backoff_until IS NULL OR backoff_until <= ?) ${dueClause}
       ORDER BY priority DESC`
    );
    const result = force
      ? await statement.bind(now).all<DbSourceRow>()
      : await statement.bind(now, now).all<DbSourceRow>();
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
        kind: source.source_kind,
        priority: source.priority,
        pollIntervalMinutes: source.poll_interval_minutes,
        etag: source.etag ?? undefined,
        lastModified: source.last_modified ?? undefined,
        consecutiveFailures: source.consecutive_failures,
        backoffUntil: source.backoff_until ?? undefined
      }));
  } catch {
    return sourceRegistry.filter((source) => !sourceIds?.length || sourceIds.includes(source.id));
  }
}

async function fetchSourceItems(source: SourceRecord): Promise<{ items: DiscoveredItem[]; meta: FetchMeta }> {
  const candidates = [
    { mode: 'api' as const, url: source.apiUrl },
    { mode: 'rss' as const, url: source.feedUrl },
    { mode: 'html' as const, url: source.fetchMode === 'html' ? source.homepage : undefined }
  ].filter((candidate): candidate is { mode: SourceRecord['fetchMode']; url: string } => Boolean(candidate.url));
  let lastError: FetchFailure | undefined;
  for (const candidate of candidates) {
    try {
      const result = await fetchWithPolicy(source, candidate.url);
      if (result.notModified) return { items: [], meta: { ...result, mode: candidate.mode } };
      const discovered = candidate.mode === 'api'
        ? await parseApiResponse(source, result.response)
        : candidate.mode === 'rss'
          ? await parseRssResponse(source, result.response)
          : await parseHtmlResponse(source, result.response);
      return { items: discovered.filter((item) => item.fdeScore >= 4), meta: { ...result, mode: candidate.mode } };
    } catch (error) {
      lastError = error as FetchFailure;
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
  if (response.status === 304) return { response, etag: source.etag ?? null, lastModified: source.lastModified ?? null, notModified: true };
  if (response.status === 429) {
    const failure = new Error(`${source.name}: HTTP 429`) as FetchFailure;
    failure.status = 429;
    failure.retryAfterSeconds = parseRetryAfter(response.headers.get('retry-after'));
    throw failure;
  }
  if (response.status === 401 || response.status === 403) {
    const failure = new Error(`${source.name}: HTTP ${response.status}; manual review required`) as FetchFailure;
    failure.status = response.status;
    throw failure;
  }
  if (!response.ok) throw new Error(`${source.name}: HTTP ${response.status}`);
  const contentLength = Number(response.headers.get('content-length') ?? 0);
  if (contentLength > MAX_BODY_BYTES) throw new Error(`${source.name}: response exceeds ${MAX_BODY_BYTES} bytes`);
  return { response, etag: response.headers.get('etag'), lastModified: response.headers.get('last-modified') };
}

async function parseApiResponse(source: SourceRecord, response: Response): Promise<DiscoveredItem[]> {
  const json = await response.json() as { jobs?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>;
  const rawItems = Array.isArray(json) ? json : json.jobs ?? [];
  return rawItems.slice(0, 800).flatMap((item) => {
    if (source.id === 'qiita-fde-fieldnotes') return parseQiitaItem(item);
    const title = cleanText(String(item.title ?? item.name ?? ''));
    const location = cleanText(String((item.location as Record<string, unknown> | undefined)?.name ?? ''));
    const content = cleanText(String(item.content ?? item.description ?? ''));
    const haystack = `${title} ${content}`;
    if (!ROLE_PATTERN.test(title) || !AI_PATTERN.test(haystack)) return [];
    const score = scoreFde(haystack, true);
    const url = String(item.absolute_url ?? item.url ?? '');
    if (!url || !title) return [];
    const company = source.name.replace(' Careers', '');
    return [{
      externalItemId: String(item.id ?? url),
      url,
      title,
      summary: `${company}が${location || '複数地域'}で募集する、顧客のAI導入を設計から本番運用まで担うポジションです。`,
      publishedAt: safeIsoDate(String(item.updated_at ?? item.created_at ?? Date.now())),
      tags: compactTags(['FDE', 'AI deployment', location, ...extractKeywords(haystack)]),
      signalType: '採用・役割',
      location,
      sector: inferSector(haystack),
      countryRelevance: inferRegion(location),
      fdeScore: score
    }];
  });
}

function parseQiitaItem(item: Record<string, unknown>): DiscoveredItem[] {
  const title = cleanText(String(item.title ?? ''));
  const body = cleanText(String(item.body ?? item.rendered_body ?? '')).slice(0, 12_000);
  const tags = Array.isArray(item.tags)
    ? item.tags.map((tag) => cleanText(String((tag as Record<string, unknown>)?.name ?? ''))).filter(Boolean)
    : [];
  const haystack = `${title} ${body} ${tags.join(' ')}`;
  const score = scoreFde(haystack, false);
  const url = String(item.url ?? '');
  if (!url || !title || score < 4 || !passesCommunityGate(title, haystack)) return [];
  return [{
    externalItemId: String(item.id ?? url),
    url,
    title,
    summary: body.slice(0, 300),
    publishedAt: safeIsoDate(String(item.updated_at ?? item.created_at ?? Date.now())),
    tags: compactTags([...tags, ...extractKeywords(haystack)]),
    signalType: inferSignalType(haystack),
    location: '日本',
    sector: inferSector(haystack),
    countryRelevance: 'JP',
    fdeScore: score
  }];
}

async function parseRssResponse(source: SourceRecord, response: Response): Promise<DiscoveredItem[]> {
  const body = (await response.text()).slice(0, MAX_BODY_BYTES);
  const parsed = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' }).parse(body);
  const entries = parsed.feed?.entry ?? parsed.rss?.channel?.item ?? parsed.channel?.item ?? [];
  const list = Array.isArray(entries) ? entries : [entries];
  return list.slice(0, 60).flatMap((entry) => {
    const link = readFeedLink(entry?.link, source.homepage);
    const title = cleanText(String(entry?.title ?? ''));
    const rawSummary = cleanText(String(entry?.summary ?? entry?.description ?? entry?.['content:encoded'] ?? ''));
    const tags = extractFeedTags(entry?.category);
    const haystack = `${title} ${rawSummary} ${tags.join(' ')}`;
    const score = scoreFde(haystack, false);
    if (!link || !title || score < 4) return [];
    if (source.kind === 'community' && !passesCommunityGate(title, haystack)) return [];
    if (source.kind === 'news' && !(AI_PATTERN.test(title) && FIELD_PATTERN.test(haystack) && (DELIVERY_PATTERN.test(haystack) || QUALITY_PATTERN.test(haystack)))) return [];
    const signalType = inferSignalType(haystack);
    const location = inferLocation(haystack);
    return [{
      externalItemId: String(entry?.guid?.['#text'] ?? entry?.guid ?? entry?.id ?? link),
      url: link,
      title,
      summary: rawSummary.slice(0, 300) || `${source.name}が公開したAI導入・運用に関する更新です。`,
      publishedAt: safeIsoDate(String(entry?.published ?? entry?.pubDate ?? entry?.updated ?? Date.now())),
      tags: compactTags([...tags, ...extractKeywords(haystack)]),
      signalType,
      location,
      sector: inferSector(haystack),
      countryRelevance: inferRegion(location || haystack),
      fdeScore: score
    }];
  });
}

async function parseHtmlResponse(source: SourceRecord, response: Response): Promise<DiscoveredItem[]> {
  if (source.id === 'ai-native-fde-career') return parseSingleCareerPage(source, response);
  const candidates: DiscoveredItem[] = [];
  let active: { url: string; title: string } | undefined;
  const rewriter = new HTMLRewriter().on('main a[href]', {
    element(element) {
      const href = element.getAttribute('href');
      if (!href) return;
      try { active = { url: new URL(href, source.homepage).toString(), title: '' }; } catch { active = undefined; }
      const current = active;
      element.onEndTag(() => {
        if (!current) return;
        const title = cleanText(current.title);
        const score = scoreFde(title, source.kind === 'careers');
        if (title.length >= 8 && score >= 4) candidates.push({
          externalItemId: current.url,
          url: current.url,
          title,
          summary: `${source.name}の公式ページで確認されたAI FDE関連の更新です。`,
          publishedAt: new Date().toISOString(),
          tags: compactTags(['FDE', ...extractKeywords(title)]),
          signalType: source.kind === 'careers' ? '採用・役割' : inferSignalType(title),
          location: inferLocation(title),
          sector: inferSector(title),
          countryRelevance: inferRegion(title),
          fdeScore: score
        });
        if (active === current) active = undefined;
      });
    },
    text(text) { if (active) active.title += text.text; }
  });
  await rewriter.transform(response).arrayBuffer();
  return candidates.slice(0, 50);
}

async function parseSingleCareerPage(source: SourceRecord, response: Response): Promise<DiscoveredItem[]> {
  let title = '';
  let description = '';
  const rewriter = new HTMLRewriter()
    .on('title', { text(text) { title += text.text; } })
    .on('meta[name="description"]', { element(element) { description = element.getAttribute('content') ?? ''; } });
  await rewriter.transform(response).arrayBuffer();
  title = cleanText(title);
  description = cleanText(description);
  const haystack = `${title} ${description}`;
  const score = scoreFde(haystack, true);
  if (!title || score < 4) return [];
  return [{
    externalItemId: source.homepage,
    url: source.homepage,
    title,
    summary: description.slice(0, 300),
    publishedAt: new Date().toISOString(),
    tags: compactTags(['FDE', 'AI導入', ...extractKeywords(haystack)]),
    signalType: '採用・役割',
    location: '日本',
    sector: inferSector(haystack),
    countryRelevance: 'JP',
    fdeScore: score
  }];
}

async function ingestSource(env: Env, source: SourceRecord): Promise<{ discovered: number; unique: number }> {
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
      const searchTokensJa = tokenizeJapanese(`${item.title} ${item.summary} ${item.tags.join(' ')} ${item.location} ${item.sector}`);
      const impacts = impactCopy(item.signalType);
      const inserted = await env.DB.prepare(
        `INSERT OR IGNORE INTO articles
        (id, canonical_url, canonical_url_hash, external_item_id, source_id, title, title_normalized,
         summary, language, country_relevance, topic, tags, search_tokens_ja, published_at,
         japan_score, quality_score, trend_score, signal_type, location, sector, fde_score,
         why_it_matters, company_impact, career_impact)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        id, canonicalUrl, urlHash, item.externalItemId, source.id, item.title, titleNormalized,
        item.summary, source.language, item.countryRelevance, item.signalType, item.tags.join(' '),
        searchTokensJa, item.publishedAt, item.countryRelevance === 'JP' ? 1 : item.countryRelevance === 'APAC' ? 0.75 : 0.45,
        source.priority / 100, item.fdeScore / 10, item.signalType, item.location, item.sector,
        item.fdeScore, impacts.why, impacts.company, impacts.career
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
    if (!result.meta.notModified) await persistArchive(env, source, result.items, result.meta.mode, startedAt);
    return { discovered: result.items.length, unique };
  } catch (error) {
    const failure = error as FetchFailure;
    await env.DB.prepare(
      `INSERT INTO fetch_runs (id, source_id, status, error_message, started_at, finished_at)
       VALUES (?, ?, 'error', ?, ?, ?)`
    ).bind(runId, source.id, errorMessage(error), startedAt, new Date().toISOString()).run().catch(() => undefined);
    await markSourceFailure(env, source, failure);
    throw error;
  }
}

function scoreFde(value: string, career: boolean): number {
  let score = 0;
  if (ROLE_PATTERN.test(value)) score += career ? 6 : 5;
  if (AI_PATTERN.test(value)) score += 1;
  if (FIELD_PATTERN.test(value)) score += 1;
  if (DELIVERY_PATTERN.test(value)) score += 2;
  if (QUALITY_PATTERN.test(value)) score += 1;
  if (/^how .+ (uses|builds|deploys|adopts)/i.test(value)) score += 3;
  return Math.min(10, score);
}

function passesCommunityGate(title: string, haystack: string): boolean {
  if (ROLE_PATTERN.test(title) || /\bFDE\b/i.test(title)) return true;
  return AI_PATTERN.test(title)
    && FIELD_PATTERN.test(haystack)
    && (DELIVERY_PATTERN.test(haystack) || QUALITY_PATTERN.test(haystack));
}

function inferSignalType(value: string): string {
  if (ROLE_PATTERN.test(value)) return '採用・役割';
  if (QUALITY_PATTERN.test(value) && /(security|governance|safety|guardrail|安全|ガバナンス)/i.test(value)) return '安全・ガバナンス';
  if (QUALITY_PATTERN.test(value)) return '評価・品質';
  if (/(production|rollout|operation|observability|本番|運用)/i.test(value)) return '本番化・運用';
  return '導入事例';
}

function inferRegion(value: string): 'JP' | 'APAC' | 'GLOBAL' {
  if (/(tokyo|japan|japanese|日本|東京|大阪)/i.test(value)) return 'JP';
  if (/(singapore|seoul|korea|sydney|australia|india|apac|asia|シンガポール|韓国|アジア)/i.test(value)) return 'APAC';
  return 'GLOBAL';
}

function inferLocation(value: string): string {
  const matches = value.match(/(Tokyo, Japan|Japan|Singapore|Seoul, South Korea|Sydney, Australia|London, UK|San Francisco, CA|New York(?: City)?, NY|Washington, DC)/i);
  return matches?.[0] ?? '';
}

function inferSector(value: string): string {
  if (/(government|public sector|defen[cs]e)/i.test(value)) return '公共・行政';
  if (/(health|medical|life science)/i.test(value)) return '医療・ライフサイエンス';
  if (/(financial|bank|insurance|fintech)/i.test(value)) return '金融';
  if (/(manufactur|industrial|semiconductor)/i.test(value)) return '製造';
  if (/(retail|commerce)/i.test(value)) return '小売・流通';
  return '業界横断';
}

function extractKeywords(value: string): string[] {
  const candidates = ['FDE', 'Applied AI', 'AI deployment', 'evaluation', 'production', 'security', 'governance', 'agents'];
  return candidates.filter((candidate) => new RegExp(candidate.replace('FDE', 'forward deployed|FDE'), 'i').test(value));
}

function impactCopy(signalType: string): { why: string; company: string; career: string } {
  if (signalType === '採用・役割') return {
    why: '企業がAIを実験から本番へ移すために、どの役割と能力を必要としているかを示す一次情報です。',
    company: '採用要件から、社内のAI導入チームに必要な技術・顧客理解・運用責任を逆算できます。',
    career: 'FDEに求められる実装力、顧客との対話、評価と本番運用の経験を具体的に確認できます。'
  };
  return {
    why: 'AIを顧客の業務に組み込み、評価し、本番で使われ続ける状態まで届ける方法を示す一次情報です。',
    company: '自社のAI導入を、試作だけでなくデータ・評価・安全・定着まで含めて設計する参考になります。',
    career: '現場課題の発見から実装、評価、導入後の改善まで、FDEが担う仕事の範囲を学べます。'
  };
}

async function persistArchive(env: Env, source: SourceRecord, items: DiscoveredItem[], mode: SourceRecord['fetchMode'], fetchedAt: string): Promise<void> {
  const serialized = JSON.stringify({ sourceId: source.id, items, fetchedAt, mode });
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
  } else if (env.ARCHIVE) {
    await env.ARCHIVE.put(`ingest/${source.id}/${fetchedAt.replaceAll(':', '-')}.json`, serialized);
  }
}

async function markSourceSuccess(env: Env, source: SourceRecord, meta: FetchMeta): Promise<void> {
  await env.DB.prepare(
    `UPDATE sources SET etag = ?, last_modified = ?, last_success_at = ?, consecutive_failures = 0,
     backoff_until = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).bind(meta.etag ?? source.etag ?? null, meta.lastModified ?? source.lastModified ?? null, new Date().toISOString(), source.id).run();
}

async function markSourceFailure(env: Env, source: SourceRecord, failure: FetchFailure): Promise<void> {
  const attempts = (source.consecutiveFailures ?? 0) + 1;
  const delaySeconds = failure.retryAfterSeconds ?? Math.min(86_400, 60 * 2 ** Math.min(attempts, 8));
  await env.DB.prepare(
    `UPDATE sources SET last_error_at = ?, consecutive_failures = ?, backoff_until = ?,
     updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).bind(new Date().toISOString(), attempts, new Date(Date.now() + delaySeconds * 1000).toISOString(), source.id).run().catch(() => undefined);
}

async function dispatchSources(env: Env): Promise<void> {
  const sources = await readSources(env);
  if (!sources.length) return;
  await env.INGEST_QUEUE.send({ sourceIds: sources.map((source) => source.id), reason: 'scheduled' });
  await env.CACHE.put('ingest:last-dispatch', new Date().toISOString(), { expirationTtl: 172800 });
}

function isAuthorized(request: Request, env: Env): boolean {
  if (!env.INGEST_TOKEN) return true;
  return request.headers.get('authorization') === `Bearer ${env.INGEST_TOKEN}`;
}

function readFeedLink(rawLink: unknown, baseUrl: string): string | undefined {
  for (const link of Array.isArray(rawLink) ? rawLink : [rawLink]) {
    const value = typeof link === 'string' ? link : (link as Record<string, unknown> | undefined)?.['@_href'] ?? (link as Record<string, unknown> | undefined)?.href;
    if (!value) continue;
    try { return new URL(String(value), baseUrl).toString(); } catch { /* malformed item */ }
  }
  return undefined;
}

function extractFeedTags(raw: unknown): string[] {
  return (Array.isArray(raw) ? raw : raw ? [raw] : []).slice(0, 8).map((tag) => {
    if (typeof tag === 'string') return cleanText(tag);
    const value = tag as Record<string, unknown>;
    return cleanText(String(value?.['#text'] ?? value?.['@_term'] ?? value?.name ?? ''));
  }).filter(Boolean);
}

function compactTags(tags: string[]): string[] {
  return [...new Set(tags.map(cleanText).filter(Boolean))].slice(0, 10);
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

function cleanText(value: string): string {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(?:amp;)?lt;/g, '<').replace(/&(?:amp;)?gt;/g, '>')
    .replace(/&(?:amp;)?quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
    .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function normalizeUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'source'].forEach((key) => url.searchParams.delete(key));
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch { return undefined; }
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
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
      const sources = await readSources(env, message.body.sourceIds, message.body.reason === 'manual');
      const failures: string[] = [];
      for (const source of sources) {
        try { await ingestSource(env, source); }
        catch (error) { failures.push(`${source.id}: ${errorMessage(error)}`); }
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
