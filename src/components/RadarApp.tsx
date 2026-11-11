import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Article, Channel } from '../data/articles';
import { track, type AnalyticsSection } from '../lib/analytics';
import AboutFde from './radar/AboutFde';
import AuthDrawer from './radar/AuthDrawer';
import FrontPage from './radar/FrontPage';
import { fromApi, parseDate, type ApiArticle, type CoverageChapter, type Overview, type User } from './radar/model';
import { byScore, issueFileName, issueOf } from './radar/typeset';
import { installPrintFit } from './radar/print';
import { PaperHeader, PaperProvider, SiteFooter, type PaperContextValue, type Section } from './radar/Paper';
import QuestionsPage from './radar/QuestionsPage';
import StoryPage from './radar/StoryPage';
import { useArticles } from './radar/useArticles';
import { defaultState, urlFor, useRadarState, type RadarState, type RadarView } from './radar/useRadarState';

const AdminDashboard = lazy(() => import('./AdminDashboard'));

const BASE_TITLE = 'ＦＤＥレーダー — AI導入の一次情報を集約';
const pageTitles: Record<string, string> = {
  三面: '二十四の問い — ＦＤＥレーダー', 社説: 'ＦＤＥとは — ＦＤＥレーダー', 管理: '管理 — ＦＤＥレーダー'
};

function isTyping(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
}

const scrollTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

/** Parses a JSON response, treating any non-2xx status as a failure. */
async function okJson<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`${response.url}: ${response.status}`);
  return response.json() as Promise<T>;
}

/** Scrolls to an anchor once it has rendered (sections load their data on their own). */
function scrollToId(id: string, tries = 20) {
  const element = document.getElementById(id);
  if (element) element.scrollIntoView({ behavior: 'smooth', block: 'start' });
  else if (tries > 0) window.setTimeout(() => scrollToId(id, tries - 1), 100);
}

/** Direct links to 二面 (`?a=<id>`) that are not on the loaded page. Only a 404 means "not found". */
async function findArticle(id: string, signal: AbortSignal): Promise<Article | null> {
  const response = await fetch(`/api/articles/${encodeURIComponent(id)}`, { signal });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`article lookup failed: ${response.status}`);
  const data = await response.json() as { article?: ApiArticle | null };
  return data.article ? fromApi(data.article) : null;
}

