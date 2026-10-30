import { pillarLabels } from '../../data/articles';
import Icon, { type IconName } from './Icon';
import type { CoverageChapter } from './model';

type Props = {
  coverage: CoverageChapter[];
  selectedChapter: string;
  onSelect: (chapter: CoverageChapter) => void;
};

const chapterPillars = ['Customer', 'Build', 'Deploy', 'Govern', 'Organization'];
const chapterIcons: Record<string, IconName> = {
  'customer.problem': 'messageQuestion',
  'customer.use-case': 'bulb',
  'customer.process': 'route',
  'customer.roi': 'chartLine',
  'build.agent': 'robot',
  'build.rag': 'databaseSearch',
  'build.integration': 'plugConnected',
  'build.legacy': 'transform',
  'deploy.cloud': 'cloudUpload',
  'deploy.on-prem': 'server2',
  'deploy.data': 'database',
  'deploy.identity': 'userShield',
  'deploy.observability': 'heartbeat',
  'deploy.cost': 'coins',
  'govern.security': 'shieldLock',
  'govern.evaluation': 'checklist',
  'govern.privacy': 'fingerprint',
  'govern.regulation': 'scale',
  'govern.reliability': 'lifebuoy',
  'organization.fde': 'userCode',
  'organization.coe': 'buildingCommunity',
  'organization.change': 'arrowsExchange',
  'organization.talent': 'userSearch',
  'organization.ai-native': 'sparkles'
};
const statusLabels: Record<CoverageChapter['status'], string> = { healthy: '十分', thin: '少なめ', empty: '収集中' };

export default function KnowledgeMap({ coverage, selectedChapter, onSelect }: Props) {
  const max = Math.max(1, ...coverage.map((item) => item.publishedCount));
  return <article className="page map-page" aria-labelledby="knowledge-title">
    <header className="page-head">
      <p className="eyebrow">Knowledge map</p>
      <h1 id="knowledge-title">24の問い</h1>
      <p className="lede">AI導入の現場で出てくる問いを、顧客課題から組織定着までの5段階に分けています。問いを選ぶと、関連する記事だけに絞り込みます。</p>
    </header>
    {chapterPillars.map((pillar, index) => {
      const chapters = coverage.filter((item) => item.pillar === pillar);
      const total = chapters.reduce((sum, item) => sum + item.publishedCount, 0);
      return <section key={pillar} className="map-stage">
        <h2><span className="mono">{String(index + 1).padStart(2, '0')}</span>{pillarLabels[pillar]}<small>{pillar}</small><span className="mono stage-total">{total.toLocaleString('ja-JP')}件</span></h2>
        <ul>{chapters.map((item) => <li key={item.id}><button className={selectedChapter === item.id ? 'active' : ''} onClick={() => onSelect(item)}>
          <span className="map-icon"><Icon name={chapterIcons[item.id] ?? 'compass'} size={17} /></span>
          <span className="map-copy"><b>{item.titleJa}</b><small>{item.questionJa}</small></span>
          <span className={`map-count status-${item.status}`} title={`収集元 ${item.sourceCount} · ${statusLabels[item.status]}`}>
            <span className="bar" aria-hidden="true"><i style={{ width: `${Math.max(item.publishedCount ? 4 : 0, item.publishedCount / max * 100)}%` }} /></span>
            <span className="mono">{item.publishedCount}</span>
          </span>
        </button></li>)}</ul>
      </section>;
    })}
  </article>;
}
