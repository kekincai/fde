import { pillarLabels } from '../../data/articles';
import type { CoverageChapter } from './model';

type Props = {
  coverage: CoverageChapter[];
  selectedChapter: string;
  onSelect: (chapter: CoverageChapter) => void;
};

const chapterPillars = ['Customer', 'Build', 'Deploy', 'Govern', 'Organization'];

export default function KnowledgeMap({ coverage, selectedChapter, onSelect }: Props) {
  return <section className="knowledge-page" aria-labelledby="knowledge-title">
    <header className="knowledge-head">
      <div><h1 id="knowledge-title">現場導入を、24の問いで読む。</h1><p>顧客課題から組織定着まで、知りたい問いを選ぶと関連する一次情報へ進めます。</p></div>
      <strong>{coverage.length}<small>の観点</small></strong>
    </header>
    <div className="chapter-columns">{chapterPillars.map((chapterPillar) => <section key={chapterPillar}>
      <h2>{pillarLabels[chapterPillar]}</h2>
      {coverage.filter((item) => item.pillar === chapterPillar).map((item) => <button key={item.id} className={`${selectedChapter === item.id ? 'active' : ''} status-${item.status}`} onClick={() => onSelect(item)}>
        <span>{item.titleJa}<small>{item.questionJa}</small></span><b>{item.publishedCount}</b>
      </button>)}
    </section>)}</div>
  </section>;
}