export default function RadarApp() {
  const { state, update, ready } = useRadarState();
  const [overview, setOverview] = useState<Overview>({});
  // Set once /api/overview has answered (or failed). Before that the masthead prints no date.
  const [overviewSettled, setOverviewSettled] = useState(false);
  const [coverage, setCoverage] = useState<CoverageChapter[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [lookup, setLookup] = useState<{ id: string; article: Article | null; loading: boolean; failed?: boolean }>({ id: '', article: null, loading: false });
  // Bookmark requests in flight, so a double click cannot send two PUTs for the same article.
  const saving = useRef(new Set<string>());
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
  // The selection may be any headline on 一面 (P0 box, 日本レンズ, top-ups), not only the main list.
  const selected = selectedId ? seen.current.get(selectedId) ?? null : null;
  const section: AnalyticsSection = view === 'admin' ? 'admin' : view === 'about' ? 'about' : channel === 'saved' ? 'saved' : channel === 'research' || channel === 'career' ? 'research' : state.region === 'Japan' ? 'japan' : 'action';

  const story = onStory ? seen.current.get(state.article) ?? (lookup.id === state.article ? lookup.article : null) : null;

  const remember = useCallback((items: Article[]) => { items.forEach((article) => seen.current.set(article.id, article)); }, []);

  const folio = onStory ? '二面' : view === 'knowledge' ? '三面' : view === 'about' ? '社説' : view === 'admin' ? '管理' : '一面';
  const printName = useRef('');
  const lastIngestedAt = overview.last_ingested_at;
  const issue = useMemo(() => overviewSettled ? issueOf(parseDate(lastIngestedAt)) : null, [lastIngestedAt, overviewSettled]);
  printName.current = issueFileName(issue ?? issueOf(), folio);
  useEffect(() => installPrintFit(() => printName.current), []);

  useEffect(() => {
    const leaveAdmin = () => update({ view: 'radar' });
    fetch('/api/auth/me').then((response) => okJson<{ user?: User | null; bookmarkIds?: string[] }>(response)).then((data) => {
      setUser(data.user ?? null);
      setSavedIds(data.bookmarkIds ?? []);
      if (!data.user?.isAdmin && new URLSearchParams(window.location.search).get('v') === 'admin') leaveAdmin();
    }).catch(() => undefined);
    fetch('/api/overview').then((response) => okJson<Overview>(response)).then(setOverview).catch(() => undefined)
      .finally(() => setOverviewSettled(true));
    fetch('/api/coverage').then((response) => okJson<{ chapters?: CoverageChapter[] }>(response)).then((data) => setCoverage(data.chapters ?? [])).catch(() => undefined);
  }, [update]);

  useEffect(() => {
    if (ready) track('page_view', section);
    // Only the first resolved view counts as a page view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Every arrival on 二面 counts, whether by click, direct link or back/forward.
  useEffect(() => {
    if (ready && onStory) track('article_open', section, state.article);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, onStory, state.article]);

  // Page title follows the page; focus moves to the new page for keyboard and screen reader users.
  const mainRef = useRef<HTMLElement>(null);
  const firstPage = useRef(true);
  useEffect(() => {
    document.title = story ? `${story.title} — ＦＤＥレーダー` : pageTitles[folio] ?? BASE_TITLE;
  }, [folio, story]);
  useEffect(() => {
    if (!ready) return;
    if (firstPage.current) { firstPage.current = false; return; }
    mainRef.current?.focus({ preventScroll: true });
  }, [ready, view, state.article]);

  // A 二面 link opened directly: fetch that one article unless it is already known.
  // Only the article id drives this effect, so recording the lookup does not cancel it.
  useEffect(() => {
    const id = state.article;
    if (!onStory || seen.current.has(id)) return;
    const controller = new AbortController();
    setLookup({ id, article: null, loading: true });
    findArticle(id, controller.signal)
      .then((article) => setLookup({ id, article, loading: false }))
      .catch(() => { if (!controller.signal.aborted) setLookup({ id, article: null, loading: false, failed: true }); });
    return () => controller.abort();
  }, [onStory, state.article]);

  // A new list (another page or filter) drops a selection that is not on it.
  useEffect(() => {
    setSelectedId((id) => id && articles.some((article) => article.id === id) ? id : '');
  }, [articles]);

  // Other pages are reached from the front page's defaults, as their links say (urlFor drops list filters).
  const showView = useCallback((next: RadarView) => {
    update({ ...defaultState, view: next });
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
    window.scrollTo({ top: 0 });
  }, [update]);

  const openSource = useCallback((article: Article) => {
    track('source_click', section, article.id);
  }, [section]);

  const toggleSave = useCallback(async (article: Article) => {
    if (!user) {
      setDrawerOpen(true);
      return;
    }
    if (saving.current.has(article.id)) return;
    saving.current.add(article.id);
    const saved = savedIds.includes(article.id);
    try {
      const response = await fetch(`/api/bookmarks/${article.id}`, { method: saved ? 'DELETE' : 'PUT' });
      if (!response.ok) return;
      setSavedIds((ids) => {
        const rest = ids.filter((id) => id !== article.id);
        return saved ? rest : [article.id, ...rest];
      });
      if (saved && channel === 'saved') setArticles((items) => items.filter((item) => item.id !== article.id));
    } catch {
      // Network failure: the saved state simply stays as it was.
    } finally {
      saving.current.delete(article.id);
    }
  }, [channel, savedIds, setArticles, user]);

  const ranked = useMemo(() => [...articles].sort(byScore), [articles]);
  const leadArticle = selected ?? ranked[0] ?? null;

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
      state, update, overview, issue, coverage, user, savedIds, remember,
      href: (to) => `${urlFor(stateFor(to))}${to === 'japan' ? '#japan' : ''}`,
      go: (to) => {
        if (to === 'front') { update({ ...defaultState }); setSelectedId(''); track('section_view', 'action'); scrollTop(); }
        else if (to === 'japan') { if (state.view !== 'radar' || state.article || state.channel === 'saved') update({ ...defaultState }); track('section_view', 'japan'); scrollToId('japan'); }
        else if (to === 'questions') showView('knowledge');
        else if (to === 'about') showView('about');
        else if (to === 'admin') showView('admin');
        else if (to === 'saved') { if (user) showChannel('saved'); else setDrawerOpen(true); }
        else if (to === 'story') { if (leadArticle) openArticle(leadArticle); else showChannel('action'); }
      },
      articleHref: (id) => urlFor({ ...state, view: 'radar', article: id }),
      openArticle,
      // A chapter already implies its pillar; sending both would AND two different columns server-side.
      chapterHref: (id) => urlFor({ ...front, chapter: id }),
      openChapter: (id) => {
        update({ ...defaultState, chapter: id });
        track('section_view', 'action');
        scrollTop();
      },
      openSource,
      toggleSave: (article) => void toggleSave(article),
      openAccount: () => setDrawerOpen(true)
    };
  }, [coverage, issue, leadArticle, openArticle, openSource, overview, remember, savedIds, showChannel, showView, state, toggleSave, update, user]);

  const storyIndex = story ? articles.findIndex((article) => article.id === story.id) : -1;
  const prev = storyIndex > 0 ? articles[storyIndex - 1] : null;
  const next = storyIndex >= 0 && storyIndex < articles.length - 1 ? articles[storyIndex + 1] : null;

  // Reader shortcuts (never shown in the UI): j/k move, o opens the source, s saves, / searches, Esc closes.
  // The listener is attached once and reads the latest handler through a ref.
  const onKeyRef = useRef<(event: KeyboardEvent) => void>(() => undefined);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => onKeyRef.current(event);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);
  const onKey = (event: KeyboardEvent) => {
      if (view !== 'radar') return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      // The account drawer owns the keyboard while open (it closes itself on Esc).
      if (drawerOpen) return;
      if (event.key === 'Escape') {
        if (isTyping(event.target)) (event.target as HTMLElement).blur();
        else if (onStory) update({ article: '' });
        else setSelectedId('');
        return;
      }
      if (isTyping(event.target)) return;
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
        // Move through headlines in reading order as laid out on the page (score order, boxes included).
        const links = [...document.querySelectorAll<HTMLElement>('.fp [data-article]')].filter((element) => element.getClientRects().length > 0);
        const ids = [...new Set(links.map((element) => element.dataset.article ?? ''))].filter(Boolean);
        const index = ids.indexOf(selectedId);
        const target = ids[event.key === 'j' ? Math.min(ids.length - 1, index + 1) : Math.max(0, index - 1)];
        if (!target) return;
        setSelectedId(target);
        const element = links.find((item) => item.dataset.article === target);
        element?.scrollIntoView({ block: 'nearest' });
        element?.focus({ preventScroll: true });
      } else if (event.key === 'o' && current && !event.repeat) {
        openSource(current);
        window.open(current.url, '_blank', 'noopener');
      } else if (event.key === 's' && current && !event.repeat) {
        void toggleSave(current);
      }
    };
  useEffect(() => { onKeyRef.current = onKey; });

  let content;
  if (view === 'admin') content = <>
    <PaperHeader current="admin" folio="（管理）　運用" />
    <Suspense fallback={<div className="notice">管理データを読み込んでいます…</div>}><AdminDashboard /></Suspense>
    <SiteFooter />
  </>;
  else if (view === 'knowledge') content = <QuestionsPage articles={articles} />;
  else if (view === 'about') content = <AboutFde />;
  else if (onStory) content = <StoryPage article={story} loading={!story && (lookup.loading || lookup.id !== state.article)} failed={lookup.id === state.article && Boolean(lookup.failed)} prev={prev} next={next} />;
  else content = <FrontPage ref={searchRef} articles={articles} ranked={ranked} pagination={pagination} loading={loading} error={error} selectedId={selectedId} onSelect={setSelectedId} />;

  return <PaperProvider value={paper}>
    <div className="paper">
      <main ref={mainRef} className="sheet-of-paper" tabIndex={-1} inert={drawerOpen ? true : undefined}>{content}</main>
      <AuthDrawer open={drawerOpen} user={user} bookmarkCount={savedIds.length} onClose={() => setDrawerOpen(false)} onAuthenticated={(nextUser, ids) => { setUser(nextUser); setSavedIds(ids); setDrawerOpen(false); }} onLogout={() => { setUser(null); setSavedIds([]); setDrawerOpen(false); update({ view: 'radar', channel: 'action', article: '' }); }} onAdmin={() => showView('admin')} />
    </div>
  </PaperProvider>;
}
