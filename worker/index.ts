/// <reference types="@cloudflare/workers-types" />

import { XMLParser } from 'fast-xml-parser';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type RegistrationResponseJSON
} from '@simplewebauthn/server';
import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import postgres from 'postgres';

import { sourceRegistry, type ContentType, type FdePillar, type SourceKind, type SourceRecord } from './sourceRegistry';

export type IngestMessage = {
  sourceIds?: string[];
  reason?: 'scheduled' | 'manual' | 'backfill';
  since?: string;
  page?: number;
};

type IngestOptions = {
  mode: 'scheduled' | 'manual' | 'backfill';
  since?: string;
  page?: number;
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
  content_type: ContentType;
  default_pillar: FdePillar;
  source_tier: 1 | 2 | 3;
  source_weight: number;
  min_fde_score: number;
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
  pillar?: FdePillar;
  subtopic?: string;
  contentType?: ContentType;
  summaryJa?: string;
  summaryZh?: string;
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
const SESSION_COOKIE = 'fde_session';
const SESSION_DAYS = 30;
const app = new Hono<{ Bindings: Env }>();

const ROLE_PATTERN = /(forward deployed|deployment engineer|deployment engineering|applied ai (engineer|architect)|technical deployment lead|customer deployment|beneficial deployments|フォワード.?デプロイド|AI導入エンジニア|AIソリューションエンジニア)/i;
const AI_PATTERN = /\b(ai|artificial intelligence|llm|large language model|generative ai|genai|agentic|gpt|claude|gemini|bedrock|copilot|aip|workers ai)\b|生成AI|人工知能/i;
const FIELD_PATTERN = /(customer|client|enterprise|government|public sector|現場|顧客|企業)/i;
const DELIVERY_PATTERN = /(deploy|deployment|production|rollout|adoption|implementation|integrat|workflow|pilot|本番|導入|実装|運用)/i;
const QUALITY_PATTERN = /(eval|evaluation|reliability|observability|guardrail|security|governance|safety|品質|評価|安全|ガバナンス)/i;
const BUILD_PATTERN = /(agent|rag|retrieval|tool use|computer use|coding|codex|mcp|connector|integration|legacy|エージェント|検索|連携|コード)/i;
const DEPLOY_PATTERN = /(cloud|on.?prem|identity|permission|data residency|database|observability|latency|cost|production|deploy|運用|本番|権限|認証|データ|コスト)/i;
const GOVERN_PATTERN = /(security|privacy|regulat|policy|governance|evaluation|evals|reliability|prompt injection|安全|規制|指針|ガイドライン|評価|品質|プライバシー)/i;
const ORG_PATTERN = /(forward deployed|\bfde\b|fdse|deployment strategist|ai coe|center of excellence|change management|ai.native|組織|人材|採用|内製化)/i;
const CUSTOMER_PATTERN = /(customer stor|case stud|use case|business process|roi|adoption|transformation|customer|client|導入事例|業務|顧客|活用事例|効果)/i;

app.get('/api/health', (c) => c.json({
  ok: true,
  service: 'ai-fde-radar-api',
  version: '2026-08-09-passkey-d1',
  architecture: 'Astro + Hono + Workers + D1/FTS5 + Hyperdrive/PostgreSQL + KV + Queues',
  time: new Date().toISOString()
}));

app.get('/api/config', (c) => c.json({
  pillars: ['すべて', 'Customer', 'Build', 'Deploy', 'Govern', 'Organization'],
  types: ['すべて', 'news', 'blog', 'video', 'paper', 'report', 'release', 'case-study', 'career'],
  regions: ['ALL', 'Japan', 'Global'],
  priorities: ['ALL', 'P0', 'P1', 'P2'],
  topics: ['Identity', 'Observability', 'Integration', 'Cost', 'Evaluation', 'Human-in-the-loop', 'Change Management'],
  channels: ['action', 'research', 'career']
}));

app.get('/api/articles', async (c) => {
  const query = c.req.query('q')?.trim() ?? '';
  const region = c.req.query('region') ?? 'ALL';
  const pillar = c.req.query('pillar') ?? c.req.query('topic') ?? 'すべて';
  const priority = c.req.query('priority') ?? 'ALL';
  const topicLayer = c.req.query('layer')?.trim() ?? '';
  const channel = c.req.query('channel') ?? 'action';
  const contentType = c.req.query('type') ?? 'すべて';
  const limit = Math.min(Math.max(Number(c.req.query('limit') ?? 60), 1), 100);
  try {
    const clauses = ["a.status = 'published'", 'a.fde_score >= 40'];
    const values: Array<string | number> = [];
    if (region !== 'ALL') {
      clauses.push('a.region = ?');
      values.push(region);
    }
    if (pillar !== 'すべて') {
      clauses.push('a.core_pillar = ?');
      values.push(pillar);
    }
    if (priority !== 'ALL') {
      clauses.push('a.priority_level = ?');
      values.push(priority);
    }
    if (topicLayer) {
      clauses.push('EXISTS (SELECT 1 FROM json_each(a.topic_layers) WHERE value = ?)');
      values.push(topicLayer);
    }
    if (channel === 'research') clauses.push("a.content_type IN ('paper', 'report')");
    if (channel === 'career') clauses.push("a.content_type = 'career'");
    if (channel === 'action') clauses.push("a.content_type NOT IN ('paper', 'report', 'career')");
    if (contentType !== 'すべて') {
      clauses.push('a.content_type = ?');
      values.push(contentType);
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
       ORDER BY CASE a.priority_level WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 ELSE 2 END,
                a.priority_score DESC, a.published_at DESC LIMIT ?`
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
          SUM(CASE WHEN region = 'Japan' THEN 1 ELSE 0 END) AS japan,
          SUM(CASE WHEN content_type = 'career' THEN 1 ELSE 0 END) AS careers,
          SUM(CASE WHEN content_type = 'paper' THEN 1 ELSE 0 END) AS papers,
          SUM(CASE WHEN content_type = 'video' THEN 1 ELSE 0 END) AS videos,
          SUM(CASE WHEN priority_level = 'P0' AND content_type NOT IN ('paper', 'report', 'career') THEN 1 ELSE 0 END) AS p0,
          SUM(CASE WHEN priority_level = 'P1' AND content_type NOT IN ('paper', 'report', 'career') THEN 1 ELSE 0 END) AS p1,
          SUM(CASE WHEN priority_level = 'P2' AND content_type NOT IN ('paper', 'report', 'career') THEN 1 ELSE 0 END) AS p2
         FROM articles WHERE status = 'published' AND fde_score >= 40`
      ).first(),
      c.env.DB.prepare(
        `SELECT id, name, source_kind, content_type, default_pillar, source_tier, homepage,
                last_success_at, last_error_at, consecutive_failures
         FROM sources WHERE allowed_fetch = 1 ORDER BY priority DESC`
      ).all(),
      c.env.DB.prepare(
        `SELECT MAX(discovered_at) AS last_ingested_at, MAX(published_at) AS latest_published_at
         FROM articles WHERE status = 'published' AND fde_score >= 40`
      ).first()
    ]);
    return c.json({ counts, sources: sources.results, ...latest }, 200, {
      'Cache-Control': 'public, max-age=15, s-maxage=60'
    });
  } catch (error) {
    return c.json({ counts: { total: 0, japan: 0, careers: 0 }, sources: [], error: errorMessage(error) }, 503);
  }
});

