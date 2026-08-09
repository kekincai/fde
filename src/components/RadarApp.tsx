import { useEffect, useMemo, useState } from 'react';
import { startAuthentication, startRegistration } from '@simplewebauthn/browser';

import { pillarLabels, pillars, priorityMeta, topics, type Article, type Channel, type Priority, type Region } from '../data/articles';

type IconName = 'bookmark' | 'external' | 'search' | 'user' | 'close' | 'menu' | 'chevron' | 'logout' | 'devices';
function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const props = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
  const paths: Record<IconName, React.ReactNode> = {
    bookmark: <><path d="M6.5 4.5A1.5 1.5 0 0 1 8 3h8a1.5 1.5 0 0 1 1.5 1.5V21l-5.5-3-5.5 3V4.5Z" /></>,
    external: <><path d="M14 5h5v5" /><path d="M19 5 11 13" /><path d="M18 13v4.5A1.5 1.5 0 0 1 16.5 19h-9A1.5 1.5 0 0 1 6 17.5v-9A1.5 1.5 0 0 1 7.5 7H12" /></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 4.5 4.5" /></>,
    user: <><circle cx="12" cy="8" r="3.2" /><path d="M5.5 20c.7-4 3-6 6.5-6s5.8 2 6.5 6" /></>,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>, menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
    chevron: <path d="m9 6 6 6-6 6" />, logout: <><path d="M10 5H6v14h4M14 8l4 4-4 4M9 12h9" /></>,
    devices: <><rect x="3" y="5" width="14" height="10" rx="1.5" /><path d="M8 19h4M10 15v4M19 9h2v10h-6v-2" /></>
  };
  return <svg {...props}>{paths[name]}</svg>;
}

type ApiArticle = Partial<Record<keyof Article, unknown>> & {
  id?: string; title?: string; source_name?: string; source_kind?: string; region?: string; country_relevance?: string;
  core_pillar?: string; pillar?: string; japan_lens?: string; topic_layers?: string; affected_stack?: string;
  priority_level?: Priority; recommended_action?: string; evidence?: string; content_type?: string; location?: string;
  sector?: string; published_at?: string; summary?: string; summary_ja?: string; relevance_tags?: string;
  canonical_url?: string; fde_score?: number;
};
type User = { id: string; displayName: string };
type Session = { id: string; created_at: string; last_seen_at: string; expires_at: string; user_agent: string; is_current: number };
type Overview = { counts?: { total?: number; japan?: number; p0?: number; p1?: number; p2?: number }; last_ingested_at?: string | null };

function parseList(value?: string, fallback = ''): string[] {
  if (value) try { const parsed = JSON.parse(value); if (Array.isArray(parsed)) return parsed.filter((item): item is string => typeof item === 'string' && Boolean(item)); } catch { /* legacy value */ }
  return fallback ? [fallback] : [];
}
function relativeTime(value: string): string {
  const diff = Math.max(0, Date.now() - Date.parse(value)); const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return `${Math.max(1, Math.floor(diff / 60_000))}分前`; if (hours < 24) return `${hours}時間前`; return `${Math.floor(hours / 24)}日前`;
}
function fromApi(raw: ApiArticle): Article | null {
  if (!raw.id || !raw.title || !raw.canonical_url) return null;
  const region: Region = raw.region === 'Japan' || raw.country_relevance === 'JP' ? 'Japan' : 'Global';
  return {
    id: raw.id, title: raw.title, source: raw.source_name || '公式情報源', sourceKind: raw.source_kind || 'official', region,
    corePillar: raw.core_pillar || raw.pillar || 'Customer', japanLens: raw.japan_lens || '',
    topicLayers: parseList(raw.topic_layers, raw.core_pillar || raw.pillar || 'FDE'), affectedStack: parseList(raw.affected_stack),
    priority: raw.priority_level || 'P2', recommendedAction: raw.recommended_action || '', evidence: raw.evidence || '',
    contentType: raw.content_type || 'news', location: raw.location || (region === 'Japan' ? '日本' : 'グローバル'), sector: raw.sector || '業界横断',
    publishedAt: raw.published_at || '', time: relativeTime(raw.published_at || new Date().toISOString()),
    summary: raw.summary_ja || raw.summary || '公式情報源から取得した更新です。', relevanceTags: parseList(raw.relevance_tags),
    url: raw.canonical_url, score: Number(raw.fde_score ?? 0)
  };
}
function formatDate(value?: string | null) {
  if (!value) return '収集中';
  const normalized = /^\d{4}-\d{2}-\d{2} /.test(value) ? `${value.replace(' ', 'T')}Z` : value;
  return new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' }).format(new Date(normalized));
}

