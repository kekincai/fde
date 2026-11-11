/// <reference types="@cloudflare/workers-types" />

import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransport,
  type RegistrationResponseJSON
} from '@simplewebauthn/server';
import { Hono } from 'hono';
import { cache } from 'hono/cache';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import postgres from 'postgres';

import { articleOrderBy, normalizeArticleSort } from './articleSort';
import { chapterDefinitions, inferChapter } from './chapters';
import {
  DAILY_DIGEST_CRON,
  INGEST_DISPATCH_CRON,
  INGEST_HEALTH_CRON,
  monitorIngestionHealth,
  sendConfigurationTest,
  sendDailyDigest
} from './emailNotifications';
import {
  FETCH_USER_AGENT,
  ingestFailureKind,
  isDeferredYoutubeFeedFailure,
  isYoutubeFeedSource,
  shouldRetryYoutubeFeedFailure,
  sourceBackoffSeconds,
  willRetryInQueue,
  QUEUE_MAX_RETRIES,
  youtubeFeedRetryUrl
} from './fetchPolicy';
import { BodyTooLargeError, consumeRequestLimit, hasConfiguredBearerToken, isPublicAnalyticsEvent, readLimitedText } from './securityControls';
import { chaptersFor, collectionStreamFor, sourceRegistry, type ContentType, type FdePillar, type SourceKind, type SourceRecord } from './sourceRegistry';
import { evaluateCandidate, isBeforePublicBaseline, PUBLIC_BASELINE, reviewWithWorkersAI, SEMANTIC_MODEL, type SemanticDecision } from './intelligence';
import {
  AI_PATTERN, BUILD_PATTERN, CUSTOMER_PATTERN, DELIVERY_PATTERN, DEPLOY_PATTERN,
  GOVERN_PATTERN, ORG_PATTERN, QUALITY_PATTERN, ROLE_PATTERN
} from './vocabulary';
import {
  cleanText, compactTags, parseApiResponse, parseHtmlResponse, parseRssResponse, parseYoutubeHtmlResponse,
  type CorePillar, type DiscoveredItem
} from './parsers';

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
  /** True when the Queue will deliver this run again; the failure is then recorded by the last attempt only. */
  willRetry?: (failure: FetchFailure) => boolean;
};

type Env = {
  ASSETS: Fetcher;
  DB: D1Database;
  HYPERDRIVE?: Hyperdrive;
  ARCHIVE?: R2Bucket;
  CACHE: KVNamespace;
  INGEST_QUEUE: Queue<IngestMessage>;
  AI: Ai;
  INGEST_TOKEN?: string;
  EMAIL_TEST_TOKEN?: string;
  RESEND_API_KEY?: string;
  RESEND_TO?: string;
  RESEND_FROM?: string;
  CF_VERSION_METADATA?: WorkerVersionMetadata;
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


type FetchMeta = {
  mode: SourceRecord['fetchMode'];
  /** Fetched from the source's first surface (the one the stored validators belong to). */
  primary: boolean;
  etag?: string | null;
  lastModified?: string | null;
  notModified?: boolean;
};

type FetchFailure = Error & { status?: number; retryAfterSeconds?: number };

const MAX_BODY_BYTES = 6_000_000;
const MAX_ANALYTICS_BODY_BYTES = 4_096;
const SESSION_COOKIE = 'fde_session';
const SESSION_DAYS = 30;
const app = new Hono<{ Bindings: Env }>();

/** What the public paper shows. Every public read (list, single, overview, coverage, digest, bookmarks) uses it. */
const VISIBLE = "status = 'published' AND fde_score >= 40";
const VISIBLE_A = "a.status = 'published' AND a.fde_score >= 40";

/** Edge cache for public, cookie-free reads; the TTL comes from each response's s-maxage. */
const edgeCache = cache({ cacheName: 'fde-public-api', wait: false, onCacheNotAvailable: false });

app.get('/api/health', (c) => c.json({
  ok: true,
  service: 'fde-radar',
  // Set by Cloudflare for each deployed Worker version (wrangler.toml [version_metadata]).
  version: c.env.CF_VERSION_METADATA?.id ?? 'local',
  deployedAt: c.env.CF_VERSION_METADATA?.timestamp ?? null,
  architecture: 'Astro + Hono + Workers + Workers AI + D1/FTS5 + Hyperdrive/PostgreSQL + KV + Queues',
  time: new Date().toISOString()
}));


app.get('/api/articles', edgeCache, async (c) => {
  const query = c.req.query('q')?.trim() ?? '';
  const region = c.req.query('region') ?? 'ALL';
  const pillar = c.req.query('pillar') ?? 'すべて';
  const priority = c.req.query('priority') ?? 'ALL';
  const topicLayer = c.req.query('layer')?.trim() ?? '';
  const chapter = c.req.query('chapter')?.trim() ?? '';
  const channel = c.req.query('channel') ?? 'action';
  const sort = normalizeArticleSort(c.req.query('sort'));
  const page = Math.max(Number(c.req.query('page') ?? 1) || 1, 1);
  const pageSize = Math.min(Math.max(Number(c.req.query('pageSize') ?? 10) || 10, 1), 25);
  try {
    const clauses = [VISIBLE_A];
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
    if (chapter) { clauses.push('a.chapter_id = ?'); values.push(chapter); }
    if (!chapter && channel === 'research') clauses.push("a.content_type IN ('paper', 'report')");
    if (!chapter && channel === 'career') clauses.push("a.content_type = 'career'");
    if (!chapter && channel === 'action') clauses.push("a.content_type NOT IN ('paper', 'report', 'career')");
    const searchQuery = query ? buildFtsQuery(query) : '';
    const from = searchQuery
      ? 'articles_fts f JOIN articles a ON a.id = f.article_id JOIN sources s ON s.id = a.source_id'
      : 'articles a JOIN sources s ON s.id = a.source_id';
    if (searchQuery) {
      clauses.unshift('articles_fts MATCH ?');
      values.unshift(searchQuery);
    }
    const countValues = [...values];
    const [count, result] = await Promise.all([
      c.env.DB.prepare(
        `SELECT COUNT(*) AS total FROM ${from} WHERE ${clauses.join(' AND ')}`
      ).bind(...countValues).first<{ total: number }>(),
      c.env.DB.prepare(
      `SELECT a.*, s.name AS source_name, s.source_kind
       FROM ${from}
       WHERE ${clauses.join(' AND ')}
       ORDER BY ${articleOrderBy(sort)} LIMIT ? OFFSET ?`
      ).bind(...values, pageSize, (page - 1) * pageSize).all()
    ]);
    const total = Number(count?.total ?? 0);
    return c.json({
      articles: result.results,
      pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) }
    }, 200, {
      'Cache-Control': 'public, max-age=30, s-maxage=300'
    });
  } catch (error) {
    return c.json({ articles: [], error: errorMessage(error) }, 503);
  }
});

// One article for direct 二面 links (`/?a=<id>`). Same visibility rules as the list.
app.get('/api/articles/:articleId', edgeCache, async (c) => {
  const id = c.req.param('articleId');
  if (!/^[A-Za-z0-9-]{1,64}$/.test(id)) return c.json({ article: null, error: 'invalid id' }, 400);
  try {
    const article = await c.env.DB.prepare(
      `SELECT a.*, s.name AS source_name, s.source_kind
       FROM articles a JOIN sources s ON s.id = a.source_id
       WHERE a.id = ? AND ${VISIBLE_A}`
    ).bind(id).first();
    if (!article) return c.json({ article: null }, 404, { 'Cache-Control': 'public, max-age=30' });
    return c.json({ article }, 200, { 'Cache-Control': 'public, max-age=60, s-maxage=300' });
  } catch (error) {
    return c.json({ article: null, error: errorMessage(error) }, 503);
  }
});

