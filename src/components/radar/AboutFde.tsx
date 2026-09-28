import { priorityMeta, type Priority } from '../../data/articles';
import Icon from './Icon';
import { formatDate, type Overview } from './model';

type Props = {
  overview: Overview;
  onKnowledge: () => void;
  onSignals: () => void;
};

const fieldLoop = [
  ['顧客理解', '業務、制約、利用者、解くべき問題を現場で確認する。'],
  ['要件定義', '成果指標、対象範囲、評価基準を決める。'],
  ['構築・評価', 'モデルと既存システムをつなぎ、動くものを作って検証する。'],
  ['本番導入', 'データ、認証、権限、監視、費用を整えて運用に乗せる。'],
  ['フィードバック', '効果を測り、学びを製品や再利用できる型に戻す。']
] as const;

export default function AboutFde({ overview, onKnowledge, onSignals }: Props) {
  const counts = overview.counts ?? {};
  const stats: Array<[string, string]> = [
    ['公開中', `${counts.total ?? '—'}件`],
    ['うち日本', `${counts.japan ?? '—'}件`],
    ['収集元', `${overview.sources?.length ?? '—'}`],
    ['最終収集', formatDate(overview.last_ingested_at)]
  ];
  return <main className="about-page" id="top">
    <header className="about-head">
      <h1>FDE RADAR について</h1>
      <p>AIを実際の業務へ導入するときに役立つ一次情報（公式発表、導入事例、制度・ガイドライン、セキュリティ、求人）を6時間ごとに収集し、FDEの観点で分類して並べています。モデル性能だけの話題や一般的なAIニュースは除外しています。</p>
      <dl className="about-stats">{stats.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      <div className="intro-actions"><button onClick={onSignals}>収集情報を見る<Icon name="arrowRight" size={16} /></button><button onClick={onKnowledge}>24の問いから探す<Icon name="map" size={16} /></button></div>
    </header>

    <section className="about-block">
      <h2>FDE（Forward Deployed Engineer）とは</h2>
      <p>顧客の現場に入り、課題の特定から実装、本番導入、利用定着までを一人称で担うエンジニアです。調整役ではなく、自分で技術判断とコードを書きます。仕事は次の5段階の繰り返しです。</p>
      <ol className="loop-list">{fieldLoop.map(([title, copy]) => <li key={title}><b>{title}</b><span>{copy}</span></li>)}</ol>
    </section>

    <section className="about-block">
      <h2>優先度の読み方</h2>
      <table className="priority-table"><tbody>{(['P0', 'P1', 'P2'] as Priority[]).map((key) => <tr key={key} className={`priority-${key.toLowerCase()}`}>
        <th><span className="priority-badge">{key}</span></th><td><b>{priorityMeta[key].label}</b></td><td>{priorityMeta[key].description}</td><td className="num">{counts[key.toLowerCase() as 'p0' | 'p1' | 'p2'] ?? '—'}件</td>
      </tr>)}</tbody></table>
    </section>

    <section className="about-block">
      <h2>収集と分類の仕組み</h2>
      <ul className="plain-list">
        <li>公式 RSS・API・公開ページのみを取得します。ログイン壁や利用条件は迂回しません。</li>
        <li>キーワード規則で明確に対象外のものを除外し、境界的な候補だけを Workers AI（Llama 3.1 8B）で判定します。</li>
        <li>各記事を5つの観点・24の問い・P0〜P2に分類します。</li>
      </ul>
      <p className="about-note"><Icon name="alert" size={15} />要約・確認ポイント・分類は自動生成のため誤りを含むことがあります。判断の前に必ず一次情報を確認してください。</p>
    </section>

    <section className="about-block">
      <h2>参考にした求人票</h2>
      <ul className="link-list">
        <li><a href="https://openai.com/careers/forward-deployed-engineer-tokyo-tokyo-japan/" target="_blank" rel="noreferrer">OpenAI — Forward Deployed Engineer, Tokyo<Icon name="external" size={13} /></a><span>発見から本番展開までを担当。成功指標は本番採用と業務への測定可能な影響。</span></li>
        <li><a href="https://scale.com/careers/4593571005" target="_blank" rel="noreferrer">Scale AI — Forward Deployed Engineer, GenAI<Icon name="external" size={13} /></a><span>顧客固有のインフラを構築し、企業・政府の課題をエンジニアリングに落とす。</span></li>
      </ul>
    </section>
  </main>;
}