function AuthDrawer({ open, user, bookmarkCount, onClose, onAuthenticated, onLogout }: {
  open: boolean; user: User | null; bookmarkCount: number; onClose: () => void;
  onAuthenticated: (user: User, bookmarkIds: string[]) => void; onLogout: () => void;
}) {
  const [mode, setMode] = useState<'login' | 'register'>('login'); const [displayName, setDisplayName] = useState(''); const [message, setMessage] = useState('');
  const [sessions, setSessions] = useState<Session[]>([]); const [showSessions, setShowSessions] = useState(false); const [busy, setBusy] = useState(false);
  useEffect(() => { if (!open) { setMessage(''); setShowSessions(false); } }, [open]);
  async function submit(event: { preventDefault(): void }) {
    event.preventDefault(); setBusy(true); setMessage('');
    try {
      const optionsResponse = await fetch(`/api/auth/passkey/${mode}/options`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ displayName }) });
      const setup = await optionsResponse.json() as { flowId?: string; options?: Parameters<typeof startRegistration>[0]['optionsJSON']; error?: string };
      if (!optionsResponse.ok || !setup.flowId || !setup.options) throw new Error(setup.error || 'パスキーを準備できませんでした。');
      const credential = mode === 'register'
        ? await startRegistration({ optionsJSON: setup.options })
        : await startAuthentication({ optionsJSON: setup.options as Parameters<typeof startAuthentication>[0]['optionsJSON'] });
      const verifyResponse = await fetch(`/api/auth/passkey/${mode}/verify`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ flowId: setup.flowId, response: credential }) });
      const payload = await verifyResponse.json() as { user?: User; bookmarkIds?: string[]; error?: string };
      if (!verifyResponse.ok || !payload.user) throw new Error(payload.error || 'パスキーを確認できませんでした。');
      onAuthenticated(payload.user, payload.bookmarkIds ?? []);
    } catch (error) { setMessage(error instanceof Error ? error.message : '処理に失敗しました。'); }
    finally { setBusy(false); }
  }
  async function loadSessions() { const response = await fetch('/api/auth/sessions'); const payload = await response.json() as { sessions?: Session[] }; setSessions(payload.sessions ?? []); setShowSessions(true); }
  async function revoke(id: string) { await fetch(`/api/auth/sessions/${id}`, { method: 'DELETE' }); const target = sessions.find((item) => item.id === id); if (target?.is_current) onLogout(); else setSessions((items) => items.filter((item) => item.id !== id)); }
  return <><button className={`drawer-scrim ${open ? 'is-visible' : ''}`} onClick={onClose} aria-label="閉じる" /><aside className={`account-drawer ${open ? 'is-open' : ''}`} aria-hidden={!open}>
    <div className="drawer-head"><div><span>ACCOUNT</span><h2>{user ? 'アカウント' : 'FDE Radar に参加'}</h2></div><button onClick={onClose} aria-label="閉じる"><Icon name="close" /></button></div>
    {user ? <div className="account-body">
      <div className="profile-card"><div className="avatar">{user.displayName.slice(0, 1).toUpperCase()}</div><div><b>{user.displayName}</b><span>パスキーで保護されています</span></div></div>
      <div className="account-stat"><span>保存した記事</span><strong>{String(bookmarkCount).padStart(2, '0')}</strong></div>
      <button className="drawer-action" onClick={loadSessions}><Icon name="devices" />ログイン中の端末・セッションを管理<Icon name="chevron" /></button>
      {showSessions && <div className="session-list"><h3>ログイン中のセッション</h3>{sessions.map((session) => <div key={session.id}><div><b>{session.is_current ? 'この端末' : '別の端末'}</b><span>{session.user_agent || 'ブラウザ'} · {formatDate(session.last_seen_at)}</span></div><button onClick={() => revoke(session.id)}>終了</button></div>)}</div>}
      <button className="logout-button" onClick={async () => { await fetch('/api/auth/logout', { method: 'POST' }); onLogout(); }}><Icon name="logout" />ログアウト</button>
    </div> : <div className="auth-body">
      <p>メールアドレスもパスワードも不要です。端末の Face ID、Touch ID、Windows Hello などで安全に保存リストを利用できます。</p>
      <div className="auth-tabs"><button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>ログイン</button><button className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>新規登録</button></div>
      <form onSubmit={submit}>{mode === 'register' && <label>表示名<input required maxLength={40} value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="表示名" /></label>}{message && <div className="form-error">{message}</div>}<button className="auth-submit" disabled={busy}>{busy ? '端末で確認中…' : mode === 'login' ? 'パスキーでログイン' : 'パスキーを作成'}</button></form>
      <small>生体情報は端末の外へ送信されません。FDE Radar は公開鍵だけを保存します。同期型パスキーなら別の端末でも利用できます。</small>
    </div>}
  </aside></>;
}