app.get('/api/overview', edgeCache, async (c) => {
  try {
    const [counts, sources, latest] = await Promise.all([
      c.env.DB.prepare(
        `SELECT COUNT(*) AS total,
          SUM(CASE WHEN region = 'Japan' THEN 1 ELSE 0 END) AS japan,
          SUM(CASE WHEN priority_level = 'P0' AND content_type NOT IN ('paper', 'report', 'career') THEN 1 ELSE 0 END) AS p0,
          SUM(CASE WHEN priority_level = 'P1' AND content_type NOT IN ('paper', 'report', 'career') THEN 1 ELSE 0 END) AS p1,
          SUM(CASE WHEN priority_level = 'P2' AND content_type NOT IN ('paper', 'report', 'career') THEN 1 ELSE 0 END) AS p2
         FROM articles WHERE ${VISIBLE}`
      ).first(),
      c.env.DB.prepare(
        `SELECT id, name FROM sources WHERE allowed_fetch = 1 ORDER BY priority DESC`
      ).all(),
      // The last successful collection run, whether or not it found anything new. This is what
      // 「最終収集」 and the 朝刊/夕刊 edition mean.
      c.env.DB.prepare(
        `SELECT MAX(last_success_at) AS last_ingested_at FROM sources WHERE allowed_fetch = 1`
      ).first()
    ]);
    return c.json({ counts, sources: sources.results, ...latest }, 200, {
      'Cache-Control': 'public, max-age=15, s-maxage=60'
    });
  } catch (error) {
    return c.json({ counts: { total: 0, japan: 0, p0: 0, p1: 0, p2: 0 }, sources: [], last_ingested_at: null, error: errorMessage(error) }, 503);
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
  if (!await allowAuthAttempt(c.env, c.req.raw, 'register-verify')) return c.json({ error: '試行回数が多すぎます。しばらく待ってからお試しください。' }, 429);
  const payload = await c.req.json().catch(() => ({})) as { flowId?: string; response?: RegistrationResponseJSON };
  if (!payload.flowId || !payload.response) return c.json({ error: '登録情報が不足しています。' }, 400);
  const state = await c.env.DB.prepare(
    `SELECT challenge, user_id, display_name, webauthn_user_id FROM auth_challenges
     WHERE id = ? AND kind = 'register' AND julianday(expires_at) > julianday('now')`
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
      ).bind(credential.id, state.user_id, credential.publicKey.slice().buffer, credential.counter, JSON.stringify(credential.transports ?? []), credentialDeviceType, credentialBackedUp ? 1 : 0),
      c.env.DB.prepare('DELETE FROM auth_challenges WHERE id = ?').bind(payload.flowId)
    ]);
    const session = await createSession(c.env, state.user_id, c.req.header('user-agent') ?? '');
    setSessionCookie(c, session.token);
    return c.json({ user: { id: state.user_id, displayName: state.display_name, isAdmin: false }, bookmarkIds: [] }, 201);
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
  if (!await allowAuthAttempt(c.env, c.req.raw, 'login-verify')) return c.json({ error: '試行回数が多すぎます。しばらく待ってからお試しください。' }, 429);
  const payload = await c.req.json().catch(() => ({})) as { flowId?: string; response?: AuthenticationResponseJSON };
  if (!payload.flowId || !payload.response) return c.json({ error: 'ログイン情報が不足しています。' }, 400);
  const challengeRow = await c.env.DB.prepare(
    `SELECT challenge FROM auth_challenges WHERE id = ? AND kind = 'login' AND julianday(expires_at) > julianday('now')`
  ).bind(payload.flowId).first<{ challenge: string }>();
  if (!challengeRow) return c.json({ error: 'ログインの有効時間が切れました。もう一度お試しください。' }, 400);
  const credential = await c.env.DB.prepare(
    `SELECT p.id, p.user_id, p.public_key, p.counter, p.transports, u.display_name, u.role
     FROM passkey_credentials p JOIN users u ON u.id = p.user_id WHERE p.id = ?`
  ).bind(payload.response.id).first<{ id: string; user_id: string; public_key: ArrayBuffer; counter: number; transports: string; display_name: string; role: string }>();
  if (!credential) return c.json({ error: 'このパスキーは登録されていません。' }, 401);
  const { rpID, origin } = relyingParty(c.req.raw);
  try {
    const verification = await verifyAuthenticationResponse({
      response: payload.response, expectedChallenge: challengeRow.challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true,
      credential: { id: credential.id, publicKey: new Uint8Array(credential.public_key), counter: credential.counter, transports: JSON.parse(credential.transports) as AuthenticatorTransport[] }
    });
    if (!verification.verified) return c.json({ error: 'パスキーを確認できませんでした。' }, 401);
    await c.env.DB.prepare('UPDATE passkey_credentials SET counter = ?, last_used_at = CURRENT_TIMESTAMP WHERE id = ?').bind(verification.authenticationInfo.newCounter, credential.id).run();
    await c.env.DB.prepare('DELETE FROM auth_challenges WHERE id = ?').bind(payload.flowId).run();
    const session = await createSession(c.env, credential.user_id, c.req.header('user-agent') ?? '');
    setSessionCookie(c, session.token);
    const bookmarks = await c.env.DB.prepare('SELECT article_id FROM user_bookmarks WHERE user_id = ?').bind(credential.user_id).all<{ article_id: string }>();
    return c.json({ user: { id: credential.user_id, displayName: credential.display_name, isAdmin: credential.role === 'admin' }, bookmarkIds: bookmarks.results.map((row) => row.article_id) });
  } catch (error) { return c.json({ error: `ログインできませんでした。${errorMessage(error)}` }, 401); }
});

app.get('/api/auth/me', async (c) => {
  const session = await readSession(c.env, getCookie(c, SESSION_COOKIE));
  if (!session) return c.json({ user: null, bookmarkIds: [] });
  const bookmarks = await c.env.DB.prepare('SELECT article_id FROM user_bookmarks WHERE user_id = ? ORDER BY created_at DESC').bind(session.userId).all<{ article_id: string }>();
  return c.json({ user: { id: session.userId, displayName: session.displayName, isAdmin: session.isAdmin }, bookmarkIds: bookmarks.results.map((row) => row.article_id) });
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
     FROM user_sessions WHERE user_id = ? AND julianday(expires_at) > julianday('now')
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
  const page = Math.max(Number(c.req.query('page') ?? 1) || 1, 1);
  const pageSize = Math.min(Math.max(Number(c.req.query('pageSize') ?? 10) || 10, 1), 25);
  const query = c.req.query('q')?.trim() ?? '';
  // Saved articles that were later suppressed or archived drop out, like everywhere else.
  const clauses = ['b.user_id = ?', VISIBLE_A];
  const values: Array<string | number> = [session.userId];
  const region = c.req.query('region') ?? 'ALL';
  const pillar = c.req.query('pillar') ?? 'すべて';
  const priority = c.req.query('priority') ?? 'ALL';
  const topicLayer = c.req.query('layer')?.trim() ?? '';
  const chapter = c.req.query('chapter')?.trim() ?? '';
  const sort = normalizeArticleSort(c.req.query('sort'));
  if (region !== 'ALL') { clauses.push('a.region = ?'); values.push(region); }
  if (pillar !== 'すべて') { clauses.push('a.core_pillar = ?'); values.push(pillar); }
  if (priority !== 'ALL') { clauses.push('a.priority_level = ?'); values.push(priority); }
  if (topicLayer) { clauses.push('EXISTS (SELECT 1 FROM json_each(a.topic_layers) WHERE value = ?)'); values.push(topicLayer); }
  if (chapter) { clauses.push('a.chapter_id = ?'); values.push(chapter); }
  const searchQuery = query ? buildFtsQuery(query) : '';
  const from = searchQuery
    ? 'user_bookmarks b JOIN articles_fts f ON f.article_id = b.article_id JOIN articles a ON a.id = b.article_id JOIN sources s ON s.id = a.source_id'
    : 'user_bookmarks b JOIN articles a ON a.id = b.article_id JOIN sources s ON s.id = a.source_id';
  if (searchQuery) { clauses.unshift('articles_fts MATCH ?'); values.unshift(searchQuery); }
  const [count, rows] = await Promise.all([
    c.env.DB.prepare(`SELECT COUNT(*) AS total FROM ${from} WHERE ${clauses.join(' AND ')}`).bind(...values).first<{ total: number }>(),
    c.env.DB.prepare(
      `SELECT a.*, s.name AS source_name, s.source_kind
       FROM ${from} WHERE ${clauses.join(' AND ')}
       ORDER BY ${articleOrderBy(sort)} LIMIT ? OFFSET ?`
    ).bind(...values, pageSize, (page - 1) * pageSize).all()
  ]);
  const total = Number(count?.total ?? 0);
  return c.json({ articles: rows.results, pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } });
});

app.put('/api/bookmarks/:articleId', async (c) => {
  if (!sameOrigin(c.req.raw)) return c.json({ error: '不正なリクエストです。' }, 403);
  const session = await readSession(c.env, getCookie(c, SESSION_COOKIE));
  if (!session) return c.json({ error: 'ログインが必要です。' }, 401);
  const articleId = c.req.param('articleId');
  const exists = await c.env.DB.prepare(`SELECT id FROM articles WHERE id = ? AND ${VISIBLE}`).bind(articleId).first();
  if (!exists) return c.json({ error: '記事が見つかりません。' }, 404);
  const inserted = await c.env.DB.prepare('INSERT OR IGNORE INTO user_bookmarks (user_id, article_id) VALUES (?, ?)')
    .bind(session.userId, articleId).run();
  if (inserted.meta.changes) await c.env.DB.prepare(
    "INSERT INTO analytics_events (id, event_name, user_id, article_id, section) VALUES (?, 'bookmark_save', ?, ?, 'saved')"
  ).bind(crypto.randomUUID(), session.userId, articleId).run();
  return c.json({ saved: true });
});

