import { forwardRef, useEffect, useMemo, useRef } from 'react';

import { pillarLabels, priorityMeta, type Article, type Priority, type SortOrder } from '../../data/articles';
import Icon from './Icon';
import { dayKey, dayLabel, type CoverageChapter, type Pagination } from './model';
import SignalRow from './SignalRow';
import type { RadarState } from './useRadarState';

type Props = {
  state: RadarState;
  articles: Article[];
  pagination: Pagination;
  loading: boolean;
  error: string;
  coverage: CoverageChapter[];
  selectedId: string;
  savedIds: string[];
  onChange: (patch: Partial<RadarState>) => void;
  onSelect: (article: Article) => void;
  onSave: (article: Article) => void;
  onOpenFilters: () => void;
};

const sortOptions: Array<{ value: SortOrder; label: string }> = [
  { value: 'newest', label: '新着順' },
  { value: 'priority', label: '優先度順' },
  { value: 'published', label: '公開日順' }
];

type Group = { key: string; label: string; items: Article[] };

function groupArticles(articles: Article[], sort: SortOrder): Group[] {
  const groups: Group[] = [];
  for (const article of articles) {
    const key = sort === 'priority' ? article.priority : dayKey(sort === 'published' ? article.publishedAt || article.collectedAt : article.collectedAt || article.publishedAt);
    let group = groups.at(-1);
    if (!group || group.key !== key) {
      const label = sort === 'priority' ? `${key} · ${priorityMeta[key as Priority].label}` : dayLabel(key);
      group = { key, label, items: [] };
      groups.push(group);
    }
    group.items.push(article);
  }
  return groups;
}

function pageWindow(page: number, totalPages: number) {
  const start = Math.max(1, Math.min(page - 2, totalPages - 4));
  return Array.from({ length: Math.min(5, totalPages) }, (_, index) => start + index);
}