function SignalRow({ article, saved, selected, onSelect, onSave }: { article: Article; saved: boolean; selected: boolean; onSelect: () => void; onSave: () => void }) {
  return <article className={`intel-row priority-${article.priority.toLowerCase()} ${selected ? 'is-selected' : ''}`}>
    <button className="intel-main" onClick={onSelect} aria-expanded={selected}>
      <span className="priority-badge">{article.priority}</span><div className="intel-content"><div className="intel-meta"><b>{article.source}</b><span>{article.region === 'Japan' ? '日本' : 'Global'}</span><span>{pillarLabels[article.corePillar] || article.corePillar}</span><span>{article.time}</span></div><h3>{article.title}</h3><p>{article.summary}</p><div className="intel-tags">{article.topicLayers.slice(0, 3).map((tag) => <span key={tag}>{tag}</span>)}{article.affectedStack.slice(0, 2).map((tag) => <span className="stack" key={tag}>{tag}</span>)}</div></div>
    </button><button className={`bookmark-button ${saved ? 'is-saved' : ''}`} onClick={onSave} aria-label={saved ? '保存を解除' : '保存する'}><Icon name="bookmark" /></button>
    {selected && <div className="evidence-panel"><div><span>判断</span><strong>{priorityMeta[article.priority].label}</strong><p>{article.recommendedAction || 'この情報は背景理解のために保存し、関連シグナルと合わせて確認します。'}</p></div><div><span>根拠</span><p>{article.evidence || '情報源・内容・公開時刻から自動分類しています。'}</p><small>関連度 {article.score}/100 · {article.contentType}</small></div><a href={article.url} target="_blank" rel="noreferrer" onClick={() => fetch(`/api/articles/${article.id}/open`, { method: 'POST' })}>出典を読む<Icon name="external" size={15} /></a></div>}
  </article>;
}

