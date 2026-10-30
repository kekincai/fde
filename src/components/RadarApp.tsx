import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';

import type { Article, Channel } from '../data/articles';
import { track, type AnalyticsSection } from '../lib/analytics';
import AboutFde from './radar/AboutFde';
import AuthDrawer from './radar/AuthDrawer';
import { AccountButton, Brand, LiveStatus, PrimaryNav, Sheet } from './radar/Chrome';
import FilterPanel from './radar/FilterPanel';
import KnowledgeMap from './radar/KnowledgeMap';
import type { CoverageChapter, Overview, User } from './radar/model';
import SignalDetail from './radar/SignalDetail';
import SignalList from './radar/SignalList';
import { useArticles } from './radar/useArticles';
import { defaultState, useRadarState, type RadarView } from './radar/useRadarState';

const AdminDashboard = lazy(() => import('./AdminDashboard'));

function isTyping(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
}

export default function RadarApp() {
  const { state, update, ready } = useRadarState();
  const [overview, setOverview] = useState<Overview>({});
  const [coverage, setCoverage] = useState<CoverageChapter[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const { view, channel } = state;
  const { articles, setArticles, pagination, loading, error } = useArticles(state, {
    enabled: ready && view === 'radar',
    userKey: user?.id ?? '',
    onUnauthorized: () => setDrawerOpen(true)
  });
  const selected = articles.find((article) => article.id === selectedId) ?? null;
  const section: AnalyticsSection = view === 'admin' ? 'admin' : view === 'about' ? 'about' : channel === 'saved' ? 'saved' : channel === 'research' || channel === 'career' ? 'research' : state.region === 'Japan' ? 'japan' : 'action';

  useEffect(() => {
    const leaveAdmin = () => update({ view: 'radar' });
    fetch('/api/auth/me').then((response) => response.json() as Promise<{ user?: User | null; bookmarkIds?: string[] }>).then((data) => {
      setUser(data.user ?? null);
      setSavedIds(data.bookmarkIds ?? []);
      if (!data.user?.isAdmin && new URLSearchParams(window.location.search).get('v') === 'admin') leaveAdmin();
    }).catch(() => undefined);
    fetch('/api/overview').then((response) => response.json() as Promise<Overview>).then(setOverview).catch(() => undefined);
    fetch('/api/coverage').then((response) => response.json() as Promise<{ chapters?: CoverageChapter[] }>).then((data) => setCoverage(data.chapters ?? [])).catch(() => undefined);
  }, [update]);

  useEffect(() => {
    if (ready) track('page_view', section);
    // Only the first resolved view counts as a page view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Drop a selection that is no longer on the current page.
  useEffect(() => {
    if (selectedId && !loading && !articles.some((article) => article.id === selectedId)) setSelectedId('');
  }, [articles, loading, selectedId]);

  const scrollTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  const showView = useCallback((next: RadarView) => {
    update({ view: next });
    setDrawerOpen(false);
    setFiltersOpen(false);
    track('section_view', next === 'knowledge' ? 'research' : next === 'radar' ? 'action' : next);
    scrollTop();
  }, [update]);

  const showChannel = useCallback((next: Channel) => {
    update({ view: 'radar', channel: next, chapter: '' });
    setFiltersOpen(false);
    track('section_view', next === 'saved' ? 'saved' : next === 'research' || next === 'career' ? 'research' : 'action');
    scrollTop();
  }, [update]);

  const goHome = () => {
    update({ ...defaultState });
    setSelectedId('');
    setDrawerOpen(false);
    scrollTop();
  };

  const selectArticle = useCallback((article: Article) => {
    setSelectedId(article.id);
    track('article_open', section, article.id);
  }, [section]);

  const openSource = useCallback((article: Article) => {
    void fetch(`/api/articles/${article.id}/open`, { method: 'POST' });
    track('source_click', section, article.id);
  }, [section]);

  const toggleSave = useCallback(async (article: Article) => {
    if (!user) {
      setDrawerOpen(true);
      return;
    }
    const saved = savedIds.includes(article.id);
    const response = await fetch(`/api/bookmarks/${article.id}`, { method: saved ? 'DELETE' : 'PUT' });
    if (!response.ok) return;
    setSavedIds((ids) => saved ? ids.filter((id) => id !== article.id) : [article.id, ...ids]);
    if (saved && channel === 'saved') setArticles((items) => items.filter((item) => item.id !== article.id));
  }, [channel, savedIds, setArticles, user]);

  // Reader shortcuts: j/k move, o opens the source, s saves, / searches, Esc closes.
  useEffect(() => {
    if (view !== 'radar') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === 'Escape') {
        if (isTyping(event.target)) (event.target as HTMLElement).blur();
        else setSelectedId('');
        return;
      }
      if (isTyping(event.target) || drawerOpen) return;
      const index = articles.findIndex((article) => article.id === selectedId);
      if (event.key === '/') {
        event.preventDefault();
        searchRef.current?.focus();
      } else if (event.key === 'j' || event.key === 'k') {
        const next = articles[event.key === 'j' ? Math.min(articles.length - 1, index + 1) : Math.max(0, index - 1)];
        if (!next) return;
        selectArticle(next);
        document.querySelector(`[data-article="${next.id}"]`)?.scrollIntoView({ block: 'nearest' });
      } else if ((event.key === 'o' || event.key === 'Enter') && selected && !(event.target instanceof HTMLButtonElement)) {
        openSource(selected);
        window.open(selected.url, '_blank', 'noopener');
      } else if (event.key === 's' && selected) {
        void toggleSave(selected);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [articles, drawerOpen, openSource, selectArticle, selected, selectedId, toggleSave, view]);

  const nav = <PrimaryNav view={view} channel={channel} user={user} savedCount={savedIds.length} onChannel={showChannel} onView={showView} />;
  const filters = <FilterPanel state={state} overview={overview} onChange={update} onKnowledge={() => showView('knowledge')} />;

  let content;
  if (view === 'admin') content = <Suspense fallback={<div className="notice">管理データを読み込んでいます…</div>}><AdminDashboard /></Suspense>;
  else if (view === 'knowledge') content = <KnowledgeMap coverage={coverage} selectedChapter={state.chapter} onSelect={(item) => { update({ view: 'radar', channel: 'action', chapter: item.id, pillar: item.pillar, topic: 'すべて' }); scrollTop(); }} />;
  else if (view === 'about') content = <AboutFde overview={overview} onKnowledge={() => showView('knowledge')} onSignals={() => showChannel('action')} />;
  else content = <SignalList ref={searchRef} state={state} articles={articles} pagination={pagination} loading={loading} error={error} coverage={coverage} selectedId={selectedId} savedIds={savedIds} onChange={(patch) => { update(patch); if ('page' in patch) scrollTop(); }} onSelect={selectArticle} onSave={toggleSave} onOpenFilters={() => setFiltersOpen(true)} />;

  return <div className={`app view-${view}`}>
    <aside className="sidebar">
      <Brand onHome={goHome} />
      <LiveStatus lastIngestedAt={overview.last_ingested_at} />
      {nav}
      {view === 'radar' && filters}
      <div className="sidebar-foot"><AccountButton user={user} onClick={() => setDrawerOpen(true)} /></div>
    </aside>

    <header className="topbar">
      <Brand onHome={goHome} compact />
      {nav}
      <AccountButton user={user} onClick={() => setDrawerOpen(true)} />
    </header>

    <div className="workspace">
      <main className="main" id="top">
        {content}
        <footer className="site-foot">
          <span>FDE RADAR · 一次情報の収集と分類。要約と分類は自動生成です。</span>
          <a href="https://github.com/kekincai/fde" target="_blank" rel="noreferrer">GitHub</a>
        </footer>
      </main>
      {view === 'radar' && <SignalDetail article={selected} saved={selected ? savedIds.includes(selected.id) : false} onClose={() => setSelectedId('')} onSave={() => selected && void toggleSave(selected)} onOpenSource={() => selected && openSource(selected)} />}
    </div>
    {view === 'radar' && <button className={`scrim detail-scrim ${selected ? 'is-visible' : ''}`} onClick={() => setSelectedId('')} aria-label="詳細を閉じる" tabIndex={selected ? 0 : -1} />}

    <Sheet open={filtersOpen} title="絞り込み" onClose={() => setFiltersOpen(false)}>{filters}</Sheet>
    <AuthDrawer open={drawerOpen} user={user} bookmarkCount={savedIds.length} onClose={() => setDrawerOpen(false)} onAuthenticated={(nextUser, ids) => { setUser(nextUser); setSavedIds(ids); setDrawerOpen(false); }} onLogout={() => { setUser(null); setSavedIds([]); setDrawerOpen(false); update({ view: 'radar', channel: 'action' }); }} onAdmin={() => showView('admin')} />
  </div>;
}
