import { pillarLabels, type Article, type SortOrder } from '../../data/articles';
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

const normalize = (value: string) => value.replace(/\s+/g, '').slice(0, 60);

// Generated notes often restate the title or summary; only show text that adds something.
function addsInformation(note: string, article: Article) {
  if (!note.trim()) return false;
  const key = normalize(note);
  return !normalize(article.summary).includes(key.slice(0, 30)) && !normalize(article.title).includes(key.slice(0, 30));
}

export default function SignalRow({ article, sort, saved, selected, section, onSelect, onSave }: Props) {
  const tags = [...article.topicLayers, ...article.affectedStack].filter((tag, index, items) => items.indexOf(tag) === index).slice(0, 3);
  const openSource = () => { void fetch(`/api/articles/${article.id}/open`, { method: 'POST' }); track('source_click', section, article.id); };
  const note = addsInformation(article.recommendedAction, article) ? article.recommendedAction : '';
  const evidence = addsInformation(article.evidence, article) && article.evidence !== note ? article.evidence : '';
  return <article className={`intel-row priority-${article.priority.toLowerCase()} ${selected ? 'is-selected' : ''}`}>
    <button className="intel-main" onClick={onSelect} aria-expanded={selected}>
      <span className="priority-badge" title={`優先度 ${article.priority}`}>{article.priority}</span>
      <div className="intel-content">
        <h3>{article.title}</h3>
        <div className="intel-meta"><b>{article.source}</b><span>{article.region === 'Japan' ? '日本' : 'Global'}</span><span>{pillarLabels[article.corePillar] || article.corePillar}</span><span>{articleTime(article, sort)}</span>{tags.map((tag) => <em key={tag}>{tag}</em>)}</div>
        {!selected && <p>{article.summary}</p>}
      </div>
    </button>
    <div className="row-actions">
      <a href={article.url} target="_blank" rel="noreferrer" onClick={openSource} aria-label="一次情報を開く" title="一次情報を開く"><Icon name="external" size={16} /></a>
      <button className={`bookmark-button ${saved ? 'is-saved' : ''}`} onClick={onSave} aria-label={saved ? '保存を解除' : '保存する'} title={saved ? '保存を解除' : '保存する'}><Icon name="bookmark" size={17} /></button>
    </div>
    {selected && <div className="evidence-panel">
      <p className="article-summary">{article.summary}</p>
      {(note || evidence) && <dl>
        {note && <div><dt>確認ポイント</dt><dd>{note}</dd></div>}
        {evidence && <div><dt>関連箇所</dt><dd>{evidence}</dd></div>}
      </dl>}
      <div className="evidence-foot">
        <a href={article.url} target="_blank" rel="noreferrer" onClick={openSource}>一次情報を読む<Icon name="external" size={14} /></a>
        <small>分類・メモは自動生成です · 関連度 {article.score}/100 · {article.contentType}</small>
      </div>
    </div>}
  </article>;
}