export default function RadarApp() {
  const [articles, setArticles] = useState<Article[]>([]); const [overview, setOverview] = useState<Overview>({}); const [channel, setChannel] = useState<Channel>('action');
  const [region, setRegion] = useState<Region | 'ALL'>('ALL'); const [pillar, setPillar] = useState('すべて'); const [topic, setTopic] = useState('すべて');
  const [priority, setPriority] = useState<Priority | 'ALL'>('ALL'); const [query, setQuery] = useState(''); const [selected, setSelected] = useState('');
  const [user, setUser] = useState<User | null>(null); const [savedIds, setSavedIds] = useState<string[]>([]); const [drawerOpen, setDrawerOpen] = useState(false);
  const [mobileFilters, setMobileFilters] = useState(false); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  useEffect(() => { fetch('/api/auth/me').then((response) => response.json() as Promise<{ user?: User | null; bookmarkIds?: string[] }>).then((data) => { setUser(data.user ?? null); setSavedIds(data.bookmarkIds ?? []); }).catch(() => undefined); fetch('/api/overview').then((response) => response.json() as Promise<Overview>).then(setOverview).catch(() => undefined); }, []);
  useEffect(() => {
    let active = true; setLoading(true); setError(''); const endpoint = channel === 'saved' ? '/api/bookmarks' : `/api/articles?limit=100&channel=${channel}`;
    fetch(endpoint).then(async (response) => { if (response.status === 401) { setDrawerOpen(true); return { articles: [] }; } if (!response.ok) throw new Error('情報を取得できませんでした。'); return response.json() as Promise<{ articles?: ApiArticle[] }>; }).then((data) => { if (!active) return; const next = (data.articles ?? []).map(fromApi).filter((item): item is Article => Boolean(item)); setArticles(next); setSelected(next[0]?.id ?? ''); }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : '読み込みに失敗しました。'); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; };
  }, [channel, user]);
  const filtered = useMemo(() => articles.filter((article) => {
    const text = `${article.title} ${article.summary} ${article.source} ${article.corePillar} ${article.topicLayers.join(' ')} ${article.affectedStack.join(' ')}`.toLowerCase();
    return (region === 'ALL' || article.region === region) && (pillar === 'すべて' || article.corePillar === pillar) && (topic === 'すべて' || article.topicLayers.includes(topic)) && (priority === 'ALL' || article.priority === priority) && (!query.trim() || text.includes(query.trim().toLowerCase()));
  }), [articles, region, pillar, topic, priority, query]);
  const counts = useMemo(() => (['P0', 'P1', 'P2'] as Priority[]).reduce((map, key) => ({ ...map, [key]: articles.filter((item) => item.priority === key).length }), {} as Record<Priority, number>), [articles]);
  const displayedCount = (key: Priority) => channel === 'action' && region === 'ALL' && pillar === 'すべて' && topic === 'すべて' && !query
    ? Number(overview.counts?.[key.toLowerCase() as 'p0' | 'p1' | 'p2'] ?? counts[key]) : counts[key];
  async function toggleSave(articleId: string) { if (!user) { setDrawerOpen(true); return; } const saved = savedIds.includes(articleId); const response = await fetch(`/api/bookmarks/${articleId}`, { method: saved ? 'DELETE' : 'PUT' }); if (response.ok) setSavedIds((ids) => saved ? ids.filter((id) => id !== articleId) : [articleId, ...ids]); }
  function go(next: Channel, nextRegion: Region | 'ALL' = 'ALL') { setChannel(next); setRegion(nextRegion); setPriority('ALL'); setMobileFilters(false); }
  return <div className="app-shell">
    <header className="topbar"><a className="brand" href="#top"><img src="/icon-192.png" alt="" /><span>FDE <b>RADAR</b></span></a><nav><button className={channel === 'action' && region === 'ALL' ? 'active' : ''} onClick={() => go('action')}>アクション</button><button className={channel === 'action' && region === 'Japan' ? 'active' : ''} onClick={() => go('action', 'Japan')}>日本</button><button className={channel === 'research' ? 'active' : ''} onClick={() => go('research')}>リサーチ</button><button className={channel === 'saved' ? 'active' : ''} onClick={() => go('saved')}>保存済み</button></nav><label className="header-search"><Icon name="search" size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="企業・技術・課題を検索" /></label><button className="account-button" onClick={() => setDrawerOpen(true)}><Icon name="user" size={17} /><span>{user ? user.displayName : 'ログイン'}</span></button></header>
    <main id="top"><section className="workspace-head"><div><span className="overline">FIELD INTELLIGENCE / {channel.toUpperCase()}</span><h1>{channel === 'saved' ? '保存した判断材料' : channel === 'research' ? '背景を理解する' : region === 'Japan' ? '日本のAI導入シグナル' : '今日のフィールド判断'}</h1><p>{channel === 'saved' ? '後で判断したい情報を、優先度ごとに整理しています。' : '顧客・事業への影響を起点に、次に何を確認・検証するかまで整理します。'}</p></div><div className="update-status"><span className="live-dot" />6時間ごとに自動収集<small>最終更新 {formatDate(overview.last_ingested_at)}</small></div></section>
      <section className="priority-board" aria-label="優先度別の状況">{(['P0', 'P1', 'P2'] as Priority[]).map((key) => <button key={key} className={`priority-card ${priority === key ? 'active' : ''} priority-${key.toLowerCase()}`} onClick={() => setPriority(priority === key ? 'ALL' : key)}><span>{key}</span><div><b>{priorityMeta[key].label}</b><small>{priorityMeta[key].short}</small></div><strong>{String(displayedCount(key)).padStart(2, '0')}</strong></button>)}</section>
      <button className="mobile-filter-button" onClick={() => setMobileFilters(!mobileFilters)}><Icon name="menu" />絞り込み</button>
      <section className="intelligence-layout"><aside className={`filter-rail ${mobileFilters ? 'is-open' : ''}`}><div className="filter-group"><span>CORE PILLAR</span>{pillars.map((item) => <button className={pillar === item ? 'active' : ''} onClick={() => setPillar(item)} key={item}>{pillarLabels[item]}</button>)}</div><div className="filter-group"><span>REGION</span>{(['ALL', 'Japan', 'Global'] as const).map((item) => <button className={region === item ? 'active' : ''} onClick={() => setRegion(item)} key={item}>{item === 'ALL' ? 'すべて' : item === 'Japan' ? '日本' : 'グローバル'}</button>)}</div><div className="filter-group topic-filter"><span>TOPIC LAYER</span>{topics.map((item) => <button className={topic === item ? 'active' : ''} onClick={() => setTopic(item)} key={item}>{item}</button>)}</div><div className="saved-summary"><span>保存済み</span><strong>{String(savedIds.length).padStart(2, '0')}</strong><button onClick={() => go('saved')}>一覧を見る</button></div></aside>
        <div className="intel-list"><div className="list-toolbar"><div><b>{filtered.length}</b> 件のシグナル</div><div><span className="legend-p0" />今日対応<span className="legend-p1" />今週検証<span className="legend-p2" />背景学習</div></div>{loading && <div className="empty-state">情報源からシグナルを読み込んでいます…</div>}{!loading && error && <div className="empty-state is-error">{error}</div>}{!loading && !error && filtered.length === 0 && <div className="empty-state"><b>この条件のシグナルはありません。</b><span>絞り込みを変えるか、次回の自動収集をお待ちください。</span></div>}{filtered.map((article) => <SignalRow key={article.id} article={article} saved={savedIds.includes(article.id)} selected={selected === article.id} onSelect={() => setSelected(selected === article.id ? '' : article.id)} onSave={() => toggleSave(article.id)} />)}</div>
      </section></main><footer><div><img src="/icon-192.png" alt="" /><b>FDE RADAR</b><span>現場の判断を、次の行動へ。</span></div><a href="https://github.com/kekincai/fde" target="_blank" rel="noreferrer">公開リポジトリ<Icon name="external" size={13} /></a></footer>
    <AuthDrawer open={drawerOpen} user={user} bookmarkCount={savedIds.length} onClose={() => setDrawerOpen(false)} onAuthenticated={(nextUser, ids) => { setUser(nextUser); setSavedIds(ids); setDrawerOpen(false); }} onLogout={() => { setUser(null); setSavedIds([]); setDrawerOpen(false); setChannel('action'); }} />
  </div>;
}
