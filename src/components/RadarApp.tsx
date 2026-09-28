import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';

import { pillarLabels, pillars, priorityMeta, topics, type Article, type Channel, type Priority, type Region, type SortOrder } from '../data/articles';
import { track, type AnalyticsSection } from '../lib/analytics';
import AuthDrawer from './radar/AuthDrawer';
import AboutFde from './radar/AboutFde';
import Icon from './radar/Icon';
import KnowledgeMap from './radar/KnowledgeMap';
import { formatDate, fromApi, type ApiArticle, type CoverageChapter, type Overview, type Pagination, type User } from './radar/model';
import RadarHeader, { type RadarView } from './radar/RadarHeader';
import SignalRow from './radar/SignalRow';

const AdminDashboard = lazy(() => import('./AdminDashboard'));

const emptyPagination: Pagination = { page: 1, pageSize: 10, total: 0, totalPages: 1 };
const sortOptions: Array<{ value: SortOrder; label: string }> = [
  { value: 'newest', label: '新着順' },
  { value: 'priority', label: '優先度順' },
  { value: 'published', label: '公開日順' }
];
const viewParams: Record<RadarView, string> = { radar: '', about: 'about', knowledge: 'map', admin: 'admin' };

type UrlState = {
  view: RadarView;
  channel: Channel;
  region: Region | 'ALL';
  pillar: string;
  topic: string;
  chapter: string;
  priority: Priority | 'ALL';
  sort: SortOrder;
  query: string;
  page: number;
};

function readUrl(): UrlState {
  const params = new URLSearchParams(window.location.search);
  const view = (Object.keys(viewParams) as RadarView[]).find((key) => viewParams[key] === (params.get('v') ?? '')) ?? 'radar';
  const channel = params.get('ch');
  const region = params.get('region');
  const priority = params.get('p');
  const sort = params.get('sort');
  const pillar = params.get('pillar') ?? '';
  const topic = params.get('topic') ?? '';
  return {
    view,
    channel: channel === 'research' || channel === 'saved' ? channel : 'action',
    region: region === 'Japan' || region === 'Global' ? region : 'ALL',
    pillar: pillars.includes(pillar) ? pillar : 'すべて',
    topic: topics.includes(topic) ? topic : 'すべて',
    chapter: params.get('chapter') ?? '',
    priority: priority === 'P0' || priority === 'P1' || priority === 'P2' ? priority : 'ALL',
    sort: sort === 'priority' || sort === 'published' ? sort : 'newest',
    query: params.get('q') ?? '',
    page: Math.max(1, Number(params.get('page')) || 1)
  };
}

function writeUrl(state: UrlState): string {
  const params = new URLSearchParams();
  if (viewParams[state.view]) params.set('v', viewParams[state.view]);
  if (state.view === 'radar') {
    if (state.channel !== 'action') params.set('ch', state.channel);
    if (state.region !== 'ALL') params.set('region', state.region);
    if (state.pillar !== 'すべて') params.set('pillar', state.pillar);
    if (state.topic !== 'すべて') params.set('topic', state.topic);
    if (state.chapter) params.set('chapter', state.chapter);
    if (state.priority !== 'ALL') params.set('p', state.priority);
    if (state.sort !== 'newest') params.set('sort', state.sort);
    if (state.query.trim()) params.set('q', state.query.trim());
    if (state.page > 1) params.set('page', String(state.page));
  }
  const search = params.toString();
  return search ? `?${search}` : window.location.pathname;
}