app.delete('/api/bookmarks/:articleId', async (c) => {
  if (!sameOrigin(c.req.raw)) return c.json({ error: '不正なリクエストです。' }, 403);
  const session = await readSession(c.env, getCookie(c, SESSION_COOKIE));
  if (!session) return c.json({ error: 'ログインが必要です。' }, 401);
  const articleId = c.req.param('articleId');
  const deleted = await c.env.DB.prepare('DELETE FROM user_bookmarks WHERE user_id = ? AND article_id = ?')
    .bind(session.userId, articleId).run();
  if (deleted.meta.changes) await c.env.DB.prepare(
    "INSERT INTO analytics_events (id, event_name, user_id, article_id, section) VALUES (?, 'bookmark_remove', ?, ?, 'saved')"
  ).bind(crypto.randomUUID(), session.userId, articleId).run();
  return c.json({ saved: false });
});


app.post('/api/analytics/events', async (c) => {
  if (!sameOrigin(c.req.raw)) return c.json({ ok: false }, 403);
  let payload: {
    eventName?: string; visitorId?: string; sessionId?: string; articleId?: string; section?: string; deviceType?: string; referrerHost?: string;
  };
  try {
    const parsed: unknown = JSON.parse(await readLimitedText(c.req.raw, MAX_ANALYTICS_BODY_BYTES));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return c.json({ ok: false }, 400);
    payload = parsed;
  } catch (error) {
    return c.json({ ok: false }, error instanceof BodyTooLargeError ? 413 : 400);
  }
  const allowedSections = new Set(['about', 'action', 'japan', 'research', 'saved', 'admin']);
  const allowedDevices = new Set(['desktop', 'tablet', 'mobile']);
  if (!isPublicAnalyticsEvent(payload.eventName)) return c.json({ ok: false }, 400);
  const section = allowedSections.has(payload.section ?? '') ? payload.section! : '';
  const deviceType = allowedDevices.has(payload.deviceType ?? '') ? payload.deviceType! : 'desktop';
  const visitorId = cleanText(payload.visitorId ?? '').slice(0, 80);
  const sessionId = cleanText(payload.sessionId ?? '').slice(0, 80);
  const rawReferrer = cleanText(payload.referrerHost ?? '').toLowerCase().slice(0, 120);
  const referrerHost = /^(direct|self|[a-z0-9.-]+)$/.test(rawReferrer) ? rawReferrer : '';
  const articleId = cleanText(payload.articleId ?? '').slice(0, 80) || null;
  const ip = c.req.header('cf-connecting-ip') ?? 'local';
  if (!await consumeRequestLimit(c.env.DB, await sha256(`${ip}:analytics`), 120, 600)) return c.json({ ok: false }, 429);
  const session = await readSession(c.env, getCookie(c, SESSION_COOKIE));
  try {
    const metadata = JSON.stringify({
      sessionIdHash: sessionId ? await sha256(sessionId) : '',
      referrerHost: payload.eventName === 'page_view' ? referrerHost : ''
    });
    await c.env.DB.prepare(
      `INSERT INTO analytics_events
       (id, event_name, user_id, anonymous_id_hash, article_id, section, device_type, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(crypto.randomUUID(), payload.eventName, session?.userId ?? null, visitorId ? await sha256(visitorId) : '', articleId, section, deviceType, metadata).run();
    return c.json({ ok: true });
  } catch {
    return c.json({ ok: false }, 400);
  }
});

app.get('/api/admin/analytics', async (c) => {
  const session = await readSession(c.env, getCookie(c, SESSION_COOKIE));
  if (!session) return c.json({ error: 'ログインが必要です。' }, 401);
  if (!session.isAdmin) return c.json({ error: '管理者権限が必要です。' }, 403);
  const requestedDays = Number(c.req.query('days') ?? 30);
  const days = [7, 30, 90].includes(requestedDays) ? requestedDays : 30;
  const currentStart = `-${days - 1} days`;
  const previousStart = `-${days * 2 - 1} days`;
  try {
    const [metrics, users, trend, popularArticles, sections, devices, referrers, timeBands, ingest, inventory, sourceHealth] = await Promise.all([
      c.env.DB.prepare(
        `WITH bounds AS (
           SELECT datetime('now', ?, 'start of day', '-9 hours') AS current_start,
                  datetime('now', ?, 'start of day', '-9 hours') AS previous_start
         )
         SELECT
          SUM(CASE WHEN occurred_at >= current_start AND event_name = 'page_view' THEN 1 ELSE 0 END) AS page_views,
          SUM(CASE WHEN occurred_at >= current_start AND event_name = 'article_open' THEN 1 ELSE 0 END) AS article_opens,
          SUM(CASE WHEN occurred_at >= current_start AND event_name = 'source_click' THEN 1 ELSE 0 END) AS source_clicks,
          COUNT(DISTINCT CASE WHEN occurred_at >= current_start THEN CASE WHEN user_id IS NOT NULL THEN user_id ELSE anonymous_id_hash END END) AS visitors,
          SUM(CASE WHEN occurred_at < current_start AND event_name = 'page_view' THEN 1 ELSE 0 END) AS previous_page_views,
          COUNT(DISTINCT CASE WHEN occurred_at < current_start THEN CASE WHEN user_id IS NOT NULL THEN user_id ELSE anonymous_id_hash END END) AS previous_visitors,
          MAX(CASE WHEN occurred_at >= current_start THEN occurred_at END) AS last_event_at
         FROM analytics_events, bounds WHERE occurred_at >= previous_start`
      ).bind(currentStart, previousStart).first(),
      c.env.DB.prepare(
        `SELECT COUNT(*) AS total_users,
          SUM(CASE WHEN created_at >= datetime('now', ?, 'start of day', '-9 hours') THEN 1 ELSE 0 END) AS new_users
         FROM users`
      ).bind(currentStart).first(),
      c.env.DB.prepare(
        `WITH RECURSIVE dates(day) AS (
           SELECT date('now', '+9 hours', ?)
           UNION ALL SELECT date(day, '+1 day') FROM dates WHERE day < date('now', '+9 hours')
         ), daily AS (
           SELECT date(occurred_at, '+9 hours') AS day,
             SUM(event_name = 'page_view') AS page_views,
             SUM(event_name = 'article_open') AS article_opens,
             SUM(event_name = 'source_click') AS source_clicks,
             COUNT(DISTINCT CASE WHEN user_id IS NOT NULL THEN user_id ELSE anonymous_id_hash END) AS visitors
           FROM analytics_events WHERE occurred_at >= datetime('now', ?, 'start of day', '-9 hours')
           GROUP BY date(occurred_at, '+9 hours')
         )
         SELECT dates.day, COALESCE(page_views, 0) AS page_views,
           COALESCE(article_opens, 0) AS article_opens, COALESCE(source_clicks, 0) AS source_clicks,
           COALESCE(visitors, 0) AS visitors
         FROM dates LEFT JOIN daily USING(day) ORDER BY dates.day`
      ).bind(currentStart, currentStart).all(),
      c.env.DB.prepare(
        `SELECT a.id, a.title, s.name AS source_name,
          SUM(CASE WHEN e.event_name = 'article_open' THEN 1 ELSE 0 END) AS opens,
          SUM(CASE WHEN e.event_name = 'source_click' THEN 1 ELSE 0 END) AS source_clicks,
          SUM(CASE WHEN e.event_name = 'bookmark_save' THEN 1 ELSE 0 END) AS saves,
          COUNT(DISTINCT CASE WHEN e.user_id IS NOT NULL THEN e.user_id ELSE e.anonymous_id_hash END) AS readers
         FROM analytics_events e JOIN articles a ON a.id = e.article_id JOIN sources s ON s.id = a.source_id
         WHERE e.occurred_at >= datetime('now', ?, 'start of day', '-9 hours')
         GROUP BY a.id, a.title, s.name ORDER BY (opens + source_clicks + saves) DESC LIMIT 8`
      ).bind(currentStart).all(),
      c.env.DB.prepare(
        `SELECT section, COUNT(*) AS views,
          COUNT(DISTINCT CASE WHEN user_id IS NOT NULL THEN user_id ELSE anonymous_id_hash END) AS visitors
         FROM analytics_events
         WHERE event_name IN ('page_view', 'section_view') AND occurred_at >= datetime('now', ?, 'start of day', '-9 hours') AND section != ''
         GROUP BY section ORDER BY views DESC`
      ).bind(currentStart).all(),
      c.env.DB.prepare(
        `SELECT device_type, COUNT(*) AS views,
          COUNT(DISTINCT CASE WHEN user_id IS NOT NULL THEN user_id ELSE anonymous_id_hash END) AS visitors
         FROM analytics_events
         WHERE event_name = 'page_view' AND occurred_at >= datetime('now', ?, 'start of day', '-9 hours')
         GROUP BY device_type ORDER BY views DESC`
      ).bind(currentStart).all(),
      c.env.DB.prepare(
        `SELECT CASE
           WHEN json_extract(metadata, '$.referrerHost') = 'direct' THEN 'direct'
           WHEN json_extract(metadata, '$.referrerHost') = 'self' THEN 'self'
           WHEN COALESCE(json_extract(metadata, '$.referrerHost'), '') = '' THEN 'unknown'
           ELSE json_extract(metadata, '$.referrerHost') END AS referrer,
          COUNT(*) AS views,
          COUNT(DISTINCT CASE WHEN user_id IS NOT NULL THEN user_id ELSE anonymous_id_hash END) AS visitors
         FROM analytics_events
         WHERE event_name = 'page_view' AND occurred_at >= datetime('now', ?, 'start of day', '-9 hours')
         GROUP BY referrer ORDER BY views DESC LIMIT 8`
      ).bind(currentStart).all(),
      c.env.DB.prepare(
        `SELECT CASE
           WHEN CAST(strftime('%H', occurred_at, '+9 hours') AS INTEGER) < 6 THEN '0–5時'
           WHEN CAST(strftime('%H', occurred_at, '+9 hours') AS INTEGER) < 12 THEN '6–11時'
           WHEN CAST(strftime('%H', occurred_at, '+9 hours') AS INTEGER) < 18 THEN '12–17時'
           ELSE '18–23時' END AS time_band,
          COUNT(*) AS views,
          COUNT(DISTINCT CASE WHEN user_id IS NOT NULL THEN user_id ELSE anonymous_id_hash END) AS visitors
         FROM analytics_events
         WHERE event_name = 'page_view' AND occurred_at >= datetime('now', ?, 'start of day', '-9 hours')
         GROUP BY time_band ORDER BY MIN(CAST(strftime('%H', occurred_at, '+9 hours') AS INTEGER))`
      ).bind(currentStart).all(),
      c.env.DB.prepare(
        `SELECT COUNT(*) AS runs,
          SUM(CASE WHEN status IN ('success', 'not_modified') THEN 1 ELSE 0 END) AS successful_runs,
          SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS failed_runs,
          SUM(unique_count) AS new_articles
         FROM fetch_runs WHERE datetime(started_at) >= datetime('now', ?, 'start of day', '-9 hours')`
      ).bind(currentStart).first(),
      c.env.DB.prepare(
        `SELECT
          SUM(${VISIBLE}) AS published_articles,
          SUM(status = 'suppressed') AS suppressed_articles,
          COUNT(DISTINCT CASE WHEN ${VISIBLE} THEN source_id END) AS active_sources,
          MAX(CASE WHEN ${VISIBLE} THEN created_at END) AS latest_article_at
         FROM articles`
      ).first(),
      c.env.DB.prepare(
        `SELECT id, name, last_success_at, consecutive_failures
         FROM sources WHERE allowed_fetch = 1
         ORDER BY consecutive_failures DESC, COALESCE(last_success_at, '') ASC, name LIMIT 12`
      ).all()
    ]);
    const { runs: ingestRuns = 0, ...ingestTotals } = (ingest ?? {}) as { runs?: number; successful_runs?: number; failed_runs?: number; new_articles?: number };
    const successfulRuns = Number(ingestTotals.successful_runs ?? 0);
    return c.json({
      days, metrics, users, trend: trend.results, popularArticles: popularArticles.results,
      sections: sections.results, devices: devices.results, referrers: referrers.results,
      timeBands: timeBands.results, inventory,
      ingest: { ...ingestTotals, successRate: ingestRuns ? Math.round(successfulRuns / Number(ingestRuns) * 1000) / 10 : 100 },
      sourceHealth: sourceHealth.results
    });
  } catch (error) {
    return c.json({ error: errorMessage(error) }, 503);
  }
});

// Error messages, backoff and failure counts are operational detail: admins (session) or the
// operator holding INGEST_TOKEN (smoke tests via curl) only.
app.get('/api/ingest/status', async (c) => {
  if (!isAuthorized(c.req.raw, c.env)) {
    const session = await readSession(c.env, getCookie(c, SESSION_COOKIE));
    if (!session) return c.json({ error: 'ログインが必要です。' }, 401);
    if (!session.isAdmin) return c.json({ error: '管理者権限が必要です。' }, 403);
  }
  c.header('Cache-Control', 'private, no-store');
  try {
    const [sources, runs, candidates, quality] = await Promise.all([
      c.env.DB.prepare(
        `SELECT id, name, source_kind, content_type, default_pillar, fetch_mode,
                last_success_at, last_error_at, consecutive_failures, backoff_until
         FROM sources WHERE allowed_fetch = 1 ORDER BY priority DESC`
      ).all(),
      c.env.DB.prepare(
        `SELECT source_id, status, discovered_count, unique_count, error_message, started_at, finished_at,
                ingest_mode, backfill_page, since_at
         FROM fetch_runs ORDER BY started_at DESC LIMIT 20`
      ).all(),
      c.env.DB.prepare(
        `SELECT status, COUNT(*) AS count FROM ingest_candidates GROUP BY status ORDER BY count DESC`
      ).all(),
      c.env.DB.prepare(
        `SELECT q.source_id, s.name,
                SUM(q.discovered_count) AS discovered_count,
                SUM(q.hard_rejected_count) AS hard_rejected_count,
                SUM(q.semantic_reviewed_count) AS semantic_reviewed_count,
                SUM(q.semantic_rejected_count) AS semantic_rejected_count,
                SUM(q.published_count) AS published_count,
                SUM(q.duplicate_count) AS duplicate_count,
                SUM(q.ai_error_count) AS ai_error_count
         FROM source_quality_daily q JOIN sources s ON s.id = q.source_id
         WHERE q.day >= date('now', '-7 days')
         GROUP BY q.source_id, s.name ORDER BY published_count DESC, discovered_count DESC`
      ).all()
    ]);
    return c.json({ sources: sources.results, runs: runs.results, candidates: candidates.results, quality: quality.results });
  } catch (error) {
    return c.json({ sources: [], runs: [], candidates: [], quality: [], error: errorMessage(error) }, 503);
  }
});

app.get('/api/coverage', edgeCache, async (c) => {
  try {
    const [articleCoverage, sourceCoverage] = await Promise.all([
      c.env.DB.prepare(
        `SELECT chapter_id, COUNT(*) AS published_count,
                SUM(CASE WHEN region = 'Japan' THEN 1 ELSE 0 END) AS japan_count
         FROM articles WHERE ${VISIBLE} GROUP BY chapter_id`
      ).all<{ chapter_id: string; published_count: number; japan_count: number }>(),
      c.env.DB.prepare(
        `SELECT j.value AS chapter_id, COUNT(DISTINCT s.id) AS source_count
         FROM sources s, json_each(s.chapter_targets) j
         WHERE s.allowed_fetch = 1 AND json_valid(s.chapter_targets)
         GROUP BY chapter_id`
      ).all<{ chapter_id: string; source_count: number }>()
    ]);
    const articleMap = new Map(articleCoverage.results.map((row) => [row.chapter_id, row]));
    const sourceMap = new Map(sourceCoverage.results.map((row) => [row.chapter_id, Number(row.source_count)]));
    const chapters = chapterDefinitions.map((chapter) => {
      const articles = articleMap.get(chapter.id);
      const publishedCount = Number(articles?.published_count ?? 0);
      const sourceCount = sourceMap.get(chapter.id) ?? 0;
      return {
        ...chapter,
        publishedCount,
        sourceCount,
        japanCount: Number(articles?.japan_count ?? 0),
        status: publishedCount >= chapter.minimumPublished && sourceCount >= chapter.minimumSources
          ? 'healthy' : publishedCount > 0 && sourceCount > 0 ? 'thin' : 'empty'
      };
    });
    return c.json({ chapters }, 200, { 'Cache-Control': 'public, max-age=60, s-maxage=300' });
  } catch (error) {
    return c.json({ chapters: [], error: errorMessage(error) }, 503);
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
  return c.json({ queued: messages.length, since, sources: sourcePages.map(({ source, pages }) => ({ id: source.id, pages })) });
});

app.post('/api/ingest/email/test', async (c) => {
  if (!isEmailTestAuthorized(c.req.raw, c.env)) return c.json({ error: 'Unauthorized' }, 401);
  const payload = await c.req.json().catch(() => ({})) as { kind?: 'connection' | 'daily' };
  try {
    if (payload.kind === 'daily') return c.json(await sendDailyDigest(c.env, new Date(), true));
    return c.json(await sendConfigurationTest(c.env));
  } catch (error) {
    console.error({ event: 'notification_email_test_failed', message: errorMessage(error) });
    return c.json({ error: errorMessage(error) }, 502);
  }
});

const registryById = new Map(sourceRegistry.map((source) => [source.id, source]));

async function readSources(env: Env, sourceIds?: string[], force = false): Promise<SourceRecord[]> {
  const now = new Date().toISOString();
  try {
    const eligibilityClause = force ? '' : `AND (backoff_until IS NULL OR backoff_until <= ?)
      AND (last_success_at IS NULL OR datetime(last_success_at, '+' || poll_interval_minutes || ' minutes') <= datetime(?))`;
    const ids = sourceIds?.length ? sourceIds.slice(0, 90) : [];
    const idClause = ids.length ? `AND id IN (${ids.map(() => '?').join(', ')})` : '';
    const result = await env.DB.prepare(
      `SELECT id, name, homepage, feed_url, api_url, fetch_mode, language, country, source_kind,
              content_type, default_pillar, source_tier, source_weight, min_fde_score,
              priority, poll_interval_minutes, etag, last_modified, consecutive_failures, backoff_until
       FROM sources
       WHERE allowed_fetch = 1 ${eligibilityClause} ${idClause}
       ORDER BY priority DESC`
    ).bind(...(force ? [] : [now, now]), ...ids).all<DbSourceRow>();
    return result.results
      .map((source) => {
        const registrySource = registryById.get(source.id);
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
          backfillUrl: registrySource?.backfillUrl,
          stream: registrySource ? collectionStreamFor(registrySource) : 'production-pattern',
          semanticPolicy: registrySource?.semanticPolicy ?? 'required',
          dailyItemCap: registrySource?.dailyItemCap ?? 20,
          includeTerms: registrySource?.includeTerms,
          excludeTerms: registrySource?.excludeTerms,
          fixedChapter: registrySource?.fixedChapter,
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
       poll_interval_minutes, allowed_fetch, parser_version, robots_checked_at, tos_reviewed_at,
       collection_stream, semantic_policy, daily_item_cap, chapter_targets)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '5', ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name, homepage = excluded.homepage, feed_url = excluded.feed_url,
       api_url = excluded.api_url, fetch_mode = excluded.fetch_mode, language = excluded.language,
       country = excluded.country, source_kind = excluded.source_kind,
       content_type = excluded.content_type, default_pillar = excluded.default_pillar,
       source_tier = excluded.source_tier, source_weight = excluded.source_weight,
       min_fde_score = excluded.min_fde_score, priority = excluded.priority,
       poll_interval_minutes = excluded.poll_interval_minutes, allowed_fetch = excluded.allowed_fetch,
       collection_stream = excluded.collection_stream, semantic_policy = excluded.semantic_policy,
       daily_item_cap = excluded.daily_item_cap, chapter_targets = excluded.chapter_targets,
       parser_version = '5', updated_at = CURRENT_TIMESTAMP`
  ).bind(
    source.id, source.name, source.homepage, source.feedUrl ?? null, source.apiUrl ?? null,
    source.fetchMode, source.language, source.country, source.kind, source.contentType,
    source.defaultPillar, source.sourceTier, source.weight, source.minScore, source.priority,
    source.pollIntervalMinutes, source.enabled === false ? 0 : 1,
    new Date().toISOString().slice(0, 10), new Date().toISOString().slice(0, 10),
    collectionStreamFor(source), source.semanticPolicy ?? 'required', source.dailyItemCap ?? 20,
    JSON.stringify(chaptersFor(source))
  ));
  for (let index = 0; index < statements.length; index += 20) {
    await env.DB.batch(statements.slice(index, index + 20));
  }
  // A source deleted from the registry file (rather than set to enabled: false) must stop too.
  const known = sourceRegistry.map((source) => source.id);
  await env.DB.prepare(
    `UPDATE sources SET allowed_fetch = 0, updated_at = CURRENT_TIMESTAMP
     WHERE allowed_fetch = 1 AND id NOT IN (SELECT value FROM json_each(?))`
  ).bind(JSON.stringify(known)).run();
}

async function fetchSourceItems(source: SourceRecord, options: IngestOptions): Promise<{ items: DiscoveredItem[]; meta: FetchMeta }> {
  const rssUrl = options.mode === 'backfill' && source.backfillUrl ? source.backfillUrl : source.feedUrl;
  const youtubeVideosUrl = isYoutubeFeedSource(source) ? `${source.homepage.replace(/\/$/, '')}/videos` : undefined;
  const candidates = [
    { mode: 'api' as const, url: source.apiUrl },
    { mode: 'rss' as const, url: rssUrl },
    { mode: 'html' as const, url: source.fetchMode === 'html' ? source.homepage : youtubeVideosUrl }
  ].filter((candidate): candidate is { mode: SourceRecord['fetchMode']; url: string } => Boolean(candidate.url));
  let lastError: FetchFailure | undefined;
  for (const [index, candidate] of candidates.entries()) {
    // The stored ETag / Last-Modified belong to the primary surface; sending an RSS ETag to a
    // fallback HTML page would be meaningless, and storing the fallback's would break the next RSS request.
    const primary = index === 0;
    try {
      const requestUrl = options.mode === 'backfill'
        ? buildBackfillUrl(source, candidate.url, options)
        : candidate.url;
      const result = await fetchWithPolicy(source, requestUrl, options.mode === 'backfill' || !primary);
      if (result.notModified) return { items: [], meta: { ...result, mode: candidate.mode, primary } };
      const discovered = candidate.mode === 'api'
        ? parseApiResponse(source, result.body)
        : candidate.mode === 'rss'
          ? parseRssResponse(source, result.body, options.mode === 'backfill' || source.id === 'arxiv-fde-research' ? 1_500 : 60)
          : isYoutubeFeedSource(source)
            ? parseYoutubeHtmlResponse(source, result.body)
            : await parseHtmlResponse(source, result.body);
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
      const items = window.map((item) => enrichItem(source, {
        ...item,
        timeConfidence: item.timeConfidence ?? (candidate.mode === 'api' || candidate.mode === 'rss' ? 0.9 : undefined)
      }));
      return { items, meta: { ...result, mode: candidate.mode, primary } };
    } catch (error) {
      lastError = error as FetchFailure;
    }
  }
  throw lastError ?? new Error(`${source.name}: no fetch surface configured`);
}


async function fetchWithPolicy(source: SourceRecord, url: string, unconditional = false): Promise<{ body: string; etag: string | null; lastModified: string | null; notModified?: boolean }> {
  const headers = new Headers({
    accept: 'application/atom+xml, application/rss+xml, application/xml, text/xml, application/json, text/html',
    'user-agent': FETCH_USER_AGENT
  });
  if (!unconditional && source.etag) headers.set('if-none-match', source.etag);
  if (!unconditional && source.lastModified) headers.set('if-modified-since', source.lastModified);
  let response = await fetch(url, { headers });
  if (shouldRetryYoutubeFeedFailure(source, { status: response.status })) {
    const retryHeaders = new Headers(headers);
    retryHeaders.set('cache-control', 'no-cache');
    response = await fetch(youtubeFeedRetryUrl(url), { headers: retryHeaders });
  }
  if (response.status === 304) return { body: '', etag: source.etag ?? null, lastModified: source.lastModified ?? null, notModified: true };
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
  if (!response.ok) {
    const failure = new Error(`${source.name}: HTTP ${response.status}`) as FetchFailure;
    failure.status = response.status;
    throw failure;
  }
  let body: string;
  try {
    body = await readLimitedText(response, MAX_BODY_BYTES);
  } catch (error) {
    if (error instanceof BodyTooLargeError) throw new Error(`${source.name}: response exceeds ${MAX_BODY_BYTES} bytes`, { cause: error });
    throw error;
  }
  return { body, etag: response.headers.get('etag'), lastModified: response.headers.get('last-modified') };
}

function buildBackfillUrl(source: SourceRecord, rawUrl: string, options: IngestOptions): string {
  const url = new URL(rawUrl);
  const page = Math.max(1, options.page ?? 1);
  if (source.backfillMode === 'api-page' && url.hostname === 'qiita.com') {
    const sinceDay = (options.since ?? '').slice(0, 10);
    const baseQuery = url.searchParams.get('query') ?? '';
    url.searchParams.set('query', `(${baseQuery}) created:>=${sinceDay}`);
    url.searchParams.set('per_page', '100');
    url.searchParams.set('page', String(page));
  } else if (source.backfillMode === 'api-page' && url.pathname.includes('/api/query')) {
    url.searchParams.set('start', String((page - 1) * 100));
    url.searchParams.set('max_results', '100');
  } else if (source.backfillMode === 'feed-page') {
    url.searchParams.set('paged', String(page));
  }
  return url.toString();
}






type CandidateStatus = 'pending' | 'published' | 'rejected';

function candidateStatement(
  env: Env,
  source: SourceRecord,
  candidate: PreparedItem,
  gate: ReturnType<typeof evaluateCandidate>,
  semantic: SemanticDecision | undefined,
  status: CandidateStatus,
  articleId?: string
): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT INTO ingest_candidates
      (id, source_id, canonical_url, content_hash, payload, hard_gate_decision, hard_gate_score,
       hard_gate_reasons, semantic_decision, semantic_confidence, semantic_model, rejection_reason,
       status, first_seen_at, last_seen_at, analyzed_at, published_article_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?)
     ON CONFLICT(source_id, canonical_url, content_hash) DO UPDATE SET
       payload = excluded.payload, hard_gate_decision = excluded.hard_gate_decision,
       hard_gate_score = excluded.hard_gate_score, hard_gate_reasons = excluded.hard_gate_reasons,
       semantic_decision = excluded.semantic_decision, semantic_confidence = excluded.semantic_confidence,
       semantic_model = excluded.semantic_model, rejection_reason = excluded.rejection_reason,
       status = excluded.status, last_seen_at = CURRENT_TIMESTAMP,
       analyzed_at = excluded.analyzed_at, published_article_id = excluded.published_article_id`
  ).bind(
    candidate.candidateId, source.id, candidate.canonicalUrl, candidate.contentHash, JSON.stringify(candidate.item),
    gate.decision, gate.score, JSON.stringify(gate.reasons),
    semantic?.decision ?? (status === 'rejected' ? 'skipped' : 'pending'), semantic?.confidence ?? 0,
    semantic ? SEMANTIC_MODEL : '', semantic?.rejectionReason ?? '', status,
    semantic ? new Date().toISOString() : null, articleId ?? null
  );
}

async function recordCandidate(
  env: Env,
  source: SourceRecord,
  candidate: PreparedItem,
  gate: ReturnType<typeof evaluateCandidate>,
  semantic: SemanticDecision | undefined,
  status: CandidateStatus,
  articleId?: string
): Promise<void> {
  await candidateStatement(env, source, candidate, gate, semantic, status, articleId).run();
}

/** The JST calendar day, the one unit of "day" used by quotas, quality stats, the digest and the paper. */
function jstDay(date = new Date()): string {
  return new Date(date.getTime() + 9 * 3_600_000).toISOString().slice(0, 10);
}

async function recordSourceQuality(env: Env, sourceId: string, values: {
  discovered: number; hardRejected: number; semanticReviewed: number; semanticRejected: number;
  published: number; duplicates: number; aiErrors: number;
}): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO source_quality_daily
      (source_id, day, discovered_count, hard_rejected_count, semantic_reviewed_count,
       semantic_rejected_count, published_count, duplicate_count, ai_error_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(source_id, day) DO UPDATE SET
       discovered_count = discovered_count + excluded.discovered_count,
       hard_rejected_count = hard_rejected_count + excluded.hard_rejected_count,
       semantic_reviewed_count = semantic_reviewed_count + excluded.semantic_reviewed_count,
       semantic_rejected_count = semantic_rejected_count + excluded.semantic_rejected_count,
       published_count = published_count + excluded.published_count,
       duplicate_count = duplicate_count + excluded.duplicate_count,
       ai_error_count = ai_error_count + excluded.ai_error_count`
  ).bind(sourceId, jstDay(), values.discovered, values.hardRejected, values.semanticReviewed,
    values.semanticRejected, values.published, values.duplicates, values.aiErrors).run();
}

