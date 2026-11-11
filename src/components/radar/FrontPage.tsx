/**
 * 一面 — the front page. Masthead and 紙面案内, the top story set vertically in
 * three 段, three second-tier stories, the P0 / 日本レンズ / 二十四の問い band,
 * five pillar columns of short news, and 前の面 / 次の面.
 * Vertical setting only applies under `html.tate-ok` at ≥768px (phones keep the
 * masthead and the top headline vertical); everything reads horizontally otherwise.
 */
import { forwardRef, useEffect, useId, useMemo, useState, type FocusEvent, type ReactNode, type Ref } from 'react';

import { japanLensLabels, pillarLabels, priorityMeta, topics, type Article, type Priority, type Region, type SortOrder } from '../../data/articles';
import { fromApi, isThinChapter, parseDate, usefulNote, type ApiArticle, type CoverageChapter, type Pagination } from './model';
import { ArticleLink, ChapterLink, Daiji, onPlainClick, SectionLink, SiteFooter, usePaper } from './Paper';
import { actionItems, countLabel, jstParts, kanjiMonthDay, kanjiNum, kanjiTime, monthDay, paperDate, paperDay, paperWeekday, pillarOrder, splitHeadline, zen } from './typeset';
import { defaultState, urlFor, type RadarState } from './useRadarState';

type FrontPageProps = {
  /** Current page of the filtered list (useArticles). */
  articles: Article[];
  /** The same list, best score first (computed once in RadarApp). */
  ranked: Article[];
  pagination: Pagination;
  loading: boolean;
  error: string;
  /** Keyboard (j/k) selection; the matching headline gets `.is-selected`. */
  selectedId: string;
  onSelect: (id: string) => void;
};

const priorityWords: Record<Priority, string> = { P0: priorityMeta.P0.label, P1: priorityMeta.P1.label, P2: priorityMeta.P2.label };
const priorityClass: Record<Priority, string> = { P0: 'shu', P1: 'p1-text', P2: 'fp-p2' };
const regions: Array<[Region | 'ALL', string]> = [['ALL', 'すべて'], ['Japan', '日本'], ['Global', 'グローバル']];
const sortOptions: Array<[SortOrder, string]> = [['newest', '新着順'], ['priority', '優先度順'], ['published', '公開日順']];

type Feed = { articles: Article[]; total: number };

/**
 * Side fetches for boxes on the page (P0, 日本レンズ, pillar top-ups), kept for the session so
 * returning from 二面 or 三面 does not fetch them again. Five minutes matches the API's cache.
 */
const FEED_TTL = 5 * 60_000;
const feedCache = new Map<string, { feed: Feed; at: number }>();
const emptyFeed: Feed = { articles: [], total: 0 };
const topUpUrl = (pillar: string) => `/api/articles?pillar=${encodeURIComponent(pillar)}&pageSize=6`;

async function loadFeed(url: string, signal?: AbortSignal): Promise<Feed> {
  const hit = feedCache.get(url);
  if (hit && Date.now() - hit.at < FEED_TTL) return hit.feed;
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(String(response.status));
  const data = await response.json() as { articles?: ApiArticle[]; pagination?: { total?: number } };
  const list = (data.articles ?? []).map(fromApi).filter((item): item is Article => Boolean(item));
  const feed = { articles: list, total: Number(data.pagination?.total ?? list.length) };
  feedCache.set(url, { feed, at: Date.now() });
  return feed;
}

function useFeed(url: string | null): Feed {
  const [feed, setFeed] = useState<Feed>(() => (url && feedCache.get(url)?.feed) || emptyFeed);
  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    loadFeed(url, controller.signal).then(setFeed).catch(() => undefined);
    return () => controller.abort();
  }, [url]);
  return feed;
}

function pillarOf(article: Article): string {
  return (pillarOrder as readonly string[]).includes(article.corePillar) ? article.corePillar : 'Customer';
}

function heat(count: number): number {
  return count >= 90 ? 5 : count >= 40 ? 4 : count >= 20 ? 3 : count >= 10 ? 2 : 1;
}

