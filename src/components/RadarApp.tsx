import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Article, Channel } from '../data/articles';
import { track, type AnalyticsSection } from '../lib/analytics';
import AboutFde from './radar/AboutFde';
import AuthDrawer from './radar/AuthDrawer';
import FrontPage from './radar/FrontPage';
import { fromApi, type ApiArticle, type CoverageChapter, type Overview, type User } from './radar/model';
import { byScore } from './radar/typeset';
import { installPrintFit } from './radar/print';
import { PaperHeader, PaperProvider, SiteFooter, type PaperContextValue, type Section } from './radar/Paper';
import QuestionsPage from './radar/QuestionsPage';
import StoryPage from './radar/StoryPage';
import { useArticles } from './radar/useArticles';
import { defaultState, urlFor, useRadarState, type RadarState, type RadarView } from './radar/useRadarState';

const AdminDashboard = lazy(() => import('./AdminDashboard'));

function isTyping(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
}

const scrollTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

/** Scrolls to an anchor once it has rendered (sections load their data on their own). */
function scrollToId(id: string, tries = 20) {
  const element = document.getElementById(id);
  if (element) element.scrollIntoView({ behavior: 'smooth', block: 'start' });
  else if (tries > 0) window.setTimeout(() => scrollToId(id, tries - 1), 100);
}

/** Direct links to 二面 (`?a=<id>`) that are not on the loaded page. */
async function findArticle(id: string, signal: AbortSignal): Promise<Article | null> {
  const response = await fetch(`/api/articles/${encodeURIComponent(id)}`, { signal });
  if (!response.ok) return null;
  const data = await response.json() as { article?: ApiArticle | null };
  return data.article ? fromApi(data.article) : null;
}

