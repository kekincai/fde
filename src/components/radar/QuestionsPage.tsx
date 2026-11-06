import { Fragment, useMemo } from 'react';

import { pillarLabels, type Article } from '../../data/articles';
import { dayKey, type CoverageChapter } from './model';
import { ArticleLink, ChapterLink, PaperHeader, SiteFooter, usePaper } from './Paper';
import { kanjiNum, kanjiTime, pillarOrder, pillarOrdinals } from './typeset';

export type QuestionsPageProps = {
  /** Latest 一面 list, for 「きょうの一面の章」 and today's new titles per chapter. */
  articles: Article[];
};

type Chapter = CoverageChapter & { japanCount?: number };

const isThin = (chapter: Chapter) => chapter.status !== 'healthy';

/** Today's articles (JST) grouped by chapter, plus the chapters on today's 一面. */
function useToday(articles: Article[]) {
  return useMemo(() => {
    const today = dayKey(new Date().toISOString());
    const newByChapter = new Map<string, Article[]>();
    const onFront = new Set<string>();
    for (const article of articles) {
      if (!article.chapterId) continue;
      onFront.add(article.chapterId);
      if (dayKey(article.collectedAt || article.publishedAt) !== today) continue;
      newByChapter.set(article.chapterId, [...(newByChapter.get(article.chapterId) ?? []), article]);
    }
    return { newByChapter, onFront };
  }, [articles]);
}

/** 「A」「B」が加わった — horizontal or vertical, with real links. */
function NewTitles({ items, limit, suffix }: { items: Article[]; limit: number; suffix: string }) {
  if (!items.length) return null;
  return <>{items.slice(0, limit).map((article, index) => <Fragment key={article.id}>
    {index > 0 && '、'}「<ArticleLink article={article}>{article.title}</ArticleLink>」
  </Fragment>)}{suffix}</>;
}

function Count({ chapter, size = 'lg' }: { chapter: Chapter; size?: 'lg' | 'sm' }) {
  return <p className={`qp-count qp-count-${size}`}>
    <b className={isThin(chapter) ? 'shu' : ''}>{chapter.publishedCount.toLocaleString('ja-JP')}</b> 件 · 情報源 {chapter.sourceCount}
  </p>;
}

type DanProps = { pillar: string; index: number; chapters: Chapter[]; newByChapter: Map<string, Article[]>; onFront: Set<string> };

/** One 段: vertical pillar heading → lead question (most articles) → the rest by weight → thin chapters boxed in 朱. */
function Dan({ pillar, index, chapters, newByChapter, onFront }: DanProps) {
  const sorted = [...chapters].sort((a, b) => b.publishedCount - a.publishedCount);
  const total = chapters.reduce((sum, item) => sum + item.publishedCount, 0);
  const lead = sorted[0];
  const rest = sorted.slice(1);
  const healthy = rest.filter((item) => !isThin(item));
  const thin = rest.filter(isThin);
  // Heavier questions get a headline and a line of copy; the lighter ones share a cell.
  const major = healthy.slice(0, thin.length ? 1 : 2);
  const minor = healthy.slice(major.length);
  const label = pillarLabels[pillar] ?? pillar;
  const id = `qp-${pillar.toLowerCase()}`;
  if (!lead) return null;

  const leadNew = newByChapter.get(lead.id) ?? [];
  const share = total ? Math.round(lead.publishedCount / total * 100) : 0;

  return <section className="qp-dan" aria-labelledby={id}>
    <h2 id={id} className="qp-dan-head tate">
      <span className="qp-dan-kicker">{pillarOrdinals[index]}　{pillar}　{kanjiNum(chapters.length)}問　{kanjiNum(total)}件</span>
      <span className="qp-dan-name">{label}</span>
    </h2>

    <article className={`qp-lead ${onFront.has(lead.id) ? 'is-front' : ''}`}>
      <h3 className="qp-lead-title tate hl"><ChapterLink id={lead.id}>{lead.questionJa}</ChapterLink></h3>
      <div className="qp-lead-body tate-body">
        <p>{isThin(lead) ? '件数はまだ少ないが、' : 'この工程で最も厚い章。'}{kanjiNum(lead.publishedCount)}件、情報源{kanjiNum(lead.sourceCount)}。{share > 0 && `工程全体の${kanjiNum(share)}％を占める。`}{lead.japanCount ? `うち日本の記事は${kanjiNum(lead.japanCount)}件。` : ''}</p>
        <p>{leadNew.length ? <>きょうは<NewTitles items={leadNew} limit={3} suffix="が加わった。" /></> : 'きょうの新着はまだない。'}</p>
        <p className="byline">（{lead.titleJa}）</p>
      </div>
    </article>

    <div className="qp-rest">
      {major.map((chapter) => {
        const items = newByChapter.get(chapter.id) ?? [];
        return <article key={chapter.id} className={`qp-cell qp-major ${onFront.has(chapter.id) ? 'is-front' : ''}`}>
          <p className="qp-kicker">{chapter.titleJa}</p>
          <h3 className="qp-q qp-q-lg"><ChapterLink id={chapter.id}>{chapter.questionJa}</ChapterLink></h3>
          <p className="qp-note">{items.length ? <NewTitles items={items} limit={2} suffix="が新着。" /> : chapter.japanCount ? `日本の記事${chapter.japanCount.toLocaleString('ja-JP')}件を含む。` : '一次情報を継続して収集している。'}</p>
          <Count chapter={chapter} />
        </article>;
      })}
      {minor.length > 0 && <div className="qp-cell qp-minors">{minor.map((chapter) => <article key={chapter.id} className={`qp-minor ${onFront.has(chapter.id) ? 'is-front' : ''}`}>
        <p className="qp-kicker">{chapter.titleJa}</p>
        <h3 className="qp-q qp-q-sm"><ChapterLink id={chapter.id}>{chapter.questionJa}</ChapterLink></h3>
        <Count chapter={chapter} size="sm" />
      </article>)}</div>}
      {thin.length > 0 && <aside className={`qp-cell qp-thin ${thin.length > 1 ? 'is-pair' : ''}`} aria-label={`${label}の薄い章`}>
        <p className="qp-thin-head">薄い章{thin.length > 1 ? '　情報源を増やしている問い' : ''}</p>
        {thin.map((chapter) => <div key={chapter.id} className={`qp-thin-item ${onFront.has(chapter.id) ? 'is-front' : ''}`}>
          <p className="qp-kicker">{chapter.titleJa}</p>
          <h3 className="qp-q qp-q-sm"><ChapterLink id={chapter.id}>{chapter.questionJa}</ChapterLink></h3>
          <Count chapter={chapter} size="sm" />
        </div>)}
      </aside>}
    </div>
  </section>;
}

