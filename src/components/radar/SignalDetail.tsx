import { pillarLabels, priorityMeta, type Article } from '../../data/articles';
import { PriorityTag } from './Chrome';
import Icon from './Icon';
import { formatDate, usefulNote } from './model';

function hostOf(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

type Props = {
  article: Article | null;
  saved: boolean;
  onClose: () => void;
  onSave: () => void;
  onOpenSource: () => void;
};

export default function SignalDetail({ article, saved, onClose, onSave, onOpenSource }: Props) {
  if (!article) {
    return <aside className="detail" aria-label="記事の詳細">
      <div className="detail-empty">
        <p>記事を選ぶと、ここに概要が表示されます。</p>
        <dl className="shortcuts">
          <div><dt><kbd>j</kbd><kbd>k</kbd></dt><dd>次 / 前の記事</dd></div>
          <div><dt><kbd>o</kbd></dt><dd>一次情報を開く</dd></div>
          <div><dt><kbd>s</kbd></dt><dd>保存</dd></div>
          <div><dt><kbd>/</kbd></dt><dd>検索</dd></div>
        </dl>
      </div>
    </aside>;
  }

  const note = usefulNote(article.recommendedAction, article);
  const evidence = usefulNote(article.evidence, article);
  const tags = [...article.topicLayers, ...article.affectedStack, ...article.relevanceTags].filter((tag, index, items) => tag && items.indexOf(tag) === index).slice(0, 6);
  return <aside className="detail is-open" aria-label="記事の詳細">
    <div className="detail-inner" key={article.id}>
      <header className="detail-head">
        <PriorityTag priority={article.priority} label />
        <button className="icon-button detail-close" onClick={onClose} aria-label="詳細を閉じる"><Icon name="close" size={18} /></button>
      </header>
      <p className="detail-source"><b>{article.source}</b><span>{article.region === 'Japan' ? '日本' : 'Global'}</span><span>{pillarLabels[article.corePillar] || article.corePillar}</span></p>
      <h2>{article.title}</h2>
      <p className="detail-summary">{article.summary}</p>
      {(note || (evidence && evidence !== note)) && <section className="detail-notes">
        <h3>自動メモ<span>生成された補足です。一次情報で確認してください。</span></h3>
        {note && <p><b>確認ポイント</b>{note}</p>}
        {evidence && evidence !== note && <p><b>関連箇所</b>{evidence}</p>}
      </section>}
      {tags.length > 0 && <ul className="detail-tags">{tags.map((tag) => <li key={tag}>{tag}</li>)}</ul>}
      <div className="detail-actions">
        <a className="button primary" href={article.url} target="_blank" rel="noreferrer" onClick={onOpenSource}>一次情報を読む<Icon name="external" size={15} /></a>
        <button className={`button ${saved ? 'is-on' : ''}`} onClick={onSave} aria-pressed={saved}><Icon name="bookmark" size={15} />{saved ? '保存済み' : '保存'}</button>
      </div>
      <dl className="detail-facts">
        <div><dt>優先度</dt><dd>{article.priority} · {priorityMeta[article.priority].label}</dd></div>
        <div><dt>公開</dt><dd className="mono">{formatDate(article.publishedAt)}</dd></div>
        <div><dt>収集</dt><dd className="mono">{formatDate(article.collectedAt)}</dd></div>
        <div><dt>種別</dt><dd>{article.contentType}</dd></div>
        <div><dt>関連度</dt><dd className="mono">{article.score}/100</dd></div>
        <div><dt>出典</dt><dd className="detail-url">{hostOf(article.url)}</dd></div>
      </dl>
    </div>
  </aside>;
}
