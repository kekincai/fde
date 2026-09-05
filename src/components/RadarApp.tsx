import { lazy, Suspense, useEffect, useMemo, useState } from 'react';

import { pillarLabels, pillars, priorityMeta, topics, type Article, type Channel, type Priority, type Region, type SortOrder } from '../data/articles';
import { track, type AnalyticsSection } from '../lib/analytics';
import AuthDrawer from './radar/AuthDrawer';
import AboutFde from './radar/AboutFde';
import Icon, { type IconName } from './radar/Icon';
import KnowledgeMap from './radar/KnowledgeMap';
import { fromApi, type ApiArticle, type CoverageChapter, type Overview, type Pagination, type User } from './radar/model';
import RadarHeader, { type RadarView } from './radar/RadarHeader';
import SignalRow from './radar/SignalRow';

const AdminDashboard = lazy(() => import('./AdminDashboard'));

const emptyPagination: Pagination = { page: 1, pageSize: 10, total: 0, totalPages: 1 };
const sortOptions: Array<{ value: SortOrder; label: string; icon: IconName }> = [
  { value: 'newest', label: '新着', icon: 'clock' },
  { value: 'priority', label: '重要度', icon: 'alert' },
  { value: 'published', label: '公開日', icon: 'calendar' }
];

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
  const [view, setView] = useState<RadarView>('about');

  const section: AnalyticsSection = view === 'admin' ? 'admin' : channel === 'action' && region === 'Japan' ? 'japan' : channel === 'career' ? 'research' : channel;

  useEffect(() => {
    fetch('/api/auth/me').then((response) => response.json() as Promise<{ user?: User | null; bookmarkIds?: string[] }>).then((data) => { setUser(data.user ?? null); setSavedIds(data.bookmarkIds ?? []); }).catch(() => undefined);
    fetch('/api/overview').then((response) => response.json() as Promise<Overview>).then(setOverview).catch(() => undefined);
    fetch('/api/coverage').then((response) => response.json() as Promise<{ chapters?: CoverageChapter[] }>).then((data) => setCoverage(data.chapters ?? [])).catch(() => undefined);
    track('page_view', 'about');
  }, []);

  useEffect(() => {
    if (view === 'admin' && !user?.isAdmin) setView('radar');
  }, [user, view]);

  useEffect(() => {
    if (view !== 'radar') return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError('');
      const params = new URLSearchParams({ page: String(page), pageSize: '10', sort });
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
  }, [channel, chapter, page, pillar, priority, query, region, sort, topic, user, view]);

  const pageNumbers = useMemo(() => {
    const start = Math.max(1, Math.min(page - 2, pagination.totalPages - 4));
    return Array.from({ length: Math.min(5, pagination.totalPages) }, (_, index) => Math.max(1, start) + index);
  }, [page, pagination.totalPages]);

  const workspaceTitle = channel === 'saved'
    ? '保存した判断材料'
    : channel === 'research'
      ? '背景を理解する'
      : region === 'Japan'
        ? '日本のAI導入シグナル'
        : chapter ? coverage.find((item) => item.id === chapter)?.titleJa ?? '収集情報' : '収集情報';
  const workspaceIcon: IconName = channel === 'saved' ? 'bookmark' : channel === 'research' ? 'flask' : region === 'Japan' ? 'mapPin' : 'radar';

  function resetPage() {
    setPage(1);
    setSelected('');
  }

  function scrollToSignals() {
    window.setTimeout(() => document.getElementById('signals')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  }

  function go(next: Channel) {
    setView('radar');
    setChannel(next);
    setRegion('ALL');
    setPriority('ALL');
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
    setView('about');
    setChannel('action');
    setRegion('ALL');
    setPillar('すべて');
    setTopic('すべて');
    setChapter('');
    setPriority('ALL');
    setSort('newest');
    setQuery('');
    setSelected('');
    setDrawerOpen(false);
    setMobileFilters(false);
    setMobileSearchOpen(false);
    setPage(1);
    track('section_view', 'about');
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

  return <div className="app-shell">
    <RadarHeader view={view} channel={channel} query={query} user={user} onHome={returnHome} onAbout={showAbout} onKnowledge={showKnowledge} onChannel={go} onAdmin={showAdmin} onQuery={(value) => { setQuery(value); resetPage(); }} onMobileSearch={() => { setView('radar'); setMobileSearchOpen(true); scrollToSignals(); }} onAccount={() => setDrawerOpen(true)} />

    {view === 'admin' ? <Suspense fallback={<main className="admin-loading">管理データを読み込んでいます…</main>}><AdminDashboard /></Suspense> : view === 'knowledge' ? <main><KnowledgeMap coverage={coverage} selectedChapter={chapter} onSelect={(item) => {
      setChapter(item.id);
      setPillar(item.pillar);
      setChannel('action');
      setView('radar');
      resetPage();
      scrollToSignals();
    }} /></main> : view === 'about' ? <AboutFde overview={overview} onKnowledge={showKnowledge} onSignals={() => go('action')} /> : <main id="top">
      <section id="signals" className="workspace-bar">
        <div className="workspace-heading"><Icon name={workspaceIcon} size={28} /><div><h2>{workspaceTitle}</h2><p>顧客・事業への影響から、次に確認・検証することを読み取れます。</p></div></div>
        <div className="signal-count"><strong>{pagination.total}</strong><span>件のシグナル<small>{page} / {pagination.totalPages} ページ</small></span></div>
      </section>

      <section className={`scope-bar ${channel === 'saved' ? 'saved-scope' : ''}`} aria-label="表示する情報の範囲">
        {channel !== 'saved' && <div className="scope-control" role="group" aria-label="情報の種類"><span><Icon name="layers" size={15} />情報の種類</span><button className={channel === 'action' ? 'active' : ''} onClick={() => go('action')}><Icon name="radar" size={16} />実務シグナル</button><button className={channel === 'research' ? 'active' : ''} onClick={() => go('research')}><Icon name="flask" size={16} />リサーチ</button></div>}
        <div className="scope-control region-scope" role="group" aria-label="対象地域"><span><Icon name="world" size={15} />対象地域</span><button className={region === 'ALL' ? 'active' : ''} onClick={() => chooseRegion('ALL')}><Icon name="world" size={16} />全地域</button><button className={region === 'Japan' ? 'active' : ''} onClick={() => chooseRegion('Japan')}><Icon name="mapPin" size={16} />日本</button><button className={region === 'Global' ? 'active' : ''} onClick={() => chooseRegion('Global')}><Icon name="map" size={16} />グローバル</button></div>
      </section>

      {mobileSearchOpen && <label className="mobile-search-field"><Icon name="search" size={17} /><input autoFocus value={query} onChange={(event) => { setQuery(event.target.value); resetPage(); }} placeholder="企業・技術・課題を検索" /><button type="button" onClick={() => { setMobileSearchOpen(false); setQuery(''); resetPage(); }} aria-label="検索を閉じる"><Icon name="close" size={16} /></button></label>}

      <section className="control-bar" aria-label="一覧の表示設定">
        <div className="sort-control" role="group" aria-label="並び順">{sortOptions.map((option) => <button key={option.value} className={sort === option.value ? 'active' : ''} onClick={() => { setSort(option.value); resetPage(); }}><Icon name={option.icon} size={15} />{option.label}</button>)}</div>
        <div className="priority-control" role="group" aria-label="優先度">{(['P0', 'P1', 'P2'] as Priority[]).map((key) => <button key={key} className={`${priority === key ? 'active' : ''} priority-${key.toLowerCase()}`} onClick={() => { setPriority(priority === key ? 'ALL' : key); resetPage(); }}><span>{key}</span>{priorityMeta[key].label}<b>{Number(overview.counts?.[key.toLowerCase() as 'p0' | 'p1' | 'p2'] ?? 0)}</b></button>)}</div>
        <button className="mobile-filter-button" onClick={() => setMobileFilters(!mobileFilters)} aria-expanded={mobileFilters}><Icon name="filter" />フィルター</button>
      </section>

      <section className="intelligence-layout">
        <aside className={`filter-rail ${mobileFilters ? 'is-open' : ''}`}>
          <div className="filter-group"><span><Icon name="target" size={15} />FDEの観点</span>{pillars.map((item) => <button className={pillar === item ? 'active' : ''} onClick={() => { setPillar(item); setChapter(''); resetPage(); }} key={item}>{pillarLabels[item]}</button>)}</div>
          {chapter && <div className="active-chapter"><span>選択中の問い</span><b>{coverage.find((item) => item.id === chapter)?.titleJa}</b><button onClick={() => { setChapter(''); setPillar('すべて'); resetPage(); }}>解除</button></div>}
          <div className="filter-group topic-filter"><span><Icon name="tags" size={15} />テーマ</span>{topics.map((item) => <button className={topic === item ? 'active' : ''} onClick={() => { setTopic(item); resetPage(); }} key={item}>{item}</button>)}</div>
          <button className="knowledge-link" onClick={showKnowledge}><Icon name="map" size={16} />24の問いを開く<Icon name="chevron" size={14} /></button>
        </aside>

        <div className="intel-list">
          <div className="list-toolbar"><span><Icon name={sort === 'newest' ? 'clock' : sort === 'published' ? 'calendar' : 'alert'} size={15} />{sort === 'newest' ? '初回収集が新しい順' : sort === 'published' ? '情報源の公開日が新しい順' : 'P0・P1・P2と重要度スコア順'}</span>{priority !== 'ALL' && <button onClick={() => { setPriority('ALL'); resetPage(); }}>{priority}を解除</button>}</div>
          {loading && <div className="empty-state"><Icon name="activity" size={24} /><span>情報源からシグナルを読み込んでいます…</span></div>}
          {!loading && error && <div className="empty-state is-error"><Icon name="alert" size={24} /><span>{error}</span></div>}
          {!loading && !error && articles.length === 0 && <div className="empty-state"><Icon name="inbox" size={28} /><b>この条件のシグナルはありません。</b><span>絞り込みを変えるか、次回の自動収集をお待ちください。</span></div>}
          {articles.map((article) => <SignalRow key={article.id} article={article} sort={sort} section={section} saved={savedIds.includes(article.id)} selected={selected === article.id} onSelect={() => selectArticle(article)} onSave={() => toggleSave(article.id)} />)}
          {pagination.totalPages > 1 && <nav className="pagination" aria-label="ページ送り"><button aria-label="前のページ" disabled={page === 1} onClick={() => { setPage(page - 1); scrollToSignals(); }}><Icon name="arrowLeft" size={15} /><span>前へ</span></button>{pageNumbers.map((number) => <button key={number} className={page === number ? 'active' : ''} onClick={() => { setPage(number); scrollToSignals(); }}>{number}</button>)}<button aria-label="次のページ" disabled={page === pagination.totalPages} onClick={() => { setPage(page + 1); scrollToSignals(); }}><span>次へ</span><Icon name="arrowRight" size={15} /></button></nav>}
        </div>
      </section>
    </main>}

    <footer><div><img src="/icon-192.png" alt="" /><b>FDE RADAR</b><span>AIを、現場で使える成果へ。</span></div><a href="https://github.com/kekincai/fde" target="_blank" rel="noreferrer">公開リポジトリ<Icon name="external" size={14} /></a></footer>
    <AuthDrawer open={drawerOpen} user={user} bookmarkCount={savedIds.length} onClose={() => setDrawerOpen(false)} onAuthenticated={(nextUser, ids) => { setUser(nextUser); setSavedIds(ids); setDrawerOpen(false); }} onLogout={() => { setUser(null); setSavedIds([]); setDrawerOpen(false); setChannel('action'); setView('radar'); }} onAdmin={showAdmin} />
  </div>;
}