const SignalList = forwardRef<HTMLInputElement, Props>(function SignalList({ state, articles, pagination, loading, error, coverage, selectedId, savedIds, onChange, onSelect, onSave, onOpenFilters }, searchRef) {
  const groups = useMemo(() => groupArticles(articles, state.sort), [articles, state.sort]);
  const listRef = useRef<HTMLElement>(null);
  const headRef = useRef<HTMLElement>(null);

  // Day headers stick just below the list header, whose height changes with the filter chips.
  useEffect(() => {
    const head = headRef.current;
    if (!head || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => listRef.current?.style.setProperty('--list-head', `${head.offsetHeight}px`));
    observer.observe(head);
    return () => observer.disconnect();
  }, []);
  const chapterTitle = state.chapter ? coverage.find((item) => item.id === state.chapter)?.titleJa ?? state.chapter : '';
  const title = state.channel === 'saved' ? '保存済み' : state.channel === 'research' ? 'リサーチ' : '収集情報';
  const first = (pagination.page - 1) * pagination.pageSize + 1;
  const last = Math.min(pagination.total, first + articles.length - 1);

  const chips: Array<{ key: string; label: string; clear: Partial<RadarState> }> = [
    ...(state.region !== 'ALL' ? [{ key: 'region', label: state.region === 'Japan' ? '日本' : 'グローバル', clear: { region: 'ALL' as const } }] : []),
    ...(state.priority !== 'ALL' ? [{ key: 'priority', label: `${state.priority} ${priorityMeta[state.priority].label}`, clear: { priority: 'ALL' as const } }] : []),
    ...(chapterTitle ? [{ key: 'chapter', label: `問い: ${chapterTitle}`, clear: { chapter: '', pillar: 'すべて' } }] : []),
    ...(state.pillar !== 'すべて' && !state.chapter ? [{ key: 'pillar', label: pillarLabels[state.pillar], clear: { pillar: 'すべて' } }] : []),
    ...(state.topic !== 'すべて' ? [{ key: 'topic', label: state.topic, clear: { topic: 'すべて' } }] : []),
    ...(state.query.trim() ? [{ key: 'q', label: `「${state.query.trim()}」`, clear: { query: '' } }] : [])
  ];
  const clearAll: Partial<RadarState> = { region: 'ALL', priority: 'ALL', chapter: '', pillar: 'すべて', topic: 'すべて', query: '' };

  return <section ref={listRef} className="list" aria-labelledby="list-title">
    <header ref={headRef} className="list-head">
      <div className="search-row">
        <label className="search">
          <Icon name="search" size={16} />
          <span className="visually-hidden">検索</span>
          <input ref={searchRef} type="search" value={state.query} onChange={(event) => onChange({ query: event.target.value })} placeholder="企業・技術・課題で検索" />
          <kbd aria-hidden="true">/</kbd>
        </label>
        <button className="button filter-trigger" onClick={onOpenFilters}><Icon name="filter" size={15} />絞り込み{chips.length > 0 && <span className="badge mono">{chips.length}</span>}</button>
      </div>
      <div className="title-row">
        <div className="title-block">
          <h1 id="list-title">{title}</h1>
          <span className="mono count" aria-live="polite">{loading && !articles.length ? '—' : pagination.total.toLocaleString('ja-JP')}件</span>
        </div>
        <div className="title-tools">
          {state.channel !== 'saved' && <div className="tabs" role="group" aria-label="情報の種類">
            <button className={state.channel === 'action' ? 'active' : ''} aria-pressed={state.channel === 'action'} onClick={() => onChange({ channel: 'action' })}>実務</button>
            <button className={state.channel === 'research' ? 'active' : ''} aria-pressed={state.channel === 'research'} onClick={() => onChange({ channel: 'research' })}>リサーチ</button>
          </div>}
          <label className="select"><span className="visually-hidden">並び順</span><select value={state.sort} onChange={(event) => onChange({ sort: event.target.value as SortOrder })}>{sortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        </div>
      </div>
      {chips.length > 0 && <div className="chips">{chips.map((chip) => <button key={chip.key} className="chip" onClick={() => onChange(chip.clear)} aria-label={`${chip.label} を解除`}>{chip.label}<Icon name="close" size={12} /></button>)}{chips.length > 1 && <button className="chip-clear" onClick={() => onChange(clearAll)}>すべて解除</button>}</div>}
    </header>

    {error && <div className="notice is-error"><Icon name="alert" size={16} />{error}</div>}
    {!error && !loading && articles.length === 0 && <div className="notice">
      <b>{state.channel === 'saved' ? 'まだ保存した記事はありません。' : 'この条件に一致する記事はありません。'}</b>
      {chips.length > 0 && <button className="text-link" onClick={() => onChange(clearAll)}>絞り込みを解除する</button>}
    </div>}
    {loading && articles.length === 0 && <ol className="skeleton" aria-hidden="true">{Array.from({ length: 6 }, (_, index) => <li key={index}><i /><i /><i /></li>)}</ol>}

    <div className={`groups ${loading && articles.length ? 'is-loading' : ''}`}>{groups.map((group) => <section key={group.key} className="group">
      <h2 className="group-label"><span>{group.label}</span><span className="mono">{group.items.length}</span></h2>
      <ol>{group.items.map((article) => <SignalRow key={article.id} article={article} sort={state.sort} saved={savedIds.includes(article.id)} selected={selectedId === article.id} onSelect={() => onSelect(article)} onSave={() => onSave(article)} />)}</ol>
    </section>)}</div>

    {pagination.totalPages > 1 && <nav className="pager" aria-label="ページ送り">
      <span className="mono">{first}–{last} / {pagination.total.toLocaleString('ja-JP')}</span>
      <div>
        <button className="icon-button" aria-label="前のページ" disabled={state.page === 1} onClick={() => onChange({ page: state.page - 1 })}><Icon name="arrowLeft" size={15} /></button>
        {pageWindow(state.page, pagination.totalPages).map((number) => <button key={number} className={`page mono ${state.page === number ? 'active' : ''}`} aria-current={state.page === number ? 'page' : undefined} onClick={() => onChange({ page: number })}>{number}</button>)}
        <button className="icon-button" aria-label="次のページ" disabled={state.page === pagination.totalPages} onClick={() => onChange({ page: state.page + 1 })}><Icon name="arrowRight" size={15} /></button>
      </div>
    </nav>}
  </section>;
});

export default SignalList;
