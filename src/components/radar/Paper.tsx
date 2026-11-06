/**
 * Shared newspaper chrome: navigation context, real <a href> links,
 * the running header used on 二面 and 三面, and the colophon footer.
 */
import { createContext, useContext, type MouseEvent, type ReactNode } from 'react';

import type { Article } from '../../data/articles';
import { parseDate, type CoverageChapter, type Overview, type User } from './model';
import { printPaper } from './print';
import { issueOf, kanjiNum, paperDate } from './typeset';
import type { RadarState } from './useRadarState';

export type Section = 'front' | 'story' | 'questions' | 'japan' | 'saved' | 'about' | 'admin';

export type PaperContextValue = {
  state: RadarState;
  update: (patch: Partial<RadarState>) => void;
  overview: Overview;
  coverage: CoverageChapter[];
  user: User | null;
  savedIds: string[];
  /** URL and handler for each page of the paper. */
  href: (section: Section) => string;
  go: (section: Section) => void;
  /** 二面 for one article. */
  articleHref: (id: string) => string;
  openArticle: (article: Article) => void;
  /** 一面 filtered to one of the 24 questions. */
  chapterHref: (id: string) => string;
  openChapter: (id: string) => void;
  openSource: (article: Article) => void;
  toggleSave: (article: Article) => void;
  openAccount: () => void;
};

const PaperContext = createContext<PaperContextValue | null>(null);

export const PaperProvider = PaperContext.Provider;

export function usePaper(): PaperContextValue {
  const value = useContext(PaperContext);
  if (!value) throw new Error('usePaper must be used inside PaperProvider');
  return value;
}

/** Plain clicks are handled in-app; modified clicks open the real URL in a new tab. */
export function onPlainClick(handler: () => void) {
  return (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    handler();
  };
}

type LinkProps = { className?: string; children: ReactNode; current?: boolean; label?: string };

export function SectionLink({ to, className, children, current, label }: LinkProps & { to: Section }) {
  const paper = usePaper();
  return <a className={className} href={paper.href(to)} aria-current={current ? 'page' : undefined} aria-label={label} onClick={onPlainClick(() => paper.go(to))}>{children}</a>;
}

export function ArticleLink({ article, className, children, label }: LinkProps & { article: Article }) {
  const paper = usePaper();
  return <a className={className} href={paper.articleHref(article.id)} data-article={article.id} aria-label={label} onClick={onPlainClick(() => paper.openArticle(article))}>{children}</a>;
}

export function ChapterLink({ id, className, children, label }: LinkProps & { id: string }) {
  const paper = usePaper();
  return <a className={className} href={paper.chapterHref(id)} aria-label={label} onClick={onPlainClick(() => paper.openChapter(id))}>{children}</a>;
}

/** The paper's name in the calligraphic face. */
export function Daiji({ className = '' }: { className?: string }) {
  return <span className={`daiji ${className}`}>ＦＤＥレーダー</span>;
}

const headerNav: Array<{ to: Section; label: string }> = [
  { to: 'front', label: '一面' },
  { to: 'story', label: '二面 記事' },
  { to: 'questions', label: '三面 二十四の問い' },
  { to: 'japan', label: '日本レンズ' },
  { to: 'saved', label: '保存' }
];

/** Running header for 二面 and 三面: small masthead, date, page navigation, folio. */
export function PaperHeader({ current, folio }: { current: Section; folio: ReactNode }) {
  const paper = usePaper();
  const issue = issueOf(parseDate(paper.overview.last_ingested_at));
  const items = paper.user?.isAdmin ? [...headerNav, { to: 'admin' as Section, label: '管理' }] : headerNav;
  return <header className="running-head">
    <SectionLink to="front" className="running-daiji" label="ＦＤＥレーダー 一面へ"><Daiji /></SectionLink>
    <span className="running-date">{paperDate(issue.date, { era: false })}　{issue.kind}</span>
    <nav className="running-nav" aria-label="紙面案内">
      {items.map((item) => <SectionLink key={item.to} to={item.to} current={item.to === current}>{item.label}</SectionLink>)}
      <button type="button" className="running-account" onClick={paper.openAccount}>{paper.user ? paper.user.displayName : 'ログイン'}</button>
    </nav>
    <span className="running-folio">{folio}</span>
  </header>;
}

/** 奥付: name and motto, today's primary sources, colophon links. */
export function SiteFooter() {
  const paper = usePaper();
  const issue = issueOf(parseDate(paper.overview.last_ingested_at));
  const names = (paper.overview.sources ?? []).map((source) => source.name).filter(Boolean).slice(0, 10);
  return <footer className="colophon">
    <p className="colophon-name"><Daiji /><span>ＡＩを「試した」で終わらせない、現場のためのフィールドインテリジェンス</span></p>
    <p className="colophon-sources">
      {names.length > 0 && <><b>きょうの一次情報源</b>　{names.join(' · ')}　／　</>}
      六時間ごとに収集。本文は保存せず、一次情報へ送ります。
    </p>
    <p className="colophon-links">
      <SectionLink to="about">ＦＤＥとは</SectionLink>
      <a href="https://github.com/kekincai/fde#privacy" target="_blank" rel="noreferrer">プライバシー</a>
      <a href="/api/overview" target="_blank" rel="noreferrer">ＡＰＩ</a>
      <a href="https://github.com/kekincai/fde" target="_blank" rel="noreferrer">GitHub</a>
      <button type="button" className="colophon-print" onClick={printPaper}>この面を印刷（ブランケット判）</button>
    </p>
    <p className="colophon-imprint">ＦＤＥレーダー　{paperDate(issue.date, { era: false })}　{issue.kind}　{kanjiNum(issue.han)}版　fde.kejincai.dev</p>
  </footer>;
}
