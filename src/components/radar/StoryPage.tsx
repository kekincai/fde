import { useEffect, useState } from 'react';

import { contentTypeLabels, decisionLabels, japanLensLabels, pillarLabels, priorityMeta, sourceKindLabels, type Article } from '../../data/articles';
import { fromApi, usefulNote, type ApiArticle } from './model';
import { ArticleLink, ChapterLink, PaperHeader, SectionLink, SiteFooter, usePaper } from './Paper';
import { actionItems, hostOf, kanjiDigits, kanjiMonthDay, kanjiNum, kanjiTime, monthDay, splitHeadline, zen } from './typeset';

type StoryPageProps = {
  /** null while a direct link is being resolved, or when the article was not found. */
  article: Article | null;
  loading: boolean;
  failed?: boolean;
  /** Neighbours in the current 一面 list. */
  prev: Article | null;
  next: Article | null;
};


function kanjiStamp(value: string): string {
  const day = kanjiMonthDay(value);
  return day ? `${day}　${kanjiTime(value)}` : '不明';
}

function uniqueTags(article: Article): string[] {
  return [...article.relevanceTags, ...article.topicLayers, ...article.affectedStack]
    .filter((tag, index, items) => tag && items.indexOf(tag) === index)
    .slice(0, 6);
}

/** Up to four other articles answering the same question. */
function useRelated(article: Article | null) {
  const [related, setRelated] = useState<{ id: string; items: Article[] }>({ id: '', items: [] });
  const chapterId = article?.chapterId ?? '';
  const articleId = article?.id ?? '';
  useEffect(() => {
    if (!chapterId) return;
    const controller = new AbortController();
    fetch(`/api/articles?chapter=${encodeURIComponent(chapterId)}&pageSize=5`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() as Promise<{ articles?: ApiArticle[] }> : { articles: [] })
      .then((data) => {
        const items = (data.articles ?? []).map(fromApi).filter((item): item is Article => Boolean(item) && item?.id !== articleId).slice(0, 4);
        setRelated({ id: articleId, items });
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [articleId, chapterId]);
  return related.id === articleId ? related.items : [];
}

export default function StoryPage({ article, loading, failed = false, prev, next }: StoryPageProps) {
  const paper = usePaper();
  const related = useRelated(article);
  const [copied, setCopied] = useState(false);

  useEffect(() => setCopied(false), [article?.id]);

  if (!article) {
    return <>
      <PaperHeader current="story" folio="（二面）" />
      <div className="st-missing" aria-live="polite">
        {loading
          ? <p className="notice">記事を探しています…</p>
          : <><p className="notice">{failed ? '記事を読み込めませんでした。時間をおいて再度お試しください。' : 'この記事は見つかりませんでした。'}</p><SectionLink to="front" className="btn btn-kuro">一面へ戻る</SectionLink></>}
      </div>
      <SiteFooter />
    </>;
  }

  const pillar = pillarLabels[article.corePillar] || article.corePillar;
  const { main, sub } = splitHeadline(article.title);
  const chapter = paper.coverage.find((item) => item.id === article.chapterId);
  const view = usefulNote(article.whyItMatters, article);
  const action = usefulNote(article.recommendedAction, article);
  const actions = action ? actionItems(action) : [];
  const evidence = usefulNote(article.evidence, article);
  const tags = uniqueTags(article);
  const saved = paper.savedIds.includes(article.id);
  const meta = priorityMeta[article.priority];
  const host = hostOf(article.url);
  const long = main.length > 24;

  const copyLink = async () => {
    const url = `${window.location.origin}${paper.articleHref(article.id)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2400);
    } catch {
      window.prompt('この記事のリンク', url);
    }
  };

  return <>
    <PaperHeader current="story" folio={`（二面）　${pillar}`} />

    {(prev || next) && <nav className="st-pager" aria-label="記事の前後">
      {prev ? <ArticleLink article={prev}><span aria-hidden="true">←</span><span>前の記事　{prev.title}</span></ArticleLink> : <span />}
      {next && <ArticleLink article={next} className="st-pager-next"><span>次の記事　{next.title}</span><span aria-hidden="true">→</span></ArticleLink>}
    </nav>}

    <article className="st-article tate-row" aria-labelledby="st-title" key={article.id}>
      <header className="st-head tate-row">
        <h1 id="st-title" className={`st-title hl tate ${long ? 'is-long' : ''}`}>{main}</h1>
        {sub && <p className="st-sub hl-sub tate">{sub}</p>}
        <ul className="st-meta tate" aria-label="記事の情報">
          <li className="st-pillar kuro">{pillar}</li>
          <li className={article.priority === 'P0' ? 'shu st-strong' : article.priority === 'P1' ? 'p1-text' : 'st-strong'}>{zen(article.priority)}　{meta.label}</li>
          <li>出典　{article.source}{sourceKindLabels[article.sourceKind] ? `（${sourceKindLabels[article.sourceKind]}）` : ''}</li>
          <li>公開　{kanjiStamp(article.publishedAt || article.collectedAt)}</li>
          <li>収集　{kanjiStamp(article.collectedAt)}</li>
          <li>種別　{contentTypeLabels[article.contentType] ?? article.contentType}</li>
          <li>関連度　{kanjiDigits(Math.round(article.score))}／一〇〇</li>
        </ul>
      </header>

      <div className="st-body tate-body">
        <p>{article.summary}</p>
        {view && <p>【本紙の見方】{view}</p>}
        {chapter && <p>本紙の分類では、この記事は「{pillarLabels[chapter.pillar] ?? chapter.pillar}」の章の「{chapter.questionJa}」という問いに答える一次情報として収録した。詳細は一次情報で確認が必要だ。</p>}
        <p className="byline">（{article.source}　{kanjiMonthDay(article.publishedAt || article.collectedAt)}）</p>
      </div>

      <aside className="st-side" aria-label="確認ポイントと一次情報">
        {(actions.length > 0 || evidence) && <section className="st-points kakomi">
          {actions.length > 0 && <>
            <h2 className="st-points-head">現場での確認ポイント</h2>
            <ol className="st-points-list">{actions.map((item, index) => <li key={index}><span className="st-num" aria-hidden="true">{kanjiNum(index + 1)}、</span>{item}</li>)}</ol>
          </>}
          {evidence && <>
            <h3 className="st-evidence-head">関連箇所</h3>
            <p className="st-evidence">{evidence}</p>
          </>}
          <p className="kakomi-note st-note">生成された補足。一次情報で確認を。</p>
        </section>}

        <a className="btn btn-kuro btn-wide st-source" href={article.url} target="_blank" rel="noreferrer" onClick={() => paper.openSource(article)}>
          一次情報を読む（{host}）<span aria-hidden="true">↗</span><span className="visually-hidden">（新しいタブで開きます）</span>
        </a>
        <div className="st-actions">
          <button type="button" className="btn" aria-pressed={saved} onClick={() => paper.toggleSave(article)}>{saved ? '保存済み' : '保存する'}</button>
          <button type="button" className="btn" onClick={copyLink}>{copied ? '複製しました' : 'リンクを複製'}</button>
        </div>
        <p className="visually-hidden" aria-live="polite">{copied ? 'リンクを複製しました' : ''}</p>

        <dl className="st-facts">
          {chapter && <><dt>章</dt><dd><ChapterLink id={chapter.id} className="st-chapter">{pillarLabels[chapter.pillar] ?? chapter.pillar} › {chapter.titleJa}　{chapter.questionJa}</ChapterLink></dd></>}
          {article.japanLens && <><dt>視点</dt><dd>日本レンズ　{japanLensLabels[article.japanLens] ?? article.japanLens}</dd></>}
          {tags.length > 0 && <><dt>影響</dt><dd>{tags.join(' · ')}</dd></>}
          {article.semanticDecision && <><dt>判定</dt><dd>編集審査 {decisionLabels[article.semanticDecision] ?? article.semanticDecision}{article.semanticConfidence > 0 ? `（確度 ${Math.round((article.semanticConfidence > 1 ? article.semanticConfidence / 100 : article.semanticConfidence) * 100)}%）` : ''}</dd></>}
          <dt>収集</dt><dd>{monthDay(article.collectedAt) || '不明'} · {article.region === 'Japan' ? '日本' : 'グローバル'}</dd>
        </dl>
      </aside>
    </article>

    <section className="st-related" aria-labelledby="st-related-head">
      <h2 id="st-related-head" className="st-related-head">
        <span>同じ問いの記事{chapter ? `　「${chapter.questionJa}」` : ''}</span>
        {chapter && <small>公開 {chapter.publishedCount} 件 · 情報源 {chapter.sourceCount}</small>}
      </h2>
      {related.length > 0
        ? <ol className="st-related-list">{related.map((item) => <li key={item.id}>
          <p className="st-related-meta">{item.source} · {monthDay(item.publishedAt || item.collectedAt)}</p>
          <ArticleLink article={item} className="st-related-title">{item.title}</ArticleLink>
        </li>)}</ol>
        : <p className="st-related-empty">{article.chapterId ? 'この問いの記事は、ほかにまだありません。' : 'この記事はまだ二十四の問いに分類されていません。'}</p>}
      <div className="st-endnote">
        <p>本文は保存していません。続きは一次情報でお読みください。要約と確認ポイントは自動生成で、一次情報の確認を前提にしています。</p>
        <SectionLink to="front" className="text-link underline">一面へ戻る</SectionLink>
      </div>
    </section>

    <SiteFooter />
  </>;
}