/** 三面 — the 24 questions as a knowledge map, one 段 per pillar. */
export default function QuestionsPage({ articles }: QuestionsPageProps) {
  const paper = usePaper();
  const chapters = paper.coverage as Chapter[];
  const { newByChapter, onFront } = useToday(articles);
  const healthy = chapters.filter((item) => !isThin(item)).length;
  const thin = chapters.length - healthy;
  const published = paper.overview.counts?.total ?? chapters.reduce((sum, item) => sum + item.publishedCount, 0);

  return <article className="qp" aria-labelledby="qp-title">
    <PaperHeader current="questions" folio="（三面）　ナレッジマップ" />

    <section className="qp-masthead">
      <header className="qp-title">
        <h1 id="qp-title" className="qp-h1 tate hl">二十四の問いで<br />現場を見る</h1>
        <p className="qp-h1-sub tate hl-sub">五つの工程に、きょう何件の一次情報が答えたか</p>
      </header>
      <div className="qp-intro tate-body">
        <p>本紙は記事を「新着順」ではなく、現場で実際に問われる二十四の問いに振り分けている。顧客課題を理解し、小さく作って確かめ、既存の現場へつなぎ、品質と権限とリスクを守り、運用を定着させて型に残す。この五つの工程は一度で終わらず、学びは次の課題へ戻る。</p>
        <p>各工程の段では、いま最も記事が厚い問いを大きく扱い、残る問いを件数の順に小さく並べた。赤枠の章は、話題が少ないのではなく、一次情報としてまだ十分に集まっていない章である。問いを選ぶと、一面がその問いの記事だけに絞られる。</p>
      </div>
      <dl className="qp-tally" aria-label="集計">
        <div className="tate"><dt>健全な章</dt><dd>{kanjiNum(healthy)}</dd></div>
        <div className="tate shu"><dt>薄い章</dt><dd>{kanjiNum(thin)}</dd></div>
        <div className="tate"><dt>公開記事</dt><dd>{kanjiNum(published)}件</dd></div>
      </dl>
    </section>

    {chapters.length === 0
      ? <p className="notice">集計を読み込んでいます…</p>
      : pillarOrder.map((pillar, index) => <Dan key={pillar} pillar={pillar} index={index} chapters={chapters.filter((item) => item.pillar === pillar)} newByChapter={newByChapter} onFront={onFront} />)}

    <footer className="qp-legend">
      <p>
        <b>凡例</b>
        <span>各段の縦見出しは、その工程で最も記事が厚い問い</span>
        <span className="qp-key"><i className="qp-key-thin" aria-hidden="true" />薄い章（最低記事数または最低情報源数に未達）</span>
        <span className="qp-key"><i className="qp-key-front" aria-hidden="true" />きょうの一面の章</span>
        <span>{kanjiTime(paper.overview.last_ingested_at)}更新</span>
      </p>
      <a className="text-link underline" href="/api/coverage" target="_blank" rel="noreferrer">この集計を API で取得（/api/coverage）</a>
    </footer>
    <SiteFooter />
  </article>;
}