type PreparedItem = { item: DiscoveredItem; canonicalUrl: string; contentHash: string; candidateId: string };
type KnownCandidate = { id: string; status: string; semantic_decision: string; published_article_id: string | null };

/** D1 binds at most 100 parameters per statement. */
const D1_CHUNK = 90;

function chunks<T>(values: T[], size = D1_CHUNK): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

async function readKnownCandidates(env: Env, ids: string[]): Promise<Map<string, KnownCandidate>> {
  const known = new Map<string, KnownCandidate>();
  for (const part of chunks(ids)) {
    const rows = await env.DB.prepare(
      `SELECT id, status, semantic_decision, published_article_id FROM ingest_candidates
       WHERE id IN (${part.map(() => '?').join(', ')})`
    ).bind(...part).all<KnownCandidate>();
    for (const row of rows.results) known.set(row.id, row);
  }
  return known;
}

async function runInBatches(env: Env, statements: D1PreparedStatement[]): Promise<void> {
  for (const part of chunks(statements, 50)) await env.DB.batch(part);
}

async function ingestSource(env: Env, source: SourceRecord, options: IngestOptions): Promise<{ discovered: number; unique: number }> {
  const startedAt = new Date().toISOString();
  const runId = crypto.randomUUID();
  try {
    const result = await fetchSourceItems(source, options);
    const previousQuality = await env.DB.prepare(
      `SELECT semantic_reviewed_count FROM source_quality_daily WHERE source_id = ? AND day = ?`
    ).bind(source.id, jstDay()).first<{ semantic_reviewed_count: number }>();
    let semanticBudget = Math.max(0, (source.dailyItemCap ?? 20) - Number(previousQuality?.semantic_reviewed_count ?? 0));
    let unique = 0;
    let hardRejected = 0;
    let semanticReviewed = 0;
    let semanticRejected = 0;
    let published = 0;
    let duplicates = 0;
    let aiErrors = 0;

    // Hash everything first so already-known items are found with a few queries, not one per item.
    const prepared: PreparedItem[] = [];
    for (const item of result.items) {
      const canonicalUrl = normalizeUrl(item.url);
      if (!canonicalUrl || item.title.length < 4) continue;
      const contentHash = await sha256(`${item.title}\n${item.summary}\n${item.tags.join(' ')}`);
      prepared.push({ item, canonicalUrl, contentHash, candidateId: await sha256(`${source.id}\n${canonicalUrl}\n${contentHash}`) });
    }
    const known = await readKnownCandidates(env, prepared.map((entry) => entry.candidateId));
    const seenAgain: string[] = [];
    const timeUpdates: D1PreparedStatement[] = [];

    for (const candidate of prepared) {
      const { item, canonicalUrl, contentHash } = candidate;
      const prior = known.get(candidate.candidateId);
      // A pending row whose semantic_decision is no longer 'pending' already has an AI verdict
      // (review, or publish below the confidence gate). The same content would get the same
      // verdict at temperature 0, so only budget/AI-error pendings are retried. Requeue migrations
      // reset semantic_decision to 'pending' to force a new review.
      const alreadyReviewed = prior?.status === 'pending' && prior.semantic_decision !== 'pending';
      if (prior && (prior.status === 'published' || prior.status === 'rejected' || alreadyReviewed)) {
        if (prior.status === 'published' && prior.published_article_id && item.timeConfidence !== undefined) {
          // Only a timestamp at least as precise, and only when it actually differs.
          timeUpdates.push(env.DB.prepare(
            `UPDATE articles SET published_at = ?, published_at_original = ?, source_updated_at = ?,
               crawl_run_at = ?, time_confidence = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ? AND COALESCE(time_confidence, 0) <= ?
               AND (published_at IS NOT ? OR time_confidence IS NOT ?)`
          ).bind(item.publishedAt, item.publishedAt, item.publishedAt, new Date().toISOString(), item.timeConfidence,
            prior.published_article_id, item.timeConfidence, item.publishedAt, item.timeConfidence));
        }
        duplicates += 1;
        seenAgain.push(candidate.candidateId);
        continue;
      }
      if (isBeforePublicBaseline(item.publishedAt)) {
        hardRejected += 1;
        const gate = evaluateCandidate(source, item);
        await recordCandidate(env, source, candidate,
          { ...gate, decision: 'reject', reasons: [...gate.reasons, 'published before the public baseline'] }, undefined, 'rejected');
        continue;
      }
      const gate = evaluateCandidate(source, item);
      if (gate.decision === 'reject' || gate.score < source.minScore) {
        hardRejected += 1;
        await recordCandidate(env, source, candidate, gate, undefined, 'rejected');
        continue;
      }
      const existing = await env.DB.prepare(
        'SELECT id, content_hash, time_confidence, status FROM articles WHERE canonical_url = ?'
      ).bind(canonicalUrl).first<{ id: string; content_hash: string | null; time_confidence: number | null; status: string }>();
      // Suppressed and archived articles were taken down on purpose (migrations 0014/0015/0021).
      // A changed title or summary must not bring them back; restoring one is a migration's job.
      if (existing && (existing.status === 'suppressed' || existing.status === 'archived')) {
        duplicates += 1;
        await recordCandidate(env, source, candidate,
          { ...gate, decision: 'reject', reasons: [...gate.reasons, `article is ${existing.status}`] }, undefined, 'rejected');
        continue;
      }
      // Fallback surfaces (e.g. the YouTube channel page when RSS fails) produce a template summary
      // and an approximate date. Their content hash differs from the RSS copy, so without this check
      // they would overwrite the real description and exact timestamp of an already published article.
      if (existing && Number(existing.time_confidence ?? 0) > itemTimeConfidence(source, item)) {
        duplicates += 1;
        await recordCandidate(env, source, candidate, gate, undefined, 'published', existing.id);
        continue;
      }
      let semantic: SemanticDecision | undefined;
      if ((source.semanticPolicy ?? 'required') === 'required') {
        if (semanticBudget <= 0) {
          await recordCandidate(env, source, candidate, gate, undefined, 'pending');
          continue;
        }
        semanticBudget -= 1;
        semanticReviewed += 1;
        try {
          semantic = await reviewWithWorkersAI(env.AI, source, item);
        } catch (error) {
          aiErrors += 1;
          console.error('semantic review failed', source.id, errorMessage(error));
          await recordCandidate(env, source, candidate, gate, undefined, 'pending');
          continue;
        }
        if (semantic.decision !== 'publish' || semantic.confidence < 0.62) {
          if (semantic.decision === 'reject') semanticRejected += 1;
          await recordCandidate(env, source, candidate, gate, semantic, semantic.decision === 'reject' ? 'rejected' : 'pending');
          continue;
        }
      }
      if (await publishArticle(env, source, candidate, gate, semantic, existing?.id)) published += 1;
      if (!existing || existing.content_hash !== contentHash) unique += 1;
      else duplicates += 1;
    }

    await runInBatches(env, timeUpdates);
    for (const part of chunks(seenAgain)) {
      await env.DB.prepare(
        `UPDATE ingest_candidates SET last_seen_at = CURRENT_TIMESTAMP WHERE id IN (${part.map(() => '?').join(', ')})`
      ).bind(...part).run();
    }
    await recordSourceQuality(env, source.id, {
      discovered: result.items.length, hardRejected, semanticReviewed, semanticRejected,
      published, duplicates, aiErrors
    });
    await env.DB.prepare(
      `INSERT INTO fetch_runs
       (id, source_id, status, discovered_count, unique_count, started_at, finished_at, ingest_mode, backfill_page, since_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      runId, source.id, result.meta.notModified ? 'not_modified' : 'success', result.items.length, unique,
      startedAt, new Date().toISOString(), options.mode, options.page ?? null, options.since ?? null
    ).run();
    if (options.mode !== 'backfill') await markSourceSuccess(env, source, result.meta);
    if (!result.meta.notModified) {
      await persistArchive(env, source, result.items, result.meta.mode, startedAt).catch((error) => {
        console.error({
          event: 'ingest_archive_failed', sourceId: source.id,
          message: errorMessage(error), occurredAt: new Date().toISOString()
        });
      });
    }
    return { discovered: result.items.length, unique };
  } catch (error) {
    const failure = error as FetchFailure;
    if (options.willRetry?.(failure)) throw error;
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

/**
 * Upserts one article: the row itself, then everything derived from it in a single D1 batch
 * (intelligence and semantic fields, the FTS row, the candidate record).
 */
async function publishArticle(
  env: Env,
  source: SourceRecord,
  candidate: PreparedItem,
  gate: ReturnType<typeof evaluateCandidate>,
  semantic: SemanticDecision | undefined,
  existingId: string | undefined
): Promise<string | undefined> {
  const { item, canonicalUrl, contentHash } = candidate;
  const id = existingId ?? crypto.randomUUID();
  const searchTokensJa = tokenizeJapanese(`${item.title} ${item.summary} ${item.summaryJa} ${item.tags.join(' ')} ${item.location} ${item.sector} ${item.pillar} ${item.subtopic}`);
  const intelligence = inferIntelligence(source, item);
  const stored = await env.DB.prepare(
    `INSERT INTO articles
    (id, canonical_url, canonical_url_hash, external_item_id, source_id, title, title_normalized, summary, language,
     country_relevance, tags, search_tokens_ja, published_at, signal_type, location, sector, fde_score,
     why_it_matters, pillar, subtopic, content_type, region, summary_ja, relevance_tags,
     content_hash, status, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?, ?, 'published', CURRENT_TIMESTAMP)
    ON CONFLICT(canonical_url) DO UPDATE SET
      external_item_id = excluded.external_item_id,
      source_id = excluded.source_id,
      title = excluded.title,
      title_normalized = excluded.title_normalized,
      summary = excluded.summary,
      language = excluded.language,
      country_relevance = excluded.country_relevance,
      tags = excluded.tags,
      search_tokens_ja = excluded.search_tokens_ja,
      published_at = excluded.published_at,
      signal_type = excluded.signal_type,
      location = excluded.location,
      sector = excluded.sector,
      fde_score = excluded.fde_score,
      why_it_matters = excluded.why_it_matters,
      pillar = excluded.pillar,
      subtopic = excluded.subtopic,
      content_type = excluded.content_type,
      region = excluded.region,
      summary_ja = excluded.summary_ja,
      relevance_tags = excluded.relevance_tags,
      content_hash = excluded.content_hash,
      status = CASE WHEN articles.status IN ('suppressed', 'archived') THEN articles.status ELSE 'published' END,
      updated_at = CURRENT_TIMESTAMP
    RETURNING id`
  ).bind(
    id, canonicalUrl, await sha256(canonicalUrl), item.externalItemId, source.id, item.title,
    item.title.normalize('NFKC').toLowerCase(), item.summary, source.language, item.countryRelevance, item.tags.join(' '), searchTokensJa,
    item.publishedAt, item.signalType, item.location, item.sector, item.fdeScore ?? 0,
    item.pillar ?? intelligence.corePillar, item.subtopic ?? '', item.contentType ?? source.contentType,
    item.countryRelevance === 'JP' ? 'Japan' : 'Global', item.summaryJa ?? '',
    JSON.stringify(inferRelevanceTags(source, item)), contentHash
  ).first<{ id: string }>();
  if (!stored?.id) return undefined;
  const seenAt = new Date().toISOString();
  const topics = semantic?.topics.length ? semantic.topics : intelligence.topicLayers;
  const corePillar = semantic?.corePillar ?? intelligence.corePillar;
  const chapterId = source.fixedChapter ?? ((item.contentType ?? source.contentType) === 'career'
    ? 'organization.talent'
    : inferChapter(corePillar, `${item.title} ${item.summary} ${topics.join(' ')}`));
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE articles SET core_pillar = ?, japan_lens = ?, topic_layers = ?, affected_stack = ?,
         priority_level = ?, recommended_action = ?, evidence = ?, why_it_matters = ?, signal_type = ?,
         relevance_score = ?, actionability_score = ?, authority_score = ?, novelty_score = ?,
         client_fit_score = ?, priority_score = ?, published_at_original = ?,
         first_seen_at = CASE WHEN first_seen_at = '' THEN COALESCE(discovered_at, created_at) ELSE first_seen_at END,
         last_seen_at = ?, source_updated_at = ?, crawl_run_at = ?, time_confidence = ?,
         semantic_decision = ?, semantic_confidence = ?, semantic_model = ?, semantic_analyzed_at = ?,
         rejection_reason = '', collection_stream = ?, chapter_id = ?
       WHERE id = ?`
    ).bind(
      corePillar, intelligence.japanLens, JSON.stringify(topics), JSON.stringify(intelligence.affectedStack),
      intelligence.priorityLevel, semantic?.recommendedActionJa || intelligence.recommendedAction,
      semantic?.evidenceJa || intelligence.evidence, semantic?.whyItMattersJa ?? '',
      semantic?.signalType ?? item.signalType,
      semantic?.relevanceScore ?? intelligence.relevanceScore,
      semantic?.actionabilityScore ?? intelligence.actionabilityScore,
      intelligence.authorityScore, intelligence.noveltyScore,
      semantic?.clientFitScore ?? intelligence.clientFitScore, intelligence.priorityScore,
      item.publishedAt, seenAt, item.publishedAt, seenAt, intelligence.timeConfidence,
      semantic?.decision ?? 'rules', semantic?.confidence ?? 1, semantic ? SEMANTIC_MODEL : '',
      semantic ? seenAt : null, collectionStreamFor(source), chapterId, stored.id
    ),
    env.DB.prepare('DELETE FROM articles_fts WHERE article_id = ?').bind(stored.id),
    env.DB.prepare(
      'INSERT INTO articles_fts (article_id, title, summary, tags, search_tokens_ja) VALUES (?, ?, ?, ?, ?)'
    ).bind(stored.id, item.title, item.summaryJa ?? item.summary, item.tags.join(' '), searchTokensJa),
    candidateStatement(env, source, candidate, gate, semantic, 'published', stored.id)
  ]);
  return stored.id;
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
    summaryJa: makeSummaryJa(source, item, pillar, subtopic)
  };
}