function clock(value?: string | null): string {
  const date = parseDate(value);
  if (!date) return '';
  const p = jstParts(date);
  return `${p.hour}:${String(p.minute).padStart(2, '0')}`;
}

function clip(text: string, length: number): string {
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}

/** In-app link to another state of 一面 (filters, page). */
function StateLink({ to, className, children, onGo }: { to: RadarState; className?: string; children: ReactNode; onGo: () => void }) {
  return <a className={className} href={urlFor(to)} onClick={onPlainClick(onGo)}>{children}</a>;
}

function PriorityWord({ priority, full = true }: { priority: Priority; full?: boolean }) {
  return <span className={priorityClass[priority]}>{zen(priority)}{full && `　${priorityWords[priority]}`}</span>;
}

/* ---------- 最上段 ---------- */

/**
 * Suggested searches under the search box. Each one was checked against the live
 * full-text index to return a focused set (terms the index ignores, such as 閉域,
 * return every article and are left out).
 */
const suggestedKeywords = ['エージェント', 'Claude Code', 'MCP', 'RAG', '権限', 'ガバナンス', 'Copilot', '源内', 'PoC', '金融'];

function Keywords() {
  const { state, update } = usePaper();
  const active = state.query.trim();
  return <div className="fp-keywords" role="group" aria-labelledby="fp-keywords-head">
    <span id="fp-keywords-head" className="fp-keywords-head">注目の言葉</span>
    <ul>{suggestedKeywords.map((word) => {
      const on = active === word;
      return <li key={word}><button type="button" aria-pressed={on} onClick={() => update({ query: on ? '' : word, article: '' })}>{word}</button></li>;
    })}</ul>
  </div>;
}

function Masthead({ searchRef, filtersOpen, filterCount, onToggleFilters }: { searchRef: Ref<HTMLInputElement>; filtersOpen: boolean; filterCount: number; onToggleFilters: () => void }) {
  const { state, update, overview, issue, user, savedIds, openAccount } = usePaper();
  const counts = overview.counts ?? {};
  const number = issue ? `第${kanjiNum(issue.number)}号` : '';
  const md = issue ? paperDate(issue.date, { era: false }).replace(/^.+?年/, '') : '';
  const onSaved = state.channel === 'saved';
  const guide: Array<{ to: 'front' | 'story' | 'questions' | 'japan' | 'saved' | 'about'; label: string; folio: string }> = [
    { to: 'front', label: 'きょうの一面', folio: '一面' },
    { to: 'story', label: '記事と確認ポイント', folio: '二面' },
    { to: 'questions', label: '二十四の問い', folio: '三面' },
    { to: 'japan', label: '日本レンズ', folio: '一面下' },
    { to: 'saved', label: '保存した記事', folio: user ? `${kanjiNum(savedIds.length)}件` : '要ログイン' },
    { to: 'about', label: 'ＦＤＥとは', folio: '社説' }
  ];
  return <div className="fp-band">
    <SectionLink to="front" className="fp-title" label="ＦＤＥレーダー 一面へ">
      <span className="fp-daiji-box tate-always"><Daiji /></span>
      <span className="fp-dateline tate-always">
        {issue && <>
          <span className="fp-desk">{paperDay(issue.date)}</span>
          <span className="fp-desk">{paperWeekday(issue.date)}</span>
          <span className="fp-desk">{issue.kind}　{number}</span>
          <span className="fp-desk fp-dim">{kanjiNum(issue.han)}版</span>
          <span className="fp-mob">{md}</span>
          <span className="fp-mob">{issue.kind}　{kanjiNum(issue.han)}版</span>
          <span className="fp-mob fp-dim">{number}</span>
        </>}
      </span>
    </SectionLink>

    <dl className="fp-stats" aria-label="収集状況">
      <div className="fp-stat tate"><dt>収録記事</dt><dd>{countLabel(counts.total)}</dd></div>
      <div className="fp-stat tate"><dt>うち日本</dt><dd>{countLabel(counts.japan)}</dd></div>
      <div className="fp-stat tate shu"><dt>きょう対応</dt><dd>{countLabel(counts.p0)}</dd></div>
      <div className="fp-stat tate"><dt>最終収集</dt><dd>{kanjiTime(overview.last_ingested_at)}</dd></div>
    </dl>

    <div className="fp-side">
      <nav className="fp-guide" aria-label="紙面案内">
        <p className="kuro-head">紙面案内</p>
        <ol>{guide.map((item) => <li key={item.to}>
          <SectionLink to={item.to} current={item.to === 'front' ? !onSaved : item.to === 'saved' && onSaved}>{item.label}</SectionLink>
          <span>{item.folio}</span>
        </li>)}</ol>
      </nav>
      <form className="fp-search" role="search" onSubmit={(event) => event.preventDefault()}>
        <label className="visually-hidden" htmlFor="fp-q">記事を検索</label>
        <input ref={searchRef} id="fp-q" className="field" type="search" value={state.query} onChange={(event) => update({ query: event.target.value, article: '' })} placeholder="企業・技術・課題で検索" />
        <button type="button" className="btn" aria-expanded={filtersOpen} aria-controls="fp-filters" onClick={onToggleFilters}>絞り込み{filterCount > 0 && <span className="fp-count">{filterCount}</span>}</button>
        <button type="button" className="btn btn-kuro" onClick={openAccount}>{user ? user.displayName : 'パスキーでログイン'}</button>
      </form>
      <Keywords />
    </div>

    <nav className="fp-tabs" aria-label="紙面案内">
      <SectionLink to="front" current={!onSaved}>一面</SectionLink>
      <SectionLink to="story">記事</SectionLink>
      <SectionLink to="questions">二十四の問い</SectionLink>
      <SectionLink to="japan">日本</SectionLink>
      <SectionLink to="saved" current={onSaved} label="保存した記事">
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M6 3h12v18l-6-4-6 4z" /></svg>
      </SectionLink>
    </nav>
  </div>;
}

