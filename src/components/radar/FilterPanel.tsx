import { pillarLabels, pillars, priorityMeta, topics, type Priority, type Region } from '../../data/articles';
import { PriorityTag } from './Chrome';
import Icon from './Icon';
import type { Overview } from './model';
import type { RadarState } from './useRadarState';

type Props = {
  state: RadarState;
  overview: Overview;
  onChange: (patch: Partial<RadarState>) => void;
  onKnowledge: () => void;
};

const regions: Array<[Region | 'ALL', string]> = [['ALL', 'すべて'], ['Japan', '日本'], ['Global', 'グローバル']];

export default function FilterPanel({ state, overview, onChange, onKnowledge }: Props) {
  const counts = overview.counts ?? {};
  return <div className="filters">
    <section>
      <h3>地域</h3>
      <div className="segmented" role="group" aria-label="地域">{regions.map(([value, label]) => <button key={value} className={state.region === value ? 'active' : ''} aria-pressed={state.region === value} onClick={() => onChange({ region: value })}>{label}</button>)}</div>
    </section>
    <section>
      <h3>優先度</h3>
      <div className="option-list" role="group" aria-label="優先度">{(['P0', 'P1', 'P2'] as Priority[]).map((key) => <button key={key} className={state.priority === key ? 'active' : ''} aria-pressed={state.priority === key} title={priorityMeta[key].description} onClick={() => onChange({ priority: state.priority === key ? 'ALL' : key })}>
        <PriorityTag priority={key} /><span>{priorityMeta[key].label}</span><span className="option-count mono">{counts[key.toLowerCase() as 'p0' | 'p1' | 'p2'] ?? ''}</span>
      </button>)}</div>
    </section>
    <section>
      <h3>観点</h3>
      <div className="option-list" role="group" aria-label="観点">{pillars.filter((item) => item !== 'すべて').map((item) => {
        const active = state.pillar === item && !state.chapter;
        return <button key={item} className={active ? 'active' : ''} aria-pressed={active} onClick={() => onChange({ pillar: active ? 'すべて' : item, chapter: '' })}><span>{pillarLabels[item]}</span></button>;
      })}</div>
    </section>
    <section>
      <h3>テーマ</h3>
      <div className="tag-list" role="group" aria-label="テーマ">{topics.filter((item) => item !== 'すべて').map((item) => <button key={item} className={state.topic === item ? 'active' : ''} aria-pressed={state.topic === item} onClick={() => onChange({ topic: state.topic === item ? 'すべて' : item })}>{item}</button>)}</div>
    </section>
    <button className="text-link" onClick={onKnowledge}>24の問いから探す<Icon name="arrowRight" size={14} /></button>
  </div>;
}