type Intelligence = {
  corePillar: CorePillar;
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
  const corePillar: CorePillar = item.pillar ?? inferPillar(source, text);
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

  const relevanceScore = Math.min(100, item.fdeScore ?? 0);
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
    timeConfidence: itemTimeConfidence(source, item)
  };
}

function itemTimeConfidence(source: SourceRecord, item: { timeConfidence?: number }): number {
  return item.timeConfidence ?? (source.fetchMode === 'api' || source.fetchMode === 'rss' ? .9 : .55);
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

/**
 * One of the five pillars, from the item's text. Japan is a lens across all five (see README), never
 * a pillar, so Japanese sources go through the same rules; their registry default 'Japan' falls back to Deploy.
 */
function inferPillar(source: SourceRecord, value: string): CorePillar {
  if (ORG_PATTERN.test(value) || source.kind === 'careers') return 'Organization';
  if (GOVERN_PATTERN.test(value)) return 'Govern';
  if (DEPLOY_PATTERN.test(value)) return 'Deploy';
  if (CUSTOMER_PATTERN.test(value)) return 'Customer';
  if (BUILD_PATTERN.test(value)) return 'Build';
  return source.defaultPillar === 'Japan' ? 'Deploy' : source.defaultPillar;
}

function inferSubtopic(pillar: CorePillar, value: string): string {
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
  }
  return 'FDE Philosophy / Role';
}