app.post('/api/auth/passkey/register/options', async (c) => {
  if (!sameOrigin(c.req.raw)) return c.json({ error: '不正なリクエストです。' }, 403);
  const payload = await c.req.json().catch(() => ({})) as { displayName?: string };
  const displayName = cleanText(payload.displayName ?? '').slice(0, 40);
  if (!displayName) return c.json({ error: '表示名を入力してください。' }, 400);
  if (!await allowAuthAttempt(c.env, c.req.raw, 'register')) return c.json({ error: '試行回数が多すぎます。しばらく待ってからお試しください。' }, 429);
  const userId = crypto.randomUUID();
  const webauthnUserID = crypto.getRandomValues(new Uint8Array(32));
  const { rpID } = relyingParty(c.req.raw);
  const options = await generateRegistrationOptions({
    rpName: 'FDE Radar', rpID, userName: displayName, userDisplayName: displayName,
    userID: webauthnUserID, attestationType: 'none', supportedAlgorithmIDs: [-7, -257],
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' }
  });
  const flowId = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO auth_challenges (id, kind, challenge, user_id, display_name, webauthn_user_id, expires_at)
     VALUES (?, 'register', ?, ?, ?, ?, ?)`
  ).bind(flowId, options.challenge, userId, displayName, options.user.id, new Date(Date.now() + 300_000).toISOString()).run();
  return c.json({ flowId, options, challengeStore: 'd1' });
});

app.post('/api/auth/passkey/register/verify', async (c) => {
  if (!sameOrigin(c.req.raw)) return c.json({ error: '不正なリクエストです。' }, 403);
  const payload = await c.req.json().catch(() => ({})) as { flowId?: string; response?: RegistrationResponseJSON };
  if (!payload.flowId || !payload.response) return c.json({ error: '登録情報が不足しています。' }, 400);
  const state = await c.env.DB.prepare(
    `SELECT challenge, user_id, display_name, webauthn_user_id FROM auth_challenges
     WHERE id = ? AND kind = 'register' AND expires_at > CURRENT_TIMESTAMP`
  ).bind(payload.flowId).first<{ challenge: string; user_id: string; display_name: string; webauthn_user_id: string }>();
  if (!state) return c.json({ error: '登録の有効時間が切れました。もう一度お試しください。' }, 400);
  const { rpID, origin } = relyingParty(c.req.raw);
  try {
    const verification = await verifyRegistrationResponse({ response: payload.response, expectedChallenge: state.challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true });
    if (!verification.verified || !verification.registrationInfo) return c.json({ error: 'パスキーを確認できませんでした。' }, 400);
    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
    await c.env.DB.batch([
      c.env.DB.prepare('INSERT INTO users (id, display_name, webauthn_user_id) VALUES (?, ?, ?)').bind(state.user_id, state.display_name, state.webauthn_user_id),
      c.env.DB.prepare(
        `INSERT INTO passkey_credentials (id, user_id, public_key, counter, transports, device_type, backed_up)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(credential.id, state.user_id, credential.publicKey.buffer, credential.counter, JSON.stringify(credential.transports ?? []), credentialDeviceType, credentialBackedUp ? 1 : 0),
      c.env.DB.prepare('DELETE FROM auth_challenges WHERE id = ?').bind(payload.flowId)
    ]);
    const session = await createSession(c.env, state.user_id, c.req.header('user-agent') ?? '');
    setSessionCookie(c, session.token);
    return c.json({ user: { id: state.user_id, displayName: state.display_name }, bookmarkIds: [] }, 201);
  } catch (error) { return c.json({ error: `パスキーを登録できませんでした。${errorMessage(error)}` }, 400); }
});