export default function RadarApp() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [overview, setOverview] = useState<Overview>({});
  const [coverage, setCoverage] = useState<CoverageChapter[]>([]);
  const [channel, setChannel] = useState<Channel>('action');
  const [region, setRegion] = useState<Region | 'ALL'>('ALL');
  const [pillar, setPillar] = useState('すべて');
  const [topic, setTopic] = useState('すべて');
  const [chapter, setChapter] = useState('');
  const [priority, setPriority] = useState<Priority | 'ALL'>('ALL');
  const [sort, setSort] = useState<SortOrder>('newest');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mobileFilters, setMobileFilters] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<Pagination>(emptyPagination);
  const [view, setView] = useState<RadarView>('radar');
  const [urlReady, setUrlReady] = useState(false);
  const lastView = useRef<RadarView>('radar');

  const section: AnalyticsSection = view === 'admin' ? 'admin' : view === 'about' ? 'about' : channel === 'action' && region === 'Japan' ? 'japan' : channel === 'career' ? 'research' : channel;

  function applyUrl(state: UrlState) {
    lastView.current = state.view;
    setView(state.view);
    setChannel(state.channel);
    setRegion(state.region);
    setPillar(state.pillar);
    setTopic(state.topic);
    setChapter(state.chapter);
    setPriority(state.priority);
    setSort(state.sort);
    setQuery(state.query);
    setPage(state.page);
    setSelected('');
  }

  useEffect(() => {
    const initial = readUrl();
    applyUrl(initial);
    setUrlReady(true);
    fetch('/api/auth/me').then((response) => response.json() as Promise<{ user?: User | null; bookmarkIds?: string[] }>).then((data) => {
      setUser(data.user ?? null);
      setSavedIds(data.bookmarkIds ?? []);
      if (!data.user?.isAdmin) setView((current) => current === 'admin' ? 'radar' : current);
    }).catch(() => setView((current) => current === 'admin' ? 'radar' : current));
    fetch('/api/overview').then((response) => response.json() as Promise<Overview>).then(setOverview).catch(() => undefined);
    fetch('/api/coverage').then((response) => response.json() as Promise<{ chapters?: CoverageChapter[] }>).then((data) => setCoverage(data.chapters ?? [])).catch(() => undefined);
    track('page_view', initial.view === 'about' ? 'about' : initial.view === 'admin' ? 'admin' : 'action');
    const onPop = () => applyUrl(readUrl());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Keep filters in the URL so views can be shared and the back button works between views.
  useEffect(() => {
    if (!urlReady) return;
    const next = writeUrl({ view, channel, region, pillar, topic, chapter, priority, sort, query, page });
    if (next === (window.location.search || window.location.pathname)) return;
    if (view !== lastView.current) window.history.pushState(null, '', next);
    else window.history.replaceState(null, '', next);
    lastView.current = view;
  }, [urlReady, view, channel, region, pillar, topic, chapter, priority, sort, query, page]);

  useEffect(() => {
    if (view === 'admin' && user && !user.isAdmin) setView('radar');
  }, [user, view]);

  useEffect(() => {
    if (view !== 'radar' || !urlReady) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError('');
      const params = new URLSearchParams({ page: String(page), pageSize: '20', sort });
      if (channel !== 'saved') params.set('channel', channel);
      if (region !== 'ALL') params.set('region', region);
      if (pillar !== 'すべて') params.set('pillar', pillar);
      if (topic !== 'すべて') params.set('layer', topic);
      if (chapter) params.set('chapter', chapter);
      if (priority !== 'ALL') params.set('priority', priority);
      if (query.trim()) params.set('q', query.trim());
      const endpoint = channel === 'saved' ? `/api/bookmarks?${params}` : `/api/articles?${params}`;
      fetch(endpoint, { signal: controller.signal }).then(async (response) => {
        if (response.status === 401) {
          setDrawerOpen(true);
          return { articles: [], pagination: emptyPagination };
        }
        if (!response.ok) throw new Error('情報を取得できませんでした。');
        return response.json() as Promise<{ articles?: ApiArticle[]; pagination?: Pagination }>;
      }).then((data) => {
        const next = (data.articles ?? []).map(fromApi).filter((item): item is Article => Boolean(item));
        setArticles(next);
        setPagination(data.pagination ?? { ...emptyPagination, total: next.length });
        setSelected('');
      }).catch((reason) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return;
        setError(reason instanceof Error ? reason.message : '読み込みに失敗しました。');
      }).finally(() => setLoading(false));
    }, query ? 280 : 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [channel, chapter, page, pillar, priority, query, region, sort, topic, user, view, urlReady]);

  const pageNumbers = useMemo(() => {
    const start = Math.max(1, Math.min(page - 2, pagination.totalPages - 4));
    return Array.from({ length: Math.min(5, pagination.totalPages) }, (_, index) => Math.max(1, start) + index);
  }, [page, pagination.totalPages]);

  const chapterTitle = chapter ? coverage.find((item) => item.id === chapter)?.titleJa ?? chapter : '';
  const workspaceTitle = channel === 'saved' ? '保存済み' : channel === 'research' ? 'リサーチ' : '収集情報';

  const activeFilters: Array<{ key: string; label: string; clear: () => void }> = [
    ...(chapterTitle ? [{ key: 'chapter', label: `問い: ${chapterTitle}`, clear: () => { setChapter(''); setPillar('すべて'); resetPage(); } }] : []),
    ...(pillar !== 'すべて' && !chapter ? [{ key: 'pillar', label: `観点: ${pillarLabels[pillar]}`, clear: () => { setPillar('すべて'); resetPage(); } }] : []),
    ...(topic !== 'すべて' ? [{ key: 'topic', label: `テーマ: ${topic}`, clear: () => { setTopic('すべて'); resetPage(); } }] : []),
    ...(priority !== 'ALL' ? [{ key: 'priority', label: `${priority} ${priorityMeta[priority].label}`, clear: () => { setPriority('ALL'); resetPage(); } }] : []),
    ...(query.trim() ? [{ key: 'q', label: `「${query.trim()}」`, clear: () => { setQuery(''); resetPage(); } }] : [])
  ];

  function resetPage() {
    setPage(1);
    setSelected('');
  }

  function clearFilters() {
    setPillar('すべて');
    setTopic('すべて');
    setChapter('');
    setPriority('ALL');
    setQuery('');
    resetPage();
  }

  function scrollToSignals() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function go(next: Channel) {
    setView('radar');
    setChannel(next);
    setChapter('');
    setMobileFilters(false);
    setPage(1);
    track('section_view', next === 'career' ? 'research' : next);
    scrollToSignals();
  }

  function chooseRegion(next: Region | 'ALL') {
    setRegion(next);
    resetPage();
    track('section_view', next === 'Japan' ? 'japan' : channel === 'research' ? 'research' : 'action');
  }

  function returnHome() {
    setView('radar');
    setChannel('action');
    setRegion('ALL');
    clearFilters();
    setSort('newest');
    setDrawerOpen(false);
    setMobileFilters(false);
    setMobileSearchOpen(false);
    track('section_view', 'action');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function showAbout() {
    setView('about');
    setDrawerOpen(false);
    track('section_view', 'about');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function showKnowledge() {
    setView('knowledge');
    track('section_view', 'research');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function showAdmin() {
    setView('admin');
    setDrawerOpen(false);
    track('section_view', 'admin');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function toggleSave(articleId: string) {
    if (!user) {
      setDrawerOpen(true);
      return;
    }
    const saved = savedIds.includes(articleId);
    const response = await fetch(`/api/bookmarks/${articleId}`, { method: saved ? 'DELETE' : 'PUT' });
    if (response.ok) {
      setSavedIds((ids) => saved ? ids.filter((id) => id !== articleId) : [articleId, ...ids]);
      if (saved && channel === 'saved') setArticles((items) => items.filter((item) => item.id !== articleId));
    }
  }

  function selectArticle(article: Article) {
    const opening = selected !== article.id;
    setSelected(opening ? article.id : '');
    if (opening) track('article_open', section, article.id);
  }

  function onQuery(value: string) {
    if (view !== 'radar') setView('radar');
    setQuery(value);
    resetPage();
  }

  return <div className="app-shell">
    <RadarHeader view={view} channel={channel} query={query} user={user} onHome={returnHome} onAbout={showAbout} onKnowledge={showKnowledge} onChannel={go} onAdmin={showAdmin} onQuery={onQuery} onMobileSearch={() => { setView('radar'); setMobileSearchOpen(true); scrollToSignals(); }} onAccount={() => setDrawerOpen(true)} />

    {view === 'admin' ? <Suspense fallback={<main className="admin-loading">管理データを読み込んでいます…</main>}><AdminDashboard /></Suspense> : view === 'knowledge' ? <main><KnowledgeMap coverage={coverage} selectedChapter={chapter} onSelect={(item) => {
      setChapter(item.id);
      setPillar(item.pillar);
      setTopic('すべて');
      setChannel('action');
      setView('radar');
      resetPage();
      scrollToSignals();
    }} /></main> : view === 'about' ? <AboutFde overview={overview} onKnowledge={showKnowledge} onSignals={() => go('action')} /> : <main id="top" className="signals-page">
      <section id="signals" className="signals-head">
        <div className="signals-title">
          <h1>{workspaceTitle}</h1>
          <span>{loading ? '読み込み中…' : `${pagination.total}件`}{overview.last_ingested_at && channel !== 'saved' ? ` · 最終収集 ${formatDate(overview.last_ingested_at)}` : ''}</span>
        </div>
        {channel !== 'saved' && <div className="tab-control" role="group" aria-label="情報の種類"><button className={channel === 'action' ? 'active' : ''} onClick={() => go('action')}>実務シグナル</button><button className={channel === 'research' ? 'active' : ''} onClick={() => go('research')}>リサーチ</button></div>}
      </section>

      {mobileSearchOpen && <label className="mobile-search-field"><Icon name="search" size={17} /><input autoFocus value={query} onChange={(event) => onQuery(event.target.value)} placeholder="企業・技術・課題を検索" /><button type="button" onClick={() => { setMobileSearchOpen(false); setQuery(''); resetPage(); }} aria-label="検索を閉じる"><Icon name="close" size={16} /></button></label>}

      <section className="control-bar" aria-label="一覧の表示設定">
        <div className="seg-control" role="group" aria-label="対象地域">{([['ALL', 'すべて'], ['Japan', '日本'], ['Global', 'グローバル']] as const).map(([value, label]) => <button key={value} className={region === value ? 'active' : ''} onClick={() => chooseRegion(value)}>{label}</button>)}</div>
        <div className="priority-control" role="group" aria-label="優先度">{(['P0', 'P1', 'P2'] as Priority[]).map((key) => <button key={key} className={`${priority === key ? 'active' : ''} priority-${key.toLowerCase()}`} title={priorityMeta[key].description} aria-pressed={priority === key} onClick={() => { setPriority(priority === key ? 'ALL' : key); resetPage(); }}><span>{key}</span>{priorityMeta[key].label}<b>{Number(overview.counts?.[key.toLowerCase() as 'p0' | 'p1' | 'p2'] ?? 0)}</b></button>)}</div>
        <label className="sort-select"><span className="visually-hidden">並び順</span><select value={sort} onChange={(event) => { setSort(event.target.value as SortOrder); resetPage(); }}>{sortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <button className="mobile-filter-button" onClick={() => setMobileFilters(!mobileFilters)} aria-expanded={mobileFilters}><Icon name="filter" size={15} />絞り込み</button>
      </section>

      {activeFilters.length > 0 && <div className="active-filters">{activeFilters.map((filter) => <button key={filter.key} onClick={filter.clear} aria-label={`${filter.label} を解除`}>{filter.label}<Icon name="close" size={12} /></button>)}{activeFilters.length > 1 && <button className="clear-all" onClick={clearFilters}>すべて解除</button>}</div>}

      <section className="intelligence-layout">
        <aside className={`filter-rail ${mobileFilters ? 'is-open' : ''}`}>
          <div className="filter-group"><span>観点</span>{pillars.map((item) => <button className={pillar === item && !chapter ? 'active' : ''} onClick={() => { setPillar(item); setChapter(''); resetPage(); }} key={item}>{pillarLabels[item]}</button>)}</div>
          <div className="filter-group topic-filter"><span>テーマ</span>{topics.map((item) => <button className={topic === item ? 'active' : ''} onClick={() => { setTopic(item); resetPage(); }} key={item}>{item}</button>)}</div>
          <button className="knowledge-link" onClick={showKnowledge}>24の問いから探す<Icon name="chevron" size={13} /></button>
        </aside>

        <div className="intel-list">
          {loading && articles.length === 0 && <div className="empty-state"><span>読み込み中…</span></div>}
          {!loading && error && <div className="empty-state is-error"><Icon name="alert" size={20} /><span>{error}</span></div>}
          {!loading && !error && articles.length === 0 && <div className="empty-state"><b>{channel === 'saved' ? 'まだ保存した記事はありません。' : 'この条件に一致する記事はありません。'}</b>{activeFilters.length > 0 && <button onClick={clearFilters}>絞り込みを解除する</button>}</div>}
          <div className={loading ? 'list-body is-loading' : 'list-body'}>{articles.map((article) => <SignalRow key={article.id} article={article} sort={sort} section={section} saved={savedIds.includes(article.id)} selected={selected === article.id} onSelect={() => selectArticle(article)} onSave={() => toggleSave(article.id)} />)}</div>
          {pagination.totalPages > 1 && <nav className="pagination" aria-label="ページ送り"><button aria-label="前のページ" disabled={page === 1} onClick={() => { setPage(page - 1); scrollToSignals(); }}><Icon name="arrowLeft" size={14} /><span>前へ</span></button>{pageNumbers.map((number) => <button key={number} className={page === number ? 'active' : ''} onClick={() => { setPage(number); scrollToSignals(); }}>{number}</button>)}<button aria-label="次のページ" disabled={page === pagination.totalPages} onClick={() => { setPage(page + 1); scrollToSignals(); }}><span>次へ</span><Icon name="arrowRight" size={14} /></button></nav>}
        </div>
      </section>
    </main>}

    <footer><div><b>FDE RADAR</b><span>AI導入の一次情報を収集・分類 · 要約と分類は自動生成</span></div><button type="button" className="footer-link" onClick={showAbout}>このサイトについて</button><a href="https://github.com/kekincai/fde" target="_blank" rel="noreferrer">GitHub<Icon name="external" size={13} /></a></footer>
    <AuthDrawer open={drawerOpen} user={user} bookmarkCount={savedIds.length} onClose={() => setDrawerOpen(false)} onAuthenticated={(nextUser, ids) => { setUser(nextUser); setSavedIds(ids); setDrawerOpen(false); }} onLogout={() => { setUser(null); setSavedIds([]); setDrawerOpen(false); setChannel('action'); setView('radar'); }} onAdmin={showAdmin} />
  </div>;
}
