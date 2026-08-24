import { pillarLabels } from '../../data/articles';
import Icon, { type IconName } from './Icon';
import type { CoverageChapter } from './model';

type Props = {
  coverage: CoverageChapter[];
  selectedChapter: string;
  onSelect: (chapter: CoverageChapter) => void;
};

const chapterPillars = ['Customer', 'Build', 'Deploy', 'Govern', 'Organization'];
const pillarIcons: Record<string, IconName> = { Customer: 'users', Build: 'code', Deploy: 'server', Govern: 'shield', Organization: 'building' };
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

const coverageText = (chapter: CoverageChapter) => chapter.publishedCount > 0
  ? `資料 ${chapter.publishedCount}件 · 収集元 ${chapter.sourceCount}`
  : `関連資料を収集中 · 収集元 ${chapter.sourceCount}`;

export default function KnowledgeMap({ coverage, selectedChapter, onSelect }: Props) {
  return <section className="knowledge-page" aria-labelledby="knowledge-title">
    <header className="knowledge-head">
      <div className="knowledge-title"><Icon name="map" size={38} /><div><h1 id="knowledge-title">現場導入を、24の問いで読む。</h1><p>顧客課題から組織定着まで、知りたい問いを選ぶと関連する一次情報へ進めます。</p></div></div>
      <strong><Icon name="book" size={23} />{coverage.length}<small>の実務の問い</small></strong>
    </header>
    <div className="chapter-columns">{chapterPillars.map((chapterPillar) => <section key={chapterPillar}>
      <h2><Icon name={pillarIcons[chapterPillar]} size={21} />{pillarLabels[chapterPillar]}</h2>
      {coverage.filter((item) => item.pillar === chapterPillar).map((item) => <button key={item.id} className={selectedChapter === item.id ? 'active' : ''} onClick={() => onSelect(item)} aria-label={`${item.titleJa}。${item.questionJa}。${coverageText(item)}`}>
        <span className="chapter-symbol"><Icon name={chapterIcons[item.id] ?? 'compass'} size={19} /></span><span className="chapter-copy"><b>{item.titleJa}</b><small>{item.questionJa}</small><em>{coverageText(item)}</em></span>
      </button>)}
    </section>)}</div>
  </section>;
}