app.post('/api/auth/passkey/login/options', async (c) => {
  if (!sameOrigin(c.req.raw)) return c.json({ error: '不正なリクエストです。' }, 403);
  if (!await allowAuthAttempt(c.env, c.req.raw, 'login')) return c.json({ error: '試行回数が多すぎます。しばらく待ってからお試しください。' }, 429);
  const { rpID } = relyingParty(c.req.raw);
  const options = await generateAuthenticationOptions({ rpID, userVerification: 'required' });
  const flowId = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO auth_challenges (id, kind, challenge, expires_at) VALUES (?, 'login', ?, ?)`
  ).bind(flowId, options.challenge, new Date(Date.now() + 300_000).toISOString()).run();
  return c.json({ flowId, options });
});

app.post('/api/auth/passkey/login/verify', async (c) => {
  if (!sameOrigin(c.req.raw)) return c.json({ error: '不正なリクエストです。' }, 403);
  const payload = await c.req.json().catch(() => ({})) as { flowId?: string; response?: AuthenticationResponseJSON };
  if (!payload.flowId || !payload.response) return c.json({ error: 'ログイン情報が不足しています。' }, 400);
  const challengeRow = await c.env.DB.prepare(
    `SELECT challenge FROM auth_challenges WHERE id = ? AND kind = 'login' AND expires_at > CURRENT_TIMESTAMP`
  ).bind(payload.flowId).first<{ challenge: string }>();
  if (!challengeRow) return c.json({ error: 'ログインの有効時間が切れました。もう一度お試しください。' }, 400);
  const credential = await c.env.DB.prepare(
    `SELECT p.id, p.user_id, p.public_key, p.counter, p.transports, u.display_name
     FROM passkey_credentials p JOIN users u ON u.id = p.user_id WHERE p.id = ?`
  ).bind(payload.response.id).first<{ id: string; user_id: string; public_key: ArrayBuffer; counter: number; transports: string; display_name: string }>();
  if (!credential) return c.json({ error: 'このパスキーは登録されていません。' }, 401);
  const { rpID, origin } = relyingParty(c.req.raw);
  try {
    const verification = await verifyAuthenticationResponse({
      response: payload.response, expectedChallenge: challengeRow.challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true,
      credential: { id: credential.id, publicKey: new Uint8Array(credential.public_key), counter: credential.counter, transports: JSON.parse(credential.transports) as AuthenticatorTransportFuture[] }
    });
    if (!verification.verified) return c.json({ error: 'パスキーを確認できませんでした。' }, 401);
    await c.env.DB.prepare('UPDATE passkey_credentials SET counter = ?, last_used_at = CURRENT_TIMESTAMP WHERE id = ?').bind(verification.authenticationInfo.newCounter, credential.id).run();
    await c.env.DB.prepare('DELETE FROM auth_challenges WHERE id = ?').bind(payload.flowId).run();
    const session = await createSession(c.env, credential.user_id, c.req.header('user-agent') ?? '');
    setSessionCookie(c, session.token);
    const bookmarks = await c.env.DB.prepare('SELECT article_id FROM user_bookmarks WHERE user_id = ?').bind(credential.user_id).all<{ article_id: string }>();
    return c.json({ user: { id: credential.user_id, displayName: credential.display_name }, bookmarkIds: bookmarks.results.map((row) => row.article_id) });
  } catch (error) { return c.json({ error: `ログインできませんでした。${errorMessage(error)}` }, 401); }
});

app.get('/api/auth/me', async (c) => {
  const session = await readSession(c.env, getCookie(c, SESSION_COOKIE));
  if (!session) return c.json({ user: null, bookmarkIds: [] });
  const bookmarks = await c.env.DB.prepare('SELECT article_id FROM user_bookmarks WHERE user_id = ? ORDER BY created_at DESC').bind(session.userId).all<{ article_id: string }>();
  return c.json({ user: { id: session.userId, displayName: session.displayName }, bookmarkIds: bookmarks.results.map((row) => row.article_id) });
});

app.post('/api/auth/logout', async (c) => {
  if (!sameOrigin(c.req.raw)) return c.json({ error: '不正なリクエストです。' }, 403);
  const token = getCookie(c, SESSION_COOKIE);
  if (token) await c.env.DB.prepare('DELETE FROM user_sessions WHERE token_hash = ?').bind(await sha256(token)).run();
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
  return c.json({ ok: true });
});

app.get('/api/auth/sessions', async (c) => {
  const currentToken = getCookie(c, SESSION_COOKIE);
  const session = await readSession(c.env, currentToken);
  if (!session) return c.json({ error: 'ログインが必要です。' }, 401);
  const sessions = await c.env.DB.prepare(
    `SELECT id, created_at, last_seen_at, expires_at, user_agent,
            CASE WHEN token_hash = ? THEN 1 ELSE 0 END AS is_current
     FROM user_sessions WHERE user_id = ? AND expires_at > CURRENT_TIMESTAMP
     ORDER BY last_seen_at DESC`
  ).bind(await sha256(currentToken!), session.userId).all();
  return c.json({ sessions: sessions.results });
});

app.delete('/api/auth/sessions/:id', async (c) => {
  if (!sameOrigin(c.req.raw)) return c.json({ error: '不正なリクエストです。' }, 403);
  const currentToken = getCookie(c, SESSION_COOKIE);
  const session = await readSession(c.env, currentToken);
  if (!session) return c.json({ error: 'ログインが必要です。' }, 401);
  const target = await c.env.DB.prepare('SELECT token_hash FROM user_sessions WHERE id = ? AND user_id = ?').bind(c.req.param('id'), session.userId).first<{ token_hash: string }>();
  if (!target) return c.json({ error: 'セッションが見つかりません。' }, 404);
  await c.env.DB.prepare('DELETE FROM user_sessions WHERE id = ? AND user_id = ?').bind(c.req.param('id'), session.userId).run();
  if (target.token_hash === await sha256(currentToken!)) deleteCookie(c, SESSION_COOKIE, { path: '/' });
  return c.json({ ok: true });
});

app.get('/api/bookmarks', async (c) => {
  const session = await readSession(c.env, getCookie(c, SESSION_COOKIE));
  if (!session) return c.json({ error: 'ログインが必要です。' }, 401);
  const rows = await c.env.DB.prepare(
    `SELECT a.*, s.name AS source_name, s.source_kind, b.created_at AS bookmarked_at
     FROM user_bookmarks b JOIN articles a ON a.id = b.article_id JOIN sources s ON s.id = a.source_id
     WHERE b.user_id = ? ORDER BY CASE a.priority_level WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 ELSE 2 END, b.created_at DESC`
  ).bind(session.userId).all();
  return c.json({ articles: rows.results });
});

app.put('/api/bookmarks/:articleId', async (c) => {
  if (!sameOrigin(c.req.raw)) return c.json({ error: '不正なリクエストです。' }, 403);
  const session = await readSession(c.env, getCookie(c, SESSION_COOKIE));
  if (!session) return c.json({ error: 'ログインが必要です。' }, 401);
  const articleId = c.req.param('articleId');
  const exists = await c.env.DB.prepare("SELECT id FROM articles WHERE id = ? AND status = 'published'").bind(articleId).first();
  if (!exists) return c.json({ error: '記事が見つかりません。' }, 404);
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT OR IGNORE INTO user_bookmarks (user_id, article_id) VALUES (?, ?)').bind(session.userId, articleId),
    c.env.DB.prepare("INSERT INTO user_actions (id, user_id, article_id, action) VALUES (?, ?, ?, 'saved')").bind(crypto.randomUUID(), session.userId, articleId)
  ]);
  return c.json({ saved: true });
});

app.delete('/api/bookmarks/:articleId', async (c) => {
  if (!sameOrigin(c.req.raw)) return c.json({ error: '不正なリクエストです。' }, 403);
  const session = await readSession(c.env, getCookie(c, SESSION_COOKIE));
  if (!session) return c.json({ error: 'ログインが必要です。' }, 401);
  const articleId = c.req.param('articleId');
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM user_bookmarks WHERE user_id = ? AND article_id = ?').bind(session.userId, articleId),
    c.env.DB.prepare("INSERT INTO user_actions (id, user_id, article_id, action) VALUES (?, ?, ?, 'unsaved')").bind(crypto.randomUUID(), session.userId, articleId)
  ]);
  return c.json({ saved: false });
});

app.post('/api/articles/:articleId/open', async (c) => {
  if (!sameOrigin(c.req.raw)) return c.json({ ok: false }, 403);
  const session = await readSession(c.env, getCookie(c, SESSION_COOKIE));
  if (session) await c.env.DB.prepare("INSERT INTO user_actions (id, user_id, article_id, action) VALUES (?, ?, ?, 'opened')")
    .bind(crypto.randomUUID(), session.userId, c.req.param('articleId')).run().catch(() => undefined);
  return c.json({ ok: true });
});

app.get('/api/ingest/status', async (c) => {
  try {
    const [sources, runs] = await Promise.all([
      c.env.DB.prepare(
        `SELECT id, name, source_kind, content_type, default_pillar, fetch_mode,
                last_success_at, last_error_at, consecutive_failures, backoff_until
         FROM sources WHERE allowed_fetch = 1 ORDER BY priority DESC`
      ).all(),
      c.env.DB.prepare(
        `SELECT source_id, status, discovered_count, unique_count, error_message, started_at, finished_at,
                ingest_mode, backfill_page, since_at
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
  await syncSourceRegistry(c.env);
  const payload = (await c.req.json().catch(() => ({}))) as IngestMessage;
  const sourceIds = payload.sourceIds?.length
    ? payload.sourceIds
    : sourceRegistry.filter((source) => source.enabled !== false).map((source) => source.id);
  for (let index = 0; index < sourceIds.length; index += 20) {
    await c.env.DB.batch(sourceIds.slice(index, index + 20).map((sourceId) =>
      c.env.DB.prepare('UPDATE sources SET etag = NULL, last_modified = NULL WHERE id = ?').bind(sourceId)
    ));
  }
  await c.env.INGEST_QUEUE.sendBatch(sourceIds.map((sourceId) => ({ body: { sourceIds: [sourceId], reason: 'manual' as const } })));
  await c.env.CACHE.put('ingest:last-dispatch', new Date().toISOString(), { expirationTtl: 172800 });
  return c.json({ queued: sourceIds.length, sourceIds });
});

app.post('/api/ingest/backfill', async (c) => {
  if (!isAuthorized(c.req.raw, c.env)) return c.json({ error: 'Unauthorized' }, 401);
  await syncSourceRegistry(c.env);
  const payload = (await c.req.json().catch(() => ({}))) as { since?: string; sourceIds?: string[]; pages?: number[] };
  const since = normalizeBackfillSince(payload.since);
  if (!since) return c.json({ error: 'since must be an ISO date on or after 2026-06-01' }, 400);
  const requested = new Set(payload.sourceIds ?? []);
  const requestedPages = payload.pages?.filter((page) => Number.isInteger(page) && page > 0);
  const sources = sourceRegistry.filter((source) =>
    source.enabled !== false
    && Boolean(source.backfillPages)
    && (!requested.size || requested.has(source.id))
  );
  const sourcePages = sources.map((source) => ({
    source,
    pages: requestedPages?.length
      ? requestedPages.filter((page) => page <= (source.backfillPages ?? 1))
      : Array.from({ length: source.backfillPages ?? 1 }, (_, page) => page + 1)
  }));
  const messages = sourcePages.flatMap(({ source, pages }) => pages.map((page) => ({
    body: { sourceIds: [source.id], reason: 'backfill' as const, since, page }
  })));
  for (let index = 0; index < messages.length; index += 100) {
    await c.env.INGEST_QUEUE.sendBatch(messages.slice(index, index + 100));
  }
  await c.env.CACHE.put('backfill:last-dispatch', JSON.stringify({ since, queued: messages.length, at: new Date().toISOString() }), { expirationTtl: 604800 });
  return c.json({ queued: messages.length, since, sources: sourcePages.map(({ source, pages }) => ({ id: source.id, pages })) });
});

