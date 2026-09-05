import { pillarLabels, priorityMeta, type Article, type SortOrder } from '../../data/articles';
import { track, type AnalyticsSection } from '../../lib/analytics';
import Icon from './Icon';
import { articleTime } from './model';

type Props = {
  article: Article;
  sort: SortOrder;
  saved: boolean;
  selected: boolean;
  section: AnalyticsSection;
  onSelect: () => void;
  onSave: () => void;
};

export default function SignalRow({ article, sort, saved, selected, section, onSelect, onSave }: Props) {
  const tags = [...article.topicLayers, ...article.affectedStack].filter((tag, index, items) => items.indexOf(tag) === index).slice(0, 2);
  return <article className={`intel-row priority-${article.priority.toLowerCase()} ${selected ? 'is-selected' : ''}`}>
    <button className="intel-main" onClick={onSelect} aria-expanded={selected}>
      <span className="priority-badge">{article.priority}</span>
      <div className="intel-content">
        <div className="intel-meta"><b>{article.source}</b><span>{article.region === 'Japan' ? '日本' : 'Global'}</span><span>{pillarLabels[article.corePillar] || article.corePillar}</span><span>{articleTime(article, sort)}</span></div>
        <h3>{article.title}</h3>
        <p>{article.summary}</p>
        <div className="intel-tags">{tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
      </div>
    </button>
    <button className={`bookmark-button ${saved ? 'is-saved' : ''}`} onClick={onSave} aria-label={saved ? '保存を解除' : '保存する'}><Icon name="bookmark" /></button>
    {selected && <div className="evidence-panel">
      <div className="article-summary"><span>記事の概要</span><p>{article.summary}</p></div>
      <div><span>次に確認すること</span><strong>{priorityMeta[article.priority].label}</strong><p>{article.recommendedAction || 'この情報は背景理解のために保存し、関連シグナルと合わせて確認します。'}</p></div>
      <div><span>そう判断した根拠</span><p>{article.evidence || '情報源・内容・公開時刻から自動分類しています。'}</p><small>FDE関連度 {article.score}/100 · {article.contentType}</small></div>
      <a href={article.url} target="_blank" rel="noreferrer" onClick={() => { void fetch(`/api/articles/${article.id}/open`, { method: 'POST' }); track('source_click', section, article.id); }}>一次情報を読む<Icon name="external" size={15} /></a>
    </div>}
  </article>;
}