export default function RadarApp() {
  const { state, update, ready } = useRadarState();
  const [overview, setOverview] = useState<Overview>({});
  const [coverage, setCoverage] = useState<CoverageChapter[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [lookup, setLookup] = useState<{ id: string; article: Article | null; loading: boolean }>({ id: '', article: null, loading: false });
  const searchRef = useRef<HTMLInputElement>(null);
  // Every article the reader has seen, so any headline can open 二面 without a refetch.
  const seen = useRef(new Map<string, Article>());

  const { view, channel } = state;
  const onStory = view === 'radar' && Boolean(state.article);
  const { articles, setArticles, pagination, loading, error } = useArticles(state, {
    enabled: ready && (view === 'radar' || view === 'knowledge'),
    userKey: user?.id ?? '',
    onUnauthorized: () => setDrawerOpen(true)
  });
  articles.forEach((article) => seen.current.set(article.id, article));
  const selected = articles.find((article) => article.id === selectedId) ?? null;
  const section: AnalyticsSection = view === 'admin' ? 'admin' : view === 'about' ? 'about' : channel === 'saved' ? 'saved' : channel === 'research' || channel === 'career' ? 'research' : state.region === 'Japan' ? 'japan' : 'action';

  const story = onStory ? seen.current.get(state.article) ?? (lookup.id === state.article ? lookup.article : null) : null;

  useEffect(() => installPrintFit(), []);

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

  // A 二面 link opened directly: fetch that one article unless it is already known.
  // Only the article id drives this effect, so recording the lookup does not cancel it.
  useEffect(() => {
    const id = state.article;
    if (!onStory || seen.current.has(id)) return;
    const controller = new AbortController();
    setLookup({ id, article: null, loading: true });
    findArticle(id, controller.signal)
      .then((article) => setLookup({ id, article, loading: false }))
      .catch(() => { if (!controller.signal.aborted) setLookup({ id, article: null, loading: false }); });
    return () => controller.abort();
  }, [onStory, state.article]);

  // Drop a selection that is no longer on the current page.
  useEffect(() => {
    if (selectedId && !loading && !articles.some((article) => article.id === selectedId)) setSelectedId('');
  }, [articles, loading, selectedId]);

  const showView = useCallback((next: RadarView) => {
    update({ view: next, article: '' });
    setDrawerOpen(false);
    track('section_view', next === 'knowledge' ? 'research' : next === 'radar' ? 'action' : next);
    scrollTop();
  }, [update]);

  const showChannel = useCallback((next: Channel) => {
    update({ view: 'radar', channel: next, chapter: '', article: '' });
    track('section_view', next === 'saved' ? 'saved' : next === 'research' || next === 'career' ? 'research' : 'action');
    scrollTop();
  }, [update]);

  const openArticle = useCallback((article: Article) => {
    seen.current.set(article.id, article);
    setSelectedId(article.id);
    update({ view: 'radar', article: article.id });
    track('article_open', section, article.id);
    window.scrollTo({ top: 0 });
  }, [section, update]);

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

  const leadArticle = selected ?? [...articles].sort(byScore)[0] ?? null;

  const paper = useMemo<PaperContextValue>(() => {
    const front: RadarState = { ...defaultState };
    const stateFor = (to: Section): RadarState => {
      if (to === 'questions') return { ...front, view: 'knowledge' };
      if (to === 'about') return { ...front, view: 'about' };
      if (to === 'admin') return { ...front, view: 'admin' };
      if (to === 'saved') return { ...front, channel: 'saved' };
      if (to === 'story' && leadArticle) return { ...state, view: 'radar', article: leadArticle.id };
      return front;
    };
    return {
      state, update, overview, coverage, user, savedIds,
      href: (to) => `${urlFor(stateFor(to))}${to === 'japan' ? '#japan' : ''}`,
      go: (to) => {
        if (to === 'front') { update({ ...defaultState }); setSelectedId(''); scrollTop(); }
        else if (to === 'japan') { if (state.view !== 'radar' || state.article || state.channel === 'saved') update({ ...defaultState }); scrollToId('japan'); }
        else if (to === 'questions') showView('knowledge');
        else if (to === 'about') showView('about');
        else if (to === 'admin') showView('admin');
        else if (to === 'saved') { if (user) showChannel('saved'); else setDrawerOpen(true); }
        else if (to === 'story') { if (leadArticle) openArticle(leadArticle); else showChannel('action'); }
      },
      articleHref: (id) => urlFor({ ...state, view: 'radar', article: id }),
      openArticle,
      chapterHref: (id) => urlFor({ ...front, chapter: id, pillar: coverage.find((item) => item.id === id)?.pillar ?? 'すべて' }),
      openChapter: (id) => {
        const chapter = coverage.find((item) => item.id === id);
        update({ ...defaultState, chapter: id, pillar: chapter?.pillar ?? 'すべて' });
        track('section_view', 'action');
        scrollTop();
      },
      openSource,
      toggleSave: (article) => void toggleSave(article),
      openAccount: () => setDrawerOpen(true)
    };
  }, [coverage, leadArticle, openArticle, openSource, overview, savedIds, showChannel, showView, state, toggleSave, update, user]);

  const storyIndex = story ? articles.findIndex((article) => article.id === story.id) : -1;
  const prev = storyIndex > 0 ? articles[storyIndex - 1] : null;
  const next = storyIndex >= 0 && storyIndex < articles.length - 1 ? articles[storyIndex + 1] : null;

  // Reader shortcuts (never shown in the UI): j/k move, o opens the source, s saves, / searches, Esc closes.
  useEffect(() => {
    if (view !== 'radar') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === 'Escape') {
        if (isTyping(event.target)) (event.target as HTMLElement).blur();
        else if (onStory) update({ article: '' });
        else setSelectedId('');
        return;
      }
      if (isTyping(event.target) || drawerOpen) return;
      const current = onStory ? story : selected;
      if (event.key === '/') {
        if (onStory) return;
        event.preventDefault();
        searchRef.current?.focus();
      } else if (event.key === 'j' || event.key === 'k') {
        if (onStory) {
          const target = event.key === 'j' ? next : prev;
          if (target) openArticle(target);
          return;
        }
        const index = articles.findIndex((article) => article.id === selectedId);
        const target = articles[event.key === 'j' ? Math.min(articles.length - 1, index + 1) : Math.max(0, index - 1)];
        if (!target) return;
        setSelectedId(target.id);
        const element = document.querySelector<HTMLElement>(`[data-article="${target.id}"]`);
        element?.scrollIntoView({ block: 'nearest' });
        element?.focus({ preventScroll: true });
      } else if (event.key === 'o' && current) {
        openSource(current);
        window.open(current.url, '_blank', 'noopener');
      } else if (event.key === 's' && current) {
        void toggleSave(current);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [articles, drawerOpen, next, onStory, openArticle, openSource, prev, selected, selectedId, story, toggleSave, update, view]);

  let content;
  if (view === 'admin') content = <>
    <PaperHeader current="admin" folio="（管理）　運用" />
    <Suspense fallback={<div className="notice">管理データを読み込んでいます…</div>}><AdminDashboard /></Suspense>
    <SiteFooter />
  </>;
  else if (view === 'knowledge') content = <QuestionsPage articles={articles} />;
  else if (view === 'about') content = <AboutFde />;
  else if (onStory) content = <StoryPage article={story} loading={!story && (lookup.loading || lookup.id !== state.article)} prev={prev} next={next} />;
  else content = <FrontPage ref={searchRef} articles={articles} pagination={pagination} loading={loading} error={error} selectedId={selectedId} onSelect={setSelectedId} />;

  return <PaperProvider value={paper}>
    <div className={`paper view-${view}${onStory ? ' view-story' : ''}`}>
      <main className="sheet-of-paper" id="top">{content}</main>
      <AuthDrawer open={drawerOpen} user={user} bookmarkCount={savedIds.length} onClose={() => setDrawerOpen(false)} onAuthenticated={(nextUser, ids) => { setUser(nextUser); setSavedIds(ids); setDrawerOpen(false); }} onLogout={() => { setUser(null); setSavedIds([]); setDrawerOpen(false); update({ view: 'radar', channel: 'action', article: '' }); }} onAdmin={() => showView('admin')} />
    </div>
  </PaperProvider>;
}