/* ---------- 絞り込み ---------- */

function Options<T extends string>({ label, value, options, onPick }: { label: string; value: T; options: Array<[T, string]>; onPick: (value: T) => void }) {
  return <fieldset className="fp-opts">
    <legend>{label}</legend>
    <div>{options.map(([key, text]) => <button key={key} type="button" className="fp-opt" aria-pressed={value === key} onClick={() => onPick(key)}>{text}</button>)}</div>
  </fieldset>;
}

function FilterStrip({ open }: { open: boolean }) {
  const { state, update } = usePaper();
  const set = (patch: Partial<RadarState>) => { update({ ...patch, article: '' }); };
  return <div id="fp-filters" className="fp-filters" hidden={!open}>
    {state.channel !== 'saved' && <Options label="種類" value={state.channel} options={[['action', '実務'], ['research', 'リサーチ'], ['career', '求人']]} onPick={(channel) => set({ channel, chapter: '' })} />}
    <Options label="地域" value={state.region} options={regions} onPick={(region) => set({ region })} />
    <Options label="優先度" value={state.priority} options={[['ALL', 'すべて'], ['P0', 'P0 きょう対応'], ['P1', 'P1 今週検証'], ['P2', 'P2 背景学習']]} onPick={(priority) => set({ priority })} />
    <Options label="工程" value={state.chapter ? '' : state.pillar} options={[['すべて', 'すべて'], ...pillarOrder.map((key) => [key, pillarLabels[key]] as [string, string])]} onPick={(pillar) => set({ pillar, chapter: '' })} />
    <Options label="テーマ" value={state.topic} options={topics.map((topic) => [topic, topic] as [string, string])} onPick={(topic) => set({ topic })} />
    <label className="fp-sort"><span>並び順</span>
      <select className="field" value={state.sort} onChange={(event) => set({ sort: event.target.value as SortOrder })}>{sortOptions.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select>
    </label>
  </div>;
}

function Chips() {
  const { state, update, coverage } = usePaper();
  const chapterTitle = state.chapter ? coverage.find((item) => item.id === state.chapter)?.titleJa ?? state.chapter : '';
  const chips: Array<{ key: string; label: string; clear: Partial<RadarState> }> = [
    ...(state.channel === 'saved' ? [{ key: 'saved', label: '保存した記事', clear: { channel: 'action' as const } }] : []),
    ...(state.channel === 'research' || state.channel === 'career' ? [{ key: 'channel', label: state.channel === 'career' ? '求人' : 'リサーチ', clear: { channel: 'action' as const } }] : []),
    ...(state.region !== 'ALL' ? [{ key: 'region', label: state.region === 'Japan' ? '日本' : 'グローバル', clear: { region: 'ALL' as const } }] : []),
    ...(state.priority !== 'ALL' ? [{ key: 'priority', label: `${state.priority} ${priorityWords[state.priority]}`, clear: { priority: 'ALL' as const } }] : []),
    ...(chapterTitle ? [{ key: 'chapter', label: `問い：${chapterTitle}`, clear: { chapter: '', pillar: 'すべて' } }] : []),
    ...(state.pillar !== 'すべて' && !state.chapter ? [{ key: 'pillar', label: pillarLabels[state.pillar], clear: { pillar: 'すべて' } }] : []),
    ...(state.topic !== 'すべて' ? [{ key: 'topic', label: state.topic, clear: { topic: 'すべて' } }] : []),
    ...(state.query.trim() ? [{ key: 'q', label: `「${state.query.trim()}」`, clear: { query: '' } }] : [])
  ];
  if (!chips.length) return null;
  const clearAll: Partial<RadarState> = { channel: 'action', region: 'ALL', priority: 'ALL', chapter: '', pillar: 'すべて', topic: 'すべて', query: '' };
  return <div className="chips fp-chips">
    <span className="fp-chips-label">絞り込み中</span>
    {chips.map((chip) => <button key={chip.key} type="button" className="chip" onClick={() => update(chip.clear)} aria-label={`${chip.label} を解除`}>{chip.label}</button>)}
    {chips.length > 1 && <button type="button" className="text-link fp-clear" onClick={() => update(clearAll)}><span>すべて解除</span></button>}
  </div>;
}

function countFilters(state: RadarState): number {
  return [state.channel === 'research' || state.channel === 'career', state.region !== 'ALL', state.priority !== 'ALL', Boolean(state.chapter) || state.pillar !== 'すべて', state.topic !== 'すべて', Boolean(state.query.trim())].filter(Boolean).length;
}

/* ---------- 一面トップ ---------- */

function TopStory({ article, kata, selectedId }: { article: Article; kata: Article | null; selectedId: string }) {
  const { openSource } = usePaper();
  const id = useId();
  const { main, sub } = splitHeadline(article.title);
  const view = usefulNote(article.whyItMatters, article);
  const action = usefulNote(article.recommendedAction, article);
  const items = action ? actionItems(action) : [];
  const pillar = pillarLabels[article.corePillar] || article.corePillar;
  return <section className="fp-top" aria-labelledby={id}>
    <div className="fp-top-row tate-row tate-always-row">
      <header className="fp-top-head tate-row tate-always-row">
        <h1 id={id} className="hl fp-top-title tate-always">
          {article.priority === 'P0' && <span className="shu-tag fp-tag">きょう対応</span>}
          <ArticleLink article={article} className={selectedId === article.id ? 'is-selected' : ''}>{main}</ArticleLink>
        </h1>
        {sub && <p className="hl-sub fp-top-sub tate-always">{sub}</p>}
        <p className="fp-top-meta tate fp-v">
          <span className="kuro fp-pillar">{pillar}</span>
          <span>{article.source}　{kanjiTime(article.collectedAt || article.publishedAt)}収集</span>
          <PriorityWord priority={article.priority} />
        </p>
      </header>
      <div className="fp-top-main tate-row">
        <div className="fp-top-body tate-body">
          <p>{article.summary}</p>
          {view && <p>【本紙の見方】{view}</p>}
        </div>
        {items.length > 0 && <aside className="fp-check kakomi tate" aria-label="次に確かめること">
          <h2>次に確かめること</h2>
          <ol>{items.map((item, index) => <li key={item}>{kanjiNum(index + 1)}、{item}</li>)}</ol>
          <p className="kakomi-note">生成された補足。一次情報で確認を。</p>
        </aside>}
      </div>
      {kata && <div className="fp-kata-wide"><KataStory article={kata} selectedId={selectedId} /></div>}
    </div>
    <p className="fp-top-meta-h fp-h">
      <span className="kuro fp-pillar">{pillar}</span>{article.source} · {monthDay(article.collectedAt || article.publishedAt)} {clock(article.collectedAt || article.publishedAt)} · <PriorityWord priority={article.priority} />
    </p>
    <div className="fp-top-actions">
      <ArticleLink article={article} className="btn btn-kuro">要点と確認ポイント</ArticleLink>
      <a className="btn fp-btn-surface" href={article.url} target="_blank" rel="noreferrer" onClick={() => openSource(article)}>一次情報を開く</a>
    </div>
    {kata && <div className="fp-kata-mob"><KataStory article={kata} selectedId={selectedId} /></div>}
  </section>;
}

/** 肩: the second story, set beside the top story as on a printed front page. */
function KataStory({ article, selectedId }: { article: Article; selectedId: string }) {
  const { main, sub } = splitHeadline(article.title);
  const view = usefulNote(article.whyItMatters, article);
  const pillar = pillarLabels[article.corePillar] || article.corePillar;
  const when = article.publishedAt || article.collectedAt;
  return <article className="fp-kata tate-row">
    <h2 className="hl fp-kata-title tate">
      {article.priority === 'P0' && <span className="shu-tag fp-tag">きょう対応</span>}
      <ArticleLink article={article} className={selectedId === article.id ? 'is-selected' : ''}>{main}</ArticleLink>
    </h2>
    {sub && <p className="hl-sub fp-kata-sub tate">{sub}</p>}
    <div className="fp-kata-body tate-body">
      <p>{article.summary}</p>
      {view && <p>{view}</p>}
      <p className="byline fp-v">（{article.source}　{kanjiMonthDay(when)}）　{pillar}　{zen(article.priority)}</p>
      <p className="byline fp-h">{article.source} · {monthDay(when)} · {pillar} · <span className={priorityClass[article.priority]}>{article.priority}</span></p>
    </div>
  </article>;
}

/* ---------- 二段目 ---------- */

function SecondStory({ article, selectedId }: { article: Article; selectedId: string }) {
  const { main, sub } = splitHeadline(article.title);
  const view = usefulNote(article.whyItMatters, article);
  const pillar = pillarLabels[article.corePillar] || article.corePillar;
  const when = article.publishedAt || article.collectedAt;
  return <article className="fp-second-item tate-row tate-always-row">
    <h2 className="hl fp-second-title tate-always">
      {article.priority === 'P0' && <span className="shu-tag fp-tag">きょう対応</span>}
      <ArticleLink article={article} className={selectedId === article.id ? 'is-selected' : ''}>{main}</ArticleLink>
    </h2>
    <div className="fp-second-text tate-row">
      {sub && <p className="hl-sub fp-second-sub tate">{sub}</p>}
      <div className="fp-second-body tate-body">
        <p>{article.summary}</p>
        {view && <p className="fp-v">{view}</p>}
        <p className="byline fp-v">（{article.source}　{kanjiMonthDay(when)}）　{pillar}　{zen(article.priority)}</p>
        <p className="byline fp-h">{article.source} · {monthDay(when)} · {pillar} · <span className={priorityClass[article.priority]}>{article.priority}</span></p>
      </div>
    </div>
  </article>;
}

/* ---------- 三段目 ---------- */

function TodayDesk({ feed, selectedId }: { feed: Feed; selectedId: string }) {
  const { overview, update } = usePaper();
  const total = feed.total || overview.counts?.p0 || 0;
  const goAll = () => { update({ ...defaultState, priority: 'P0' }); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  return <section id="p0" className="fp-p0" aria-labelledby="fp-p0-head">
    <h2 id="fp-p0-head" className="kuro fp-p0-head">きょう対応　Ｐ０ <span>{kanjiNum(total)}件</span></h2>
    {feed.articles.length ? <ol>{feed.articles.map((article) => {
      const note = usefulNote(article.recommendedAction, article);
      return <li key={article.id}>
        <span className="shu-mark" aria-hidden="true" />
        <div>
          <ArticleLink article={article} className={selectedId === article.id ? 'is-selected' : ''}>{article.title}</ArticleLink>
          <p>{article.source} · {note ? clip(note, 44) : pillarLabels[article.corePillar] || article.corePillar}</p>
        </div>
      </li>;
    })}</ol> : <p className="fp-empty">きょう判断が必要な記事はありません。</p>}
    {total > 0 && <StateLink to={{ ...defaultState, priority: 'P0' }} className="text-link" onGo={goAll}><span>{kanjiNum(total)}件すべてを見る</span></StateLink>}
  </section>;
}

function JapanLens({ feed, selectedId }: { feed: Feed; selectedId: string }) {
  const picks = useMemo(() => {
    const withLens = feed.articles.filter((article) => article.japanLens);
    const chosen: Article[] = [];
    for (const article of withLens) if (!chosen.some((item) => item.japanLens === article.japanLens)) chosen.push(article);
    for (const article of withLens) if (chosen.length < 3 && !chosen.includes(article)) chosen.push(article);
    return chosen.slice(0, 3);
  }, [feed.articles]);
  return <section id="japan" className="fp-japan tate-row tate-always-row" aria-labelledby="fp-japan-head">
    <h2 id="fp-japan-head" className="fp-japan-head tate-always">日本レンズ</h2>
    <div className="fp-japan-body tate-row">
      <p className="fp-japan-lede tate">日本は六番目の章ではなく、五つの工程すべてを横切る視点。制度、調達、閉域、現場の言葉で読み替える。</p>
      {picks.length ? <ol className="fp-japan-list">{picks.map((article) => <li key={article.id} className="tate">
        <span className="fp-lens">{japanLensLabels[article.japanLens] ?? article.japanLens}</span>
        <ArticleLink article={article} className={selectedId === article.id ? 'is-selected' : ''}>{article.title}</ArticleLink>
      </li>)}</ol> : <p className="fp-empty">日本の記事を読み込んでいます。</p>}
    </div>
  </section>;
}

function QuestionTable({ coverage }: { coverage: CoverageChapter[] }) {
  const { state, overview } = usePaper();
  const thin = coverage.filter(isThinChapter).length;
  const healthy = coverage.length - thin;
  const updated = clock(overview.last_ingested_at);
  return <section className="fp-map" aria-labelledby="fp-map-head">
    <h2 id="fp-map-head" className="fp-map-head"><span><span className="fp-desk-inline">二十四の問い　記事の厚み</span><span className="fp-mob-inline">二十四の問い</span></span><SectionLink to="questions" className="fp-map-more">三面へ</SectionLink></h2>
    <p className="fp-map-note fp-desk">数字は公開記事数。赤枠は一次情報が足りない「薄い章」。</p>
    {coverage.length ? <table className="fp-map-table">
      <tbody>{pillarOrder.map((pillar) => <tr key={pillar}>
        <th scope="row">{pillarLabels[pillar]}</th>
        <td><div className="fp-cells">{coverage.filter((item) => item.pillar === pillar).map((item) => <ChapterLink key={item.id} id={item.id}
          className={`fp-cell ${isThinChapter(item) ? 'is-thin' : `heat-${heat(item.publishedCount)}`}${state.chapter === item.id ? ' is-current' : ''}`}
          label={`${item.titleJa}　${item.publishedCount}件${isThinChapter(item) ? '　薄い章' : ''}`}>{item.publishedCount}</ChapterLink>)}</div></td>
      </tr>)}</tbody>
    </table> : <p className="fp-empty">集計を読み込んでいます。</p>}
    <p className="fp-map-note">{coverage.length > 0 && <span className="fp-mob-inline">赤枠は一次情報が足りない「薄い章」。</span>}<span className="fp-desk-inline">薄い章 {thin} · 健全 {healthy}{updated && ` · ${updated}更新`}</span>{updated && <span className="fp-mob-inline">{updated}更新。</span>}</p>
  </section>;
}

/* ---------- 下段：工程ごとの短信 ---------- */

const COLUMN_SIZE = 4;

function PillarColumns({ columns, selectedId }: { columns: Array<{ pillar: string; items: Article[] }>; selectedId: string }) {
  // Keep the five columns even; whatever does not fit runs on as a single index below.
  const more = columns.flatMap(({ items }) => items.slice(COLUMN_SIZE));
  return <>
  <section className="fp-pillars" aria-label="工程ごとの短信">{columns.map(({ pillar, items: all }) => { const items = all.slice(0, COLUMN_SIZE); return <section key={pillar} className="fp-col" aria-labelledby={`fp-pillar-${pillar}`}>
    <h2 id={`fp-pillar-${pillar}`}>{pillarLabels[pillar]} <span>{pillar}</span></h2>
    {items.length ? <ul className="dotted">{items.map((article) => <li key={article.id}><ArticleLink article={article} className={selectedId === article.id ? 'is-selected' : ''}>{article.title}</ArticleLink></li>)}</ul>
      : <p className="fp-empty">この工程の記事はありません。</p>}
  </section>; })}</section>
  {more.length > 0 && <section className="fp-more" aria-labelledby="fp-more-head">
    <h2 id="fp-more-head">このほかの記事</h2>
    <ul>{more.map((article) => <li key={article.id}><ArticleLink article={article} className={selectedId === article.id ? 'is-selected' : ''}>{article.title}<span>{pillarLabels[article.corePillar] || article.corePillar}</span></ArticleLink></li>)}</ul>
  </section>}
  </>;
}

function Pager({ pagination }: { pagination: Pagination }) {
  const { state, update } = usePaper();
  const { page } = state;
  const total = Math.max(1, pagination.totalPages);
  if (total <= 1) return null;
  const go = (next: number) => () => { update({ page: next }); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const nextLabel = state.sort === 'newest' ? '昨日以前の紙面を読む' : '次の面を読む';
  return <nav className="fp-pager" aria-label="紙面送り">
    {page > 1 ? <StateLink to={{ ...state, page: page - 1 }} className="btn" onGo={go(page - 1)}>前の面</StateLink> : <span className="btn" aria-disabled="true">前の面</span>}
    <span className="fp-folio">{page} / {total} 面</span>
    {page < total ? <StateLink to={{ ...state, page: page + 1 }} className="btn fp-next" onGo={go(page + 1)}><span className="fp-desk-inline">次の面</span><span className="fp-mob-inline">{nextLabel}</span></StateLink>
      : <span className="btn fp-next" aria-disabled="true">次の面</span>}
  </nav>;
}

/* ---------- 一面 ---------- */

const FrontPage = forwardRef<HTMLInputElement, FrontPageProps>(function FrontPage({ articles, ranked, pagination, loading, error, selectedId, onSelect }, searchRef) {
  const { state, update, coverage, remember } = usePaper();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filterCount = countFilters(state);
  const filtered = state.channel === 'saved' || filterCount > 0;
  // Top-ups only make sense on the first page of the unfiltered paper.
  const noTopUp = filtered || state.page > 1;

  // A shared or stale `?page=N` beyond the last page goes to the last page.
  useEffect(() => {
    if (!loading && pagination.total > 0 && state.page > pagination.totalPages) update({ page: pagination.totalPages });
  }, [loading, pagination.total, pagination.totalPages, state.page, update]);

  const top = ranked[0] ?? null;
  const kata = ranked[1] ?? null;
  const second = ranked.slice(2, 5);
  const lead = new Set([top, kata, ...second].filter(Boolean).map((article) => (article as Article).id));
  const rest = articles.filter((article) => !lead.has(article.id));

  const p0 = useFeed('/api/articles?priority=P0&pageSize=3');
  const japan = useFeed('/api/articles?region=Japan&pageSize=12');

  // Pillar columns: the rest of this page, topped up to three per column on the unfiltered paper.
  const own = pillarOrder.map((pillar) => rest.filter((article) => pillarOf(article) === pillar));
  const short = noTopUp || loading ? [] : pillarOrder.filter((_, index) => own[index].length < 3);
  const [extra, setExtra] = useState<Record<string, Article[]>>(() => Object.fromEntries(
    pillarOrder.flatMap((pillar) => { const hit = feedCache.get(topUpUrl(pillar)); return hit ? [[pillar, hit.feed.articles]] : []; })
  ));
  const shortKey = short.join(',');
  useEffect(() => {
    if (!shortKey) return;
    const controller = new AbortController();
    for (const pillar of shortKey.split(',')) {
      loadFeed(topUpUrl(pillar), controller.signal)
        .then((feed) => setExtra((current) => current[pillar] === feed.articles ? current : { ...current, [pillar]: feed.articles }))
        .catch(() => undefined);
    }
    return () => controller.abort();
  }, [shortKey]);
  useEffect(() => {
    remember([...p0.articles, ...japan.articles, ...Object.values(extra).flat()]);
  }, [extra, japan.articles, p0.articles, remember]);
  const onPage = new Set(articles.map((article) => article.id));
  const used = new Set<string>();
  const columns = pillarOrder.map((pillar, index) => {
    const items = [...own[index]];
    if (!noTopUp) for (const article of extra[pillar] ?? []) {
      if (items.length >= 3) break;
      if (!onPage.has(article.id) && !used.has(article.id)) items.push(article);
    }
    items.forEach((article) => used.add(article.id));
    return { pillar, items };
  });

  const onFocus = (event: FocusEvent<HTMLDivElement>) => {
    const id = (event.target as HTMLElement).closest?.('[data-article]')?.getAttribute('data-article');
    if (id && id !== selectedId) onSelect(id);
  };
  const clearAll = () => update({ channel: 'action', region: 'ALL', priority: 'ALL', chapter: '', pillar: 'すべて', topic: 'すべて', query: '' });

  return <div className="fp" onFocus={onFocus}>
    <Masthead searchRef={searchRef} filtersOpen={filtersOpen} filterCount={filterCount} onToggleFilters={() => setFiltersOpen((open) => !open)} />
    <FilterStrip open={filtersOpen} />
    <Chips />
    {filtered && <p className="fp-edition" aria-live="polite">{state.channel === 'saved' ? '保存した記事' : '絞り込みの紙面'}　{loading && !articles.length ? '—' : `${pagination.total.toLocaleString('ja-JP')}件`}</p>}

    {error && <p className="notice is-error">{error}</p>}
    {!error && loading && !articles.length && <p className="notice" aria-live="polite">紙面を組んでいます…</p>}
    {!error && !loading && !articles.length && <div className="notice fp-none">
      <p>{state.channel === 'saved' ? 'まだ保存した記事はありません。' : 'この条件に一致する記事はありません。'}</p>
      {filterCount > 0 && <button type="button" className="text-link" onClick={clearAll}><span>絞り込みを解除する</span></button>}
    </div>}

    <div className={loading && articles.length ? 'fp-is-loading' : undefined}>
      {top && <TopStory article={top} kata={kata} selectedId={selectedId} />}
      {second.length > 0 && <section className="fp-second" aria-label="きょうの主な記事">{second.map((article) => <SecondStory key={article.id} article={article} selectedId={selectedId} />)}</section>}
    </div>

    <section className="fp-third" aria-label="きょう対応・日本レンズ・二十四の問い">
      <TodayDesk feed={p0} selectedId={selectedId} />
      <JapanLens feed={japan} selectedId={selectedId} />
      <QuestionTable coverage={coverage} />
    </section>

    {columns.some((column) => column.items.length) && <div className={loading && articles.length ? 'fp-is-loading' : undefined}><PillarColumns columns={columns} selectedId={selectedId} /></div>}
    <Pager pagination={pagination} />
    <SiteFooter />
  </div>;
});

export default FrontPage;