const pillarNamesJa: Record<CorePillar, string> = {
  Customer: '顧客課題', Build: '構築', Deploy: '本番導入', Govern: '統制・安全', Organization: '組織・定着'
};

function makeSummaryJa(source: SourceRecord, item: DiscoveredItem, pillar: CorePillar, subtopic: string): string {
  if (/[ぁ-んァ-ヶ一-龠]/u.test(item.summary) && item.summary.length >= 40) return item.summary.slice(0, 320);
  const type = contentTypeLabel(source.contentType);
  return `${source.name}が公開した${type}です。「${item.title}」を通じて、${pillarNamesJa[pillar]}領域の${subtopic}に関する変化を確認できます。`;
}

function contentTypeLabel(type: ContentType): string {
  return ({ news: 'ニュース', blog: '技術記事', video: '動画', paper: '論文', report: 'レポート', release: 'リリース情報', 'case-study': '導入事例', career: '採用情報' })[type];
}









/** Relevance tags shown on 二面 (「影響」): the pillar's reader-facing name and the subtopic. */
function inferRelevanceTags(source: SourceRecord, item: DiscoveredItem): string[] {
  const pillar = item.pillar ?? inferPillar(source, item.title);
  return [pillarNamesJa[pillar], item.subtopic].filter((label): label is string => Boolean(label)).slice(0, 2);
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
     last_error_at = NULL, backoff_until = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).bind(
    meta.primary ? meta.etag ?? source.etag ?? null : source.etag ?? null,
    meta.primary ? meta.lastModified ?? source.lastModified ?? null : source.lastModified ?? null,
    new Date().toISOString(), source.id
  ).run();
}

