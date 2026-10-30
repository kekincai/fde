import { pillarLabels, type Article, type SortOrder } from '../../data/articles';
import { PriorityTag } from './Chrome';
import Icon from './Icon';
import { shortTime } from './model';

type Props = {
  article: Article;
  sort: SortOrder;
  saved: boolean;
  selected: boolean;
  onSelect: () => void;
  onSave: () => void;
};

export default function SignalRow({ article, sort, saved, selected, onSelect, onSave }: Props) {
  const time = sort === 'published' ? article.publishedAt || article.collectedAt : article.collectedAt || article.publishedAt;
  return <li className={`row ${selected ? 'is-selected' : ''} ${saved ? 'is-saved' : ''}`} data-article={article.id}>
    <button className="row-main" onClick={onSelect} aria-pressed={selected}>
      <PriorityTag priority={article.priority} />
      <span className="row-body">
        <span className="row-title">{article.title}</span>
        <span className="row-meta"><b>{article.source}</b><span>{article.region === 'Japan' ? '日本' : 'Global'}</span><span>{pillarLabels[article.corePillar] || article.corePillar}</span></span>
        <span className="row-summary">{article.summary}</span>
      </span>
      <time className="row-time mono">{shortTime(time)}</time>
    </button>
    <button className="row-save icon-button" onClick={onSave} aria-label={saved ? '保存を解除' : '保存する'} aria-pressed={saved}><Icon name="bookmark" size={16} /></button>
  </li>;
}
