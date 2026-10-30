import { priorityMeta, type Priority } from '../../data/articles';
import { PriorityTag } from './Chrome';
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
    ['公開中の記事', (counts.total ?? 0).toLocaleString('ja-JP')],
    ['うち日本', (counts.japan ?? 0).toLocaleString('ja-JP')],
    ['収集元', String(overview.sources?.length ?? '—')],
    ['最終収集', formatDate(overview.last_ingested_at)]
  ];
  return <article className="page prose-page">
    <header className="page-head">
      <p className="eyebrow">About</p>
      <h1>AIを業務に入れる人のための、一次情報の索引。</h1>
      <p className="lede">公式発表、導入事例、制度・ガイドライン、セキュリティ、求人を6時間ごとに集め、FDEの観点で分類して並べています。モデル性能だけの話題や一般的なAIニュースは載せません。</p>
      <dl className="stat-row">{stats.map(([label, value]) => <div key={label}><dt>{label}</dt><dd className="mono">{value}</dd></div>)}</dl>
      <div className="button-row"><button className="button primary" onClick={onSignals}>収集情報を見る<Icon name="arrowRight" size={15} /></button><button className="button" onClick={onKnowledge}>24の問いから探す</button></div>
    </header>

    <section className="prose-section">
      <h2>FDE（Forward Deployed Engineer）とは</h2>
      <p>顧客の現場に入り、課題の特定から実装、本番導入、利用定着までを一人で通して担うエンジニアです。調整役ではなく、自分で技術判断をしてコードを書きます。仕事は次の5段階の繰り返しです。</p>
      <ol className="steps">{fieldLoop.map(([title, copy], index) => <li key={title}><span className="mono">{String(index + 1).padStart(2, '0')}</span><b>{title}</b><p>{copy}</p></li>)}</ol>
    </section>

    <section className="prose-section">
      <h2>優先度の読み方</h2>
      <ul className="priority-legend">{(['P0', 'P1', 'P2'] as Priority[]).map((key) => <li key={key}>
        <PriorityTag priority={key} label /><p>{priorityMeta[key].description}</p><span className="mono">{(counts[key.toLowerCase() as 'p0' | 'p1' | 'p2'] ?? 0).toLocaleString('ja-JP')}件</span>
      </li>)}</ul>
    </section>

    <section className="prose-section">
      <h2>収集と分類の仕組み</h2>
      <ul className="bullets">
        <li>公式 RSS・API・公開ページだけを取得します。ログイン壁や利用条件は迂回しません。</li>
        <li>キーワード規則で明らかに対象外のものを除き、判断が分かれる候補だけを Workers AI（Llama 3.1 8B）で判定します。</li>
        <li>残った記事を5つの観点、24の問い、P0〜P2に分類します。</li>
      </ul>
      <p className="callout"><Icon name="info" size={16} />要約・自動メモ・分類は機械的に作っているため、誤りを含むことがあります。判断の前に必ず一次情報を確認してください。</p>
    </section>

    <section className="prose-section">
      <h2>参考にした求人票</h2>
      <ul className="ref-list">
        <li><a href="https://openai.com/careers/forward-deployed-engineer-tokyo-tokyo-japan/" target="_blank" rel="noreferrer">OpenAI — Forward Deployed Engineer, Tokyo<Icon name="external" size={13} /></a><p>発見から本番展開までを担当。成功指標は本番採用と業務への測定可能な影響。</p></li>
        <li><a href="https://scale.com/careers/4593571005" target="_blank" rel="noreferrer">Scale AI — Forward Deployed Engineer, GenAI<Icon name="external" size={13} /></a><p>顧客固有のインフラを構築し、企業・政府の課題をエンジニアリングに落とす。</p></li>
      </ul>
    </section>
  </article>;
}