async function markSourceFailure(env: Env, source: SourceRecord, failure: FetchFailure): Promise<void> {
  const attempts = (source.consecutiveFailures ?? 0) + 1;
  const minimumSeconds = (source.id === 'arxiv-fde-research' && failure.status === 429)
    || isDeferredYoutubeFeedFailure(source, failure) ? 6 * 3_600 : 60;
  const delaySeconds = sourceBackoffSeconds(failure, attempts, minimumSeconds);
  await env.DB.prepare(
    `UPDATE sources SET last_error_at = ?, consecutive_failures = ?, backoff_until = ?,
     updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).bind(new Date().toISOString(), attempts, new Date(Date.now() + delaySeconds * 1000).toISOString(), source.id).run().catch(() => undefined);
}

async function dispatchSources(env: Env): Promise<void> {
  await env.DB.prepare("DELETE FROM auth_challenges WHERE julianday(expires_at) <= julianday('now')").run().catch(() => undefined);
  await env.DB.prepare("DELETE FROM user_sessions WHERE julianday(expires_at) <= julianday('now')").run().catch(() => undefined);
  await env.DB.prepare("DELETE FROM request_rate_limits WHERE expires_at <= unixepoch('now')").run().catch(() => undefined);
  await syncSourceRegistry(env);
  const sources = await readSources(env);
  if (!sources.length) return;
  await env.INGEST_QUEUE.sendBatch(sources.map((source) => ({ body: { sourceIds: [source.id], reason: 'scheduled' as const } })));
}

function isAuthorized(request: Request, env: Env): boolean {
  return hasConfiguredBearerToken(request.headers.get('authorization'), env.INGEST_TOKEN);
}

function isEmailTestAuthorized(request: Request, env: Env): boolean {
  return hasConfiguredBearerToken(request.headers.get('authorization'), env.EMAIL_TEST_TOKEN);
}

type SessionIdentity = { sessionId: string; userId: string; displayName: string; isAdmin: boolean };

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try { return new URL(origin).host === new URL(request.url).host; } catch { return false; }
}

async function allowAuthAttempt(env: Env, request: Request, action: string): Promise<boolean> {
  const ip = request.headers.get('cf-connecting-ip') ?? 'local';
  const key = `auth-rate:${await sha256(`${ip}:${action}`)}`;
  return consumeRequestLimit(env.DB, key, 10, 600);
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
    `SELECT s.id AS session_id, u.id AS user_id, u.display_name, u.role,
            julianday(s.last_seen_at) < julianday('now', '-1 hour') AS stale
     FROM user_sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND julianday(s.expires_at) > julianday('now')`
  ).bind(await sha256(token)).first<{ session_id: string; user_id: string; display_name: string; role: string; stale: number }>();
  if (!session) return null;
  // last_seen_at only feeds the session list, so an hour of precision is enough; ordinary
  // authenticated requests then read D1 without also writing to it.
  if (session.stale) await env.DB.prepare('UPDATE user_sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?').bind(session.session_id).run();
  return { sessionId: session.session_id, userId: session.user_id, displayName: session.display_name, isAdmin: session.role === 'admin' };
}

function normalizeBackfillSince(value?: string): string | undefined {
  const raw = value?.trim() || PUBLIC_BASELINE.slice(0, 10);
  const timestamp = Date.parse(`${raw.slice(0, 10)}T00:00:00+09:00`);
  const minimum = Date.parse(PUBLIC_BASELINE);
  if (!Number.isFinite(timestamp) || timestamp < minimum || timestamp > Date.now()) return undefined;
  return new Date(timestamp).toISOString();
}




function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.min(86_400, Math.max(60, seconds));
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.min(86_400, Math.max(60, Math.ceil((timestamp - Date.now()) / 1000))) : undefined;
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
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    const scheduledAt = new Date(controller.scheduledTime);
    if (controller.cron === INGEST_DISPATCH_CRON) ctx.waitUntil(dispatchSources(env));
    else if (controller.cron === INGEST_HEALTH_CRON) ctx.waitUntil(monitorIngestionHealth(env, scheduledAt));
    else if (controller.cron === DAILY_DIGEST_CRON) ctx.waitUntil(sendDailyDigest(env, scheduledAt));
    else console.warn({ event: 'unknown_scheduled_trigger', cron: controller.cron, scheduledAt: scheduledAt.toISOString() });
  },
  async queue(batch: MessageBatch<IngestMessage>, env: Env) {
    for (const message of batch.messages) {
      const mode = message.body.reason ?? 'scheduled';
      // The dispatcher already applies polling and backoff eligibility. Once a
      // source has been queued, force the explicit source lookup so a Queue
      // retry is not silently filtered by the backoff written by its first
      // failed attempt.
      const sources = await readSources(env, message.body.sourceIds, true);
      const retryableFailures: string[] = [];
      const permanentFailures: string[] = [];
      const deferredFailures: string[] = [];
      for (const source of sources) {
        // consecutive_failures only moves once per run, so this is the number of failed runs.
        const runs = (source.consecutiveFailures ?? 0) + 1;
        try {
          await ingestSource(env, source, {
            mode, since: message.body.since, page: message.body.page,
            willRetry: (failure) => willRetryInQueue(ingestFailureKind(source, failure, runs), message.attempts, QUEUE_MAX_RETRIES)
          });
        }
        catch (error) {
          const detail = `${source.id}: ${errorMessage(error)}`;
          const kind = ingestFailureKind(source, error as FetchFailure, runs);
          if (kind === 'permanent') permanentFailures.push(detail);
          else if (kind === 'deferred') deferredFailures.push(detail);
          else retryableFailures.push(detail);
        }
      }
      if (permanentFailures.length) console.error({
        event: 'ingest_source_manual_review', failures: permanentFailures,
        occurredAt: new Date().toISOString()
      });
      if (deferredFailures.length) console.warn({
        event: 'ingest_source_deferred', failures: deferredFailures,
        occurredAt: new Date().toISOString()
      });
      if (retryableFailures.length) {
        console.error({
          event: 'ingest_batch_retry', failures: retryableFailures,
          occurredAt: new Date().toISOString()
        });
        message.retry({ delaySeconds: 60 });
      } else {
        message.ack();
      }
    }
  }
};

export default worker;