async function readSources(env: Env, sourceIds?: string[], force = false): Promise<SourceRecord[]> {
  const now = new Date().toISOString();
  try {
    const dueClause = force ? '' : "AND (last_success_at IS NULL OR datetime(last_success_at, '+' || poll_interval_minutes || ' minutes') <= datetime(?))";
    const statement = env.DB.prepare(
      `SELECT id, name, homepage, feed_url, api_url, fetch_mode, language, country, source_kind,
              content_type, default_pillar, source_tier, source_weight, min_fde_score,
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
      .map((source) => {
        const registrySource = sourceRegistry.find((item) => item.id === source.id);
        return {
          id: source.id,
          name: source.name,
          homepage: source.homepage,
          feedUrl: source.feed_url ?? undefined,
          apiUrl: source.api_url ?? undefined,
          fetchMode: source.fetch_mode,
          language: source.language,
          country: source.country,
          kind: source.source_kind,
          contentType: source.content_type,
          defaultPillar: source.default_pillar,
          sourceTier: source.source_tier,
          weight: source.source_weight,
          minScore: source.min_fde_score,
          parseMode: registrySource?.parseMode,
          backfillPages: registrySource?.backfillPages,
          backfillMode: registrySource?.backfillMode,
          priority: source.priority,
          pollIntervalMinutes: source.poll_interval_minutes,
          etag: source.etag ?? undefined,
          lastModified: source.last_modified ?? undefined,
          consecutiveFailures: source.consecutive_failures,
          backoffUntil: source.backoff_until ?? undefined
        };
      });
  } catch {
    return sourceRegistry.filter((source) => source.enabled !== false && (!sourceIds?.length || sourceIds.includes(source.id)));
  }
}

async function syncSourceRegistry(env: Env): Promise<void> {
  const statements = sourceRegistry.map((source) => env.DB.prepare(
    `INSERT INTO sources
      (id, name, homepage, feed_url, api_url, fetch_mode, language, country, source_kind,
       content_type, default_pillar, source_tier, source_weight, min_fde_score, priority,
       poll_interval_minutes, allowed_fetch, parser_version, robots_checked_at, tos_reviewed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '3', ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name, homepage = excluded.homepage, feed_url = excluded.feed_url,
       api_url = excluded.api_url, fetch_mode = excluded.fetch_mode, language = excluded.language,
       country = excluded.country, source_kind = excluded.source_kind,
       content_type = excluded.content_type, default_pillar = excluded.default_pillar,
       source_tier = excluded.source_tier, source_weight = excluded.source_weight,
       min_fde_score = excluded.min_fde_score, priority = excluded.priority,
       poll_interval_minutes = excluded.poll_interval_minutes, allowed_fetch = excluded.allowed_fetch,
       parser_version = '3', updated_at = CURRENT_TIMESTAMP`
  ).bind(
    source.id, source.name, source.homepage, source.feedUrl ?? null, source.apiUrl ?? null,
    source.fetchMode, source.language, source.country, source.kind, source.contentType,
    source.defaultPillar, source.sourceTier, source.weight, source.minScore, source.priority,
    source.pollIntervalMinutes, source.enabled === false ? 0 : 1,
    new Date().toISOString().slice(0, 10), new Date().toISOString().slice(0, 10)
  ));
  for (let index = 0; index < statements.length; index += 20) {
    await env.DB.batch(statements.slice(index, index + 20));
  }
}

async function fetchSourceItems(source: SourceRecord, options: IngestOptions): Promise<{ items: DiscoveredItem[]; meta: FetchMeta }> {
  const candidates = [
    { mode: 'api' as const, url: source.apiUrl },
    { mode: 'rss' as const, url: source.feedUrl },
    { mode: 'html' as const, url: source.fetchMode === 'html' ? source.homepage : undefined }
  ].filter((candidate): candidate is { mode: SourceRecord['fetchMode']; url: string } => Boolean(candidate.url));
  let lastError: FetchFailure | undefined;
  for (const candidate of candidates) {
    try {
      const requestUrl = options.mode === 'backfill'
        ? buildBackfillUrl(source, candidate.url, options)
        : candidate.url;
      const result = await fetchWithPolicy(source, requestUrl, options.mode === 'backfill');
      if (result.notModified) return { items: [], meta: { ...result, mode: candidate.mode } };
      const discovered = candidate.mode === 'api'
        ? await parseApiResponse(source, result.response)
        : candidate.mode === 'rss'
          ? await parseRssResponse(source, result.response, options.mode === 'backfill' ? 1_500 : 60)
          : await parseHtmlResponse(source, result.response);
      let window = discovered;
      if (options.mode === 'backfill') {
        const sinceTime = Date.parse(options.since ?? '');
        window = window.filter((item) => Date.parse(item.publishedAt) >= sinceTime);
        if (source.backfillMode === 'feed-window') {
          const pageSize = 75;
          const offset = Math.max(0, ((options.page ?? 1) - 1) * pageSize);
          window = window.slice(offset, offset + pageSize);
        }
      }
      const items = window
        .map((item) => enrichItem(source, item))
        .filter((item) => item.fdeScore >= source.minScore);
      return { items, meta: { ...result, mode: candidate.mode } };
    } catch (error) {
      lastError = error as FetchFailure;
    }
  }
  throw lastError ?? new Error(`${source.name}: no fetch surface configured`);
}

async function fetchWithPolicy(source: SourceRecord, url: string, unconditional = false): Promise<{ response: Response; etag: string | null; lastModified: string | null; notModified?: boolean }> {
  const headers = new Headers({
    accept: 'application/atom+xml, application/rss+xml, application/xml, text/xml, application/json, text/html',
    'user-agent': USER_AGENT
  });
  if (!unconditional && source.etag) headers.set('if-none-match', source.etag);
  if (!unconditional && source.lastModified) headers.set('if-modified-since', source.lastModified);
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

function buildBackfillUrl(source: SourceRecord, rawUrl: string, options: IngestOptions): string {
  const url = new URL(rawUrl);
  const page = Math.max(1, options.page ?? 1);
  if (source.id === 'qiita-fde') {
    const sinceDay = (options.since ?? '').slice(0, 10);
    const baseQuery = url.searchParams.get('query') ?? '';
    url.searchParams.set('query', `(${baseQuery}) created:>=${sinceDay}`);
    url.searchParams.set('per_page', '100');
    url.searchParams.set('page', String(page));
  } else if (source.id === 'arxiv-fde-research') {
    url.searchParams.set('start', String((page - 1) * 100));
    url.searchParams.set('max_results', '100');
  } else if (source.backfillMode === 'feed-page') {
    url.searchParams.set('paged', String(page));
  }
  return url.toString();
}

async function parseApiResponse(source: SourceRecord, response: Response): Promise<DiscoveredItem[]> {
  const json = await response.json() as { jobs?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>;
  const rawItems = Array.isArray(json) ? json : json.jobs ?? [];
  return rawItems.slice(0, 800).flatMap((item) => {
    if (source.id === 'qiita-fde') return parseQiitaItem(item);
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

async function parseRssResponse(source: SourceRecord, response: Response, maxEntries = 60): Promise<DiscoveredItem[]> {
  const body = (await response.text()).slice(0, MAX_BODY_BYTES);
  const parsed = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' }).parse(body);
  const entries = parsed.feed?.entry ?? parsed.rss?.channel?.item ?? parsed.channel?.item ?? [];
  const list = Array.isArray(entries) ? entries : [entries];
  return list.slice(0, maxEntries).flatMap((entry) => {
    const link = readFeedLink(entry?.link, source.homepage);
    const title = cleanText(String(entry?.title ?? ''));
    const rawSummary = cleanText(String(
      entry?.summary ?? entry?.description ?? entry?.['content:encoded']
      ?? entry?.['media:group']?.['media:description'] ?? ''
    ));
    const tags = extractFeedTags(entry?.category);
    const haystack = `${title} ${rawSummary} ${tags.join(' ')}`;
    const score = scoreFde(haystack, false);
    if (!link || !title) return [];
    if (!AI_PATTERN.test(haystack) && !ROLE_PATTERN.test(haystack) && source.kind !== 'report') return [];
    if (source.kind === 'community' && !passesCommunityGate(title, haystack)) return [];
    if (source.id === 'yahoo-japan-it' && !(AI_PATTERN.test(title) && FIELD_PATTERN.test(haystack) && (DELIVERY_PATTERN.test(haystack) || QUALITY_PATTERN.test(haystack)))) return [];
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
      countryRelevance: source.country === 'JP' ? 'JP' : inferRegion(location || haystack),
      fdeScore: score
    }];
  });
}

async function parseHtmlResponse(source: SourceRecord, response: Response): Promise<DiscoveredItem[]> {
  if (source.parseMode === 'page') return parseSingleCareerPage(source, response);
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
        const isRelevantCareer = source.kind !== 'careers' || ROLE_PATTERN.test(title);
        if (title.length >= 8 && isRelevantCareer && (AI_PATTERN.test(title) || ROLE_PATTERN.test(title))) candidates.push({
          externalItemId: current.url,
          url: current.url,
          title,
          summary: `${source.name}の公式ページで確認された更新です。`,
          publishedAt: dateFromTitle(title) ?? new Date().toISOString(),
          tags: compactTags(extractKeywords(title)),
          signalType: source.kind === 'careers' ? '採用・役割' : inferSignalType(title),
          location: inferLocation(title),
          sector: inferSector(title),
          countryRelevance: source.country === 'JP' ? 'JP' : inferRegion(title),
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
  const score = scoreFde(haystack, source.kind === 'careers');
  if (!title || (!AI_PATTERN.test(haystack) && source.kind !== 'government' && source.kind !== 'report' && source.kind !== 'careers')) return [];
  return [{
    externalItemId: source.homepage,
    url: source.homepage,
    title,
    summary: description.slice(0, 300),
    publishedAt: new Date().toISOString(),
    tags: compactTags([source.kind === 'careers' ? 'FDE' : source.defaultPillar, 'AI', ...extractKeywords(haystack)]),
    signalType: source.kind === 'careers' ? '採用・役割' : inferSignalType(haystack),
    location: source.country === 'JP' ? '日本' : inferLocation(haystack),
    sector: inferSector(haystack),
    countryRelevance: source.country === 'JP' ? 'JP' : inferRegion(haystack),
    fdeScore: score
  }];
}

async function ingestSource(env: Env, source: SourceRecord, options: IngestOptions): Promise<{ discovered: number; unique: number }> {
  const startedAt = new Date().toISOString();
  const runId = crypto.randomUUID();
  try {
    const result = await fetchSourceItems(source, options);
    let unique = 0;
    for (const item of result.items) {
      const canonicalUrl = normalizeUrl(item.url);
      if (!canonicalUrl || item.title.length < 4) continue;
      const existing = await env.DB.prepare(
        'SELECT id, content_hash FROM articles WHERE canonical_url = ?'
      ).bind(canonicalUrl).first<{ id: string; content_hash: string | null }>();
      const id = existing?.id ?? crypto.randomUUID();
      const urlHash = await sha256(canonicalUrl);
      const titleNormalized = item.title.normalize('NFKC').toLowerCase();
      const contentHash = await sha256(`${item.title}\n${item.summary}\n${item.tags.join(' ')}`);
      const searchTokensJa = tokenizeJapanese(`${item.title} ${item.summary} ${item.summaryJa} ${item.tags.join(' ')} ${item.location} ${item.sector} ${item.pillar} ${item.subtopic}`);
      const impacts = inferImpactTags(source, item);
      const intelligence = inferIntelligence(source, item);
      const stored = await env.DB.prepare(
        `INSERT INTO articles
        (id, canonical_url, canonical_url_hash, external_item_id, source_id, title, title_normalized,
         summary, language, country_relevance, topic, tags, search_tokens_ja, published_at,
         japan_score, quality_score, trend_score, signal_type, location, sector, fde_score,
         why_it_matters, company_impact, career_impact, pillar, subtopic, content_type, region,
         summary_ja, summary_zh, customer_impact, engineering_impact,
         relevance_tags, business_impact_tags, engineering_impact_tags,
         content_hash, status, updated_at)
        VALUES (?, ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?, ?, 'published', CURRENT_TIMESTAMP)
        ON CONFLICT(canonical_url) DO UPDATE SET
          external_item_id = excluded.external_item_id,
          source_id = excluded.source_id,
          title = excluded.title,
          title_normalized = excluded.title_normalized,
          summary = excluded.summary,
          language = excluded.language,
          country_relevance = excluded.country_relevance,
          topic = excluded.topic,
          tags = excluded.tags,
          search_tokens_ja = excluded.search_tokens_ja,
          published_at = excluded.published_at,
          japan_score = excluded.japan_score,
          quality_score = excluded.quality_score,
          trend_score = excluded.trend_score,
          signal_type = excluded.signal_type,
          location = excluded.location,
          sector = excluded.sector,
          fde_score = excluded.fde_score,
          why_it_matters = excluded.why_it_matters,
          company_impact = excluded.company_impact,
          career_impact = excluded.career_impact,
          pillar = excluded.pillar,
          subtopic = excluded.subtopic,
          content_type = excluded.content_type,
          region = excluded.region,
          summary_ja = excluded.summary_ja,
          summary_zh = excluded.summary_zh,
          customer_impact = excluded.customer_impact,
          engineering_impact = excluded.engineering_impact,
          relevance_tags = excluded.relevance_tags,
          business_impact_tags = excluded.business_impact_tags,
          engineering_impact_tags = excluded.engineering_impact_tags,
          content_hash = excluded.content_hash,
          status = 'published',
          updated_at = CURRENT_TIMESTAMP
        RETURNING id`
      ).bind(
        id, canonicalUrl, urlHash, item.externalItemId, source.id, item.title, titleNormalized,
        item.summary, source.language, item.countryRelevance, item.signalType, item.tags.join(' '),
        searchTokensJa, item.publishedAt, item.countryRelevance === 'JP' ? 1 : item.countryRelevance === 'APAC' ? 0.75 : 0.45,
        source.weight / 100, item.fdeScore / 100, item.signalType, item.location, item.sector,
        item.fdeScore, '', '', '',
        item.pillar ?? source.defaultPillar, item.subtopic ?? '', item.contentType ?? source.contentType,
        item.countryRelevance === 'JP' ? 'Japan' : 'Global', item.summaryJa ?? '', item.summaryZh ?? '',
        '', '', JSON.stringify(impacts.relevance), JSON.stringify(impacts.business),
        JSON.stringify(impacts.engineering), contentHash
      ).first<{ id: string }>();
      if (stored?.id) {
        const seenAt = new Date().toISOString();
        await env.DB.prepare(
          `UPDATE articles SET core_pillar = ?, japan_lens = ?, topic_layers = ?, affected_stack = ?,
             priority_level = ?, recommended_action = ?, evidence = ?, relevance_score = ?,
             actionability_score = ?, authority_score = ?, novelty_score = ?, client_fit_score = ?,
             priority_score = ?, published_at_original = ?,
             first_seen_at = CASE WHEN first_seen_at = '' THEN COALESCE(discovered_at, created_at) ELSE first_seen_at END,
             last_seen_at = ?, source_updated_at = ?, crawl_run_at = ?, time_confidence = ?, dedup_confidence = 1
           WHERE id = ?`
        ).bind(
          intelligence.corePillar, intelligence.japanLens, JSON.stringify(intelligence.topicLayers),
          JSON.stringify(intelligence.affectedStack), intelligence.priorityLevel, intelligence.recommendedAction,
          intelligence.evidence, intelligence.relevanceScore, intelligence.actionabilityScore,
          intelligence.authorityScore, intelligence.noveltyScore, intelligence.clientFitScore,
          intelligence.priorityScore, item.publishedAt, seenAt, item.publishedAt, seenAt,
          intelligence.timeConfidence, stored.id
        ).run();
        await env.DB.prepare('DELETE FROM articles_fts WHERE article_id = ?').bind(stored.id).run();
        await env.DB.prepare(
          'INSERT INTO articles_fts (article_id, title, summary, tags, search_tokens_ja) VALUES (?, ?, ?, ?, ?)'
        ).bind(stored.id, item.title, item.summaryJa ?? item.summary, item.tags.join(' '), searchTokensJa).run();
      }
      if (!existing || existing.content_hash !== contentHash) {
        unique += 1;
        await env.DB.prepare(
          `INSERT OR IGNORE INTO article_versions
           (id, article_id, source_id, content_hash, title, summary, captured_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).bind(crypto.randomUUID(), id, source.id, contentHash, item.title, item.summary, new Date().toISOString()).run();
      }
    }
    await env.DB.prepare(
      `INSERT INTO fetch_runs
       (id, source_id, status, discovered_count, unique_count, started_at, finished_at, ingest_mode, backfill_page, since_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      runId, source.id, result.meta.notModified ? 'not_modified' : 'success', result.items.length, unique,
      startedAt, new Date().toISOString(), options.mode, options.page ?? null, options.since ?? null
    ).run();
    if (options.mode !== 'backfill') await markSourceSuccess(env, source, result.meta);
    if (!result.meta.notModified) await persistArchive(env, source, result.items, result.meta.mode, startedAt);
    return { discovered: result.items.length, unique };
  } catch (error) {
    const failure = error as FetchFailure;
    await env.DB.prepare(
      `INSERT INTO fetch_runs
       (id, source_id, status, error_message, started_at, finished_at, ingest_mode, backfill_page, since_at)
       VALUES (?, ?, 'error', ?, ?, ?, ?, ?, ?)`
    ).bind(
      runId, source.id, errorMessage(error), startedAt, new Date().toISOString(),
      options.mode, options.page ?? null, options.since ?? null
    ).run().catch(() => undefined);
    if (options.mode !== 'backfill') await markSourceFailure(env, source, failure);
    throw error;
  }
}

function enrichItem(source: SourceRecord, item: DiscoveredItem): DiscoveredItem {
  const haystack = `${item.title} ${item.summary} ${item.tags.join(' ')}`;
  const pillar = inferPillar(source, haystack);
  const subtopic = inferSubtopic(pillar, haystack);
  const score = scoreFde100(source, item.title, haystack);
  return {
    ...item,
    countryRelevance: source.country === 'JP' ? 'JP' : item.countryRelevance,
    fdeScore: score,
    pillar,
    subtopic,
    contentType: source.contentType,
    summaryJa: makeSummaryJa(source, item, pillar, subtopic),
    summaryZh: makeSummaryZh(source, item, pillar, subtopic)
  };
}

type Intelligence = {
  corePillar: Exclude<FdePillar, 'Japan'>;
  japanLens: string;
  topicLayers: string[];
  affectedStack: string[];
  priorityLevel: 'P0' | 'P1' | 'P2';
  recommendedAction: string;
  evidence: string;
  relevanceScore: number;
  actionabilityScore: number;
  authorityScore: number;
  noveltyScore: number;
  clientFitScore: number;
  priorityScore: number;
  timeConfidence: number;
};

function inferIntelligence(source: SourceRecord, item: DiscoveredItem): Intelligence {
  const text = `${item.title} ${item.summary} ${item.tags.join(' ')} ${item.subtopic ?? ''}`;
  const rawPillar = item.pillar ?? source.defaultPillar;
  let corePillar: Intelligence['corePillar'] = rawPillar === 'Japan'
    ? (GOVERN_PATTERN.test(text) ? 'Govern' : CUSTOMER_PATTERN.test(text) ? 'Customer' : 'Deploy')
    : rawPillar;
  if (!['Customer', 'Build', 'Deploy', 'Govern', 'Organization'].includes(corePillar)) corePillar = 'Customer';
  const topicLayers = compactTags([
    /(identity|permission|auth|認証|権限)/i.test(text) ? 'Identity' : '',
    /(observab|monitor|telemetry|監視|可観測)/i.test(text) ? 'Observability' : '',
    /(integrat|connector|連携|統合)/i.test(text) ? 'Integration' : '',
    /(cost|roi|価格|コスト)/i.test(text) ? 'Cost' : '',
    /(eval|benchmark|評価|品質)/i.test(text) ? 'Evaluation' : '',
    /(human.in.the.loop|human oversight|人間|承認)/i.test(text) ? 'Human-in-the-loop' : '',
    /(change management|adoption|定着|組織変革)/i.test(text) ? 'Change Management' : '',
    item.subtopic || 'AI Delivery'
  ]);
  const affectedStack = compactTags([
    /agent/i.test(text) ? 'AI Agent' : '',
    /(rag|retrieval)/i.test(text) ? 'RAG' : '',
    /(database|data platform|データベース)/i.test(text) ? 'Data Platform' : '',
    /cloud/i.test(text) ? 'Cloud' : '',
    /(model|モデル)/i.test(text) ? 'Model' : '',
    /(identity|auth|認証|権限)/i.test(text) ? 'IAM' : '',
    /(observab|monitor|telemetry|監視)/i.test(text) ? 'Observability' : ''
  ]);
  if (!affectedStack.length) affectedStack.push('Delivery Process');

  const urgentSecurity = /(vulnerab|critical cve|data breach|actively exploited|脆弱性|侵害|情報漏えい)/i.test(text);
  const urgentChange = /(breaking change|deprecated|end.of.life|service termination|提供終了|破壊的変更)/i.test(text);
  const operational = /(production|deploy|identity|permission|observab|integrat|connector|cost|case stud|rollout|本番|導入|運用|認証|権限|監視|連携|事例)/i.test(text);
  const background = ['paper', 'report', 'career'].includes(item.contentType ?? source.contentType);
  const ageDays = Math.max(0, (Date.now() - Date.parse(item.publishedAt)) / 86_400_000);
  const authoritative = ['official', 'platform', 'government', 'media'].includes(source.kind);
  const priorityLevel: Intelligence['priorityLevel'] = background ? 'P2' : (urgentSecurity || urgentChange) && ageDays <= 14 && authoritative && source.contentType !== 'video' ? 'P0' : operational ? 'P1' : 'P2';
  let recommendedAction = '';
  if (priorityLevel === 'P0' && urgentSecurity) recommendedAction = '影響を受ける構成と適用済み対策を今日中に確認する';
  else if (priorityLevel === 'P0' && /(deprecat|end.of.life|sunset|廃止|提供終了)/i.test(text)) recommendedAction = '利用中のバージョンと移行期限を今日中に確認する';
  else if (priorityLevel === 'P0') recommendedAction = '対象範囲と期限を確認し、必要なら対応チケットを起票する';
  else if (topicLayers.includes('Identity')) recommendedAction = '今週、権限設計と認証フローを検証する';
  else if (topicLayers.includes('Observability')) recommendedAction = '今週、既存の監視項目との不足を確認する';
  else if (topicLayers.includes('Cost')) recommendedAction = '今週、現行利用量で費用の基準値を試算する';
  else if (topicLayers.includes('Integration')) recommendedAction = '今週、対象コネクターを検証環境で接続する';
  else if (topicLayers.includes('Evaluation')) recommendedAction = '今週の評価計画に判定基準を追加する';
  else if (priorityLevel === 'P1') recommendedAction = '今週の検証候補に追加し、自社環境で成立条件を確かめる';

  const relevanceScore = Math.min(100, item.fdeScore);
  const actionabilityScore = priorityLevel === 'P0' ? 95 : priorityLevel === 'P1' ? 75 : 30;
  const authorityScore = Math.min(100, source.weight);
  const noveltyScore = ageDays <= 7 ? 95 : ageDays <= 30 ? 75 : 45;
  const clientFitScore = background ? 35 : CUSTOMER_PATTERN.test(text) || operational ? 80 : 55;
  const priorityScore = Math.round(relevanceScore * .25 + actionabilityScore * .3 + authorityScore * .2 + noveltyScore * .1 + clientFitScore * .15);
  const japanLens = source.country !== 'JP' ? ''
    : source.kind === 'government' ? (/(regulat|policy|規制|指針|ガイドライン)/i.test(text) ? 'Regulation' : 'Government')
      : source.kind === 'community' || source.kind === 'careers' ? 'Engineering Community'
        : CUSTOMER_PATTERN.test(text) ? 'Case Study' : 'Enterprise';
  return {
    corePillar, japanLens, topicLayers, affectedStack, priorityLevel, recommendedAction,
    evidence: priorityLevel === 'P0'
      ? '公式情報の緊急性キーワードと公開時刻に基づく自動判定'
      : priorityLevel === 'P1' ? '本番導入・運用パターンとの一致に基づく自動判定' : '背景理解・中長期学習向けとして自動分類',
    relevanceScore, actionabilityScore, authorityScore, noveltyScore, clientFitScore, priorityScore,
    timeConfidence: source.fetchMode === 'api' || source.fetchMode === 'rss' ? .9 : .55
  };
}

function scoreFde100(source: SourceRecord, title: string, value: string): number {
  let score = Math.round(source.weight * 0.2);
  if (AI_PATTERN.test(value)) score += 12;
  if (ROLE_PATTERN.test(value) || /\b(FDE|FDSE)\b/i.test(value)) score += 32;
  if (CUSTOMER_PATTERN.test(value)) score += 11;
  if (DELIVERY_PATTERN.test(value)) score += 12;
  if (QUALITY_PATTERN.test(value)) score += 10;
  if (BUILD_PATTERN.test(value)) score += 8;
  if (GOVERN_PATTERN.test(value)) score += 8;
  if (ORG_PATTERN.test(value)) score += 10;
  if (/^how .+ (uses|builds|deploys|adopts|scales)/i.test(title)) score += 10;
  if (source.country === 'JP') score += 5;
  if (source.kind === 'careers') score += 18;
  if (source.kind === 'government' && AI_PATTERN.test(value)) score += 8;
  if (source.kind === 'report') score += 25;
  if (source.kind === 'research' && /(agent|rag|retrieval|evaluation|security|software engineering)/i.test(value)) score += 15;
  return Math.min(100, score);
}

function inferPillar(source: SourceRecord, value: string): FdePillar {
  if (source.country === 'JP') return 'Japan';
  if (ORG_PATTERN.test(value) || source.kind === 'careers') return 'Organization';
  if (GOVERN_PATTERN.test(value)) return 'Govern';
  if (DEPLOY_PATTERN.test(value)) return 'Deploy';
  if (CUSTOMER_PATTERN.test(value)) return 'Customer';
  if (BUILD_PATTERN.test(value)) return 'Build';
  return source.defaultPillar;
}

function inferSubtopic(pillar: FdePillar, value: string): string {
  if (pillar === 'Customer') {
    if (/\broi\b|return on investment|効果|費用対効果/i.test(value)) return 'ROI';
    if (/business process|workflow|業務プロセス|業務/i.test(value)) return 'Business Process';
    return 'Use Case';
  }
  if (pillar === 'Build') {
    if (/\brag\b|retrieval|enterprise search|検索/i.test(value)) return 'RAG / Enterprise Search';
    if (/coding|codex|software engineering|コード|開発/i.test(value)) return 'Coding';
    if (/connector|integration|mcp|連携/i.test(value)) return 'Integration';
    if (/legacy|modernization|レガシー/i.test(value)) return 'Legacy';
    return 'Agent';
  }
  if (pillar === 'Deploy') {
    if (/identity|permission|auth|権限|認証/i.test(value)) return 'Identity';
    if (/observability|monitor|監視/i.test(value)) return 'Observability';
    if (/on.?prem|オンプレ/i.test(value)) return 'On-prem';
    if (/data|database|データ/i.test(value)) return 'Data';
    return 'Cloud / Production';
  }
  if (pillar === 'Govern') {
    if (/evaluation|evals|評価|品質/i.test(value)) return 'Evaluation';
    if (/privacy|プライバシー/i.test(value)) return 'Privacy';
    if (/regulat|policy|law|規制|指針|ガイドライン/i.test(value)) return 'Regulation';
    return 'Security';
  }
  if (pillar === 'Organization') {
    if (/coe|center of excellence/i.test(value)) return 'AI CoE';
    if (/change management|transformation|変革/i.test(value)) return 'Change Management';
    if (/ai.native|AIネイティブ/i.test(value)) return 'AI-native';
    return 'FDE Philosophy / Role';
  }
  if (sourceTextIsGovernment(value)) return 'Government / Regulation';
  if (/case stud|customer|導入事例|活用事例/i.test(value)) return 'Case Study';
  if (GOVERN_PATTERN.test(value)) return 'Regulation / Security';
  return 'Enterprise / Engineering';
}

function sourceTextIsGovernment(value: string): boolean {
  return /(government|public sector|デジタル庁|経済産業省|総務省|行政|政府|IPA)/i.test(value);
}

function makeSummaryJa(source: SourceRecord, item: DiscoveredItem, pillar: FdePillar, subtopic: string): string {
  if (/[ぁ-んァ-ヶ一-龠]/u.test(item.summary) && item.summary.length >= 40) return item.summary.slice(0, 320);
  const type = contentTypeLabel(source.contentType);
  return `${source.name}が公開した${type}です。「${item.title}」を通じて、${pillar}領域の${subtopic}に関する変化を確認できます。`;
}

function makeSummaryZh(source: SourceRecord, item: DiscoveredItem, pillar: FdePillar, subtopic: string): string {
  return `${source.name}发布的${contentTypeLabelZh(source.contentType)}，主题为“${item.title}”，涉及 FDE ${pillar} 环节的 ${subtopic}。`;
}

function contentTypeLabel(type: ContentType): string {
  return ({ news: 'ニュース', blog: '技術記事', video: '動画', paper: '論文', report: 'レポート', release: 'リリース情報', 'case-study': '導入事例', career: '採用情報' })[type];
}

function contentTypeLabelZh(type: ContentType): string {
  return ({ news: '新闻', blog: '技术文章', video: '视频', paper: '论文', report: '报告', release: '更新说明', 'case-study': '落地案例', career: '招聘信息' })[type];
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

function inferImpactTags(source: SourceRecord, item: DiscoveredItem): {
  relevance: string[];
  business: string[];
  engineering: string[];
} {
  const pillar = item.pillar ?? source.defaultPillar;
  const value = `${item.title} ${item.summary} ${item.tags.join(' ')} ${item.subtopic ?? ''}`;
  const relevanceByPillar: Record<FdePillar, string> = {
    Customer: '顧客課題',
    Build: '実装手法',
    Deploy: '本番導入',
    Govern: 'リスク管理',
    Organization: '組織・人材',
    Japan: '日本市場'
  };
  const business: string[] = [];
  const engineering: string[] = [];
  const add = (target: string[], label: string, pattern: RegExp) => {
    if (pattern.test(value) && !target.includes(label)) target.push(label);
  };

  add(business, 'コスト・ROI', /\broi\b|return on investment|cost|cost-saving|費用|コスト|投資対効果/i);
  add(business, '業務効率', /workflow|automation|productivity|efficien|業務|自動化|生産性|効率/i);
  add(business, '顧客体験・売上', /customer experience|revenue|sales|conversion|顧客体験|売上|販売/i);
  add(business, 'リスク低減', /risk|security|privacy|safety|guardrail|リスク|セキュリティ|安全|プライバシー/i);
  add(business, '規制対応', /regulat|compliance|policy|law|governance|規制|法令|コンプライアンス|ガバナンス/i);
  add(business, '組織・人材', /career|hiring|talent|organization|change management|採用|人材|組織|教育/i);
  add(business, '導入判断', /deploy|production|adoption|implementation|導入|本番|実装/i);

  add(engineering, 'RAG・検索', /\brag\b|retrieval|enterprise search|検索/i);
  add(engineering, 'AIエージェント', /\bagent(?:ic|s)?\b|エージェント/i);
  add(engineering, '評価・品質', /evaluation|evals?|benchmark|quality|testing|評価|品質|テスト/i);
  add(engineering, 'セキュリティ', /security|prompt injection|guardrail|attack|セキュリティ|攻撃/i);
  add(engineering, '本番基盤', /deploy|production|cloud|infrastructure|本番|クラウド|基盤/i);
  add(engineering, '監視・運用', /observability|monitor|operation|incident|監視|運用|障害/i);
  add(engineering, '認証・権限', /identity|auth|permission|access control|認証|権限|アクセス制御/i);
  add(engineering, 'システム連携', /integration|connector|\bmcp\b|api|連携|コネクタ/i);
  add(engineering, 'データ基盤', /database|data platform|data pipeline|データベース|データ基盤/i);
  add(engineering, '開発支援', /coding|software engineering|developer|コード|開発/i);

  return {
    relevance: [relevanceByPillar[pillar], item.subtopic].filter((label): label is string => Boolean(label)).slice(0, 2),
    business: business.slice(0, 3),
    engineering: engineering.slice(0, 3)
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
  await env.DB.prepare('DELETE FROM auth_challenges WHERE expires_at <= CURRENT_TIMESTAMP').run().catch(() => undefined);
  await env.DB.prepare('DELETE FROM user_sessions WHERE expires_at <= CURRENT_TIMESTAMP').run().catch(() => undefined);
  await syncSourceRegistry(env);
  const sources = await readSources(env);
  if (!sources.length) return;
  await env.INGEST_QUEUE.sendBatch(sources.map((source) => ({ body: { sourceIds: [source.id], reason: 'scheduled' as const } })));
  await env.CACHE.put('ingest:last-dispatch', new Date().toISOString(), { expirationTtl: 172800 });
}

function isAuthorized(request: Request, env: Env): boolean {
  if (!env.INGEST_TOKEN) return true;
  return request.headers.get('authorization') === `Bearer ${env.INGEST_TOKEN}`;
}

type SessionIdentity = { sessionId: string; userId: string; displayName: string };

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try { return new URL(origin).host === new URL(request.url).host; } catch { return false; }
}

async function allowAuthAttempt(env: Env, request: Request, action: string): Promise<boolean> {
  const ip = request.headers.get('cf-connecting-ip') ?? 'local';
  const key = `auth-rate:${await sha256(`${ip}:${action}`)}`;
  const count = Number(await env.CACHE.get(key) ?? '0');
  if (count >= 10) return false;
  await env.CACHE.put(key, String(count + 1), { expirationTtl: 600 });
  return true;
}

function randomBase64(bytes: number): string {
  const value = crypto.getRandomValues(new Uint8Array(bytes));
  return bytesToBase64(value);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function relyingParty(request: Request): { rpID: string; origin: string } {
  const url = new URL(request.url);
  return { rpID: url.hostname, origin: url.origin };
}

async function createSession(env: Env, userId: string, userAgent: string): Promise<{ token: string }> {
  const token = randomBase64(32).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString();
  await env.DB.prepare(
    'INSERT INTO user_sessions (id, user_id, token_hash, expires_at, user_agent) VALUES (?, ?, ?, ?, ?)'
  ).bind(crypto.randomUUID(), userId, await sha256(token), expiresAt, userAgent.slice(0, 240)).run();
  return { token };
}

function setSessionCookie(c: Parameters<typeof setCookie>[0], token: string): void {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true, secure: true, sameSite: 'Lax', path: '/', maxAge: SESSION_DAYS * 86_400
  });
}

async function readSession(env: Env, token?: string): Promise<SessionIdentity | null> {
  if (!token) return null;
  const session = await env.DB.prepare(
    `SELECT s.id AS session_id, u.id AS user_id, u.display_name
     FROM user_sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > CURRENT_TIMESTAMP`
  ).bind(await sha256(token)).first<{ session_id: string; user_id: string; display_name: string }>();
  if (!session) return null;
  await env.DB.prepare('UPDATE user_sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?').bind(session.session_id).run();
  return { sessionId: session.session_id, userId: session.user_id, displayName: session.display_name };
}

function normalizeBackfillSince(value?: string): string | undefined {
  const raw = value?.trim() || '2026-06-01';
  const timestamp = Date.parse(`${raw.slice(0, 10)}T00:00:00+09:00`);
  const minimum = Date.parse('2026-06-01T00:00:00+09:00');
  if (!Number.isFinite(timestamp) || timestamp < minimum || timestamp > Date.now()) return undefined;
  return new Date(timestamp).toISOString();
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

function dateFromTitle(value: string): string | undefined {
  const match = value.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+20\d{2}\b/i);
  if (!match) return undefined;
  const timestamp = Date.parse(match[0]);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
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
      const mode = message.body.reason ?? 'scheduled';
      const sources = await readSources(env, message.body.sourceIds, mode !== 'scheduled');
      const failures: string[] = [];
      for (const source of sources) {
        try {
          await ingestSource(env, source, { mode, since: message.body.since, page: message.body.page });
        }
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
