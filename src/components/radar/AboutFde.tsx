import { priorityMeta, type Priority } from '../../data/articles';
import { PaperHeader, SectionLink, SiteFooter, usePaper } from './Paper';
import { kanjiNum, kanjiTime, zen } from './typeset';

const fieldLoop = [
  ['顧客理解', '業務、制約、利用者、解くべき問題を現場で確認する。'],
  ['要件定義', '成果指標、対象範囲、評価基準を決める。'],
  ['構築・評価', 'モデルと既存システムをつなぎ、動くものを作って検証する。'],
  ['本番導入', 'データ、認証、権限、監視、費用を整えて運用に乗せる。'],
  ['フィードバック', '効果を測り、学びを製品や再利用できる型に戻す。']
] as const;

const ordinals = ['一', '二', '三', '四', '五'];

const jobPosts = [
  { href: 'https://openai.com/careers/forward-deployed-engineer-tokyo-tokyo-japan/', title: 'OpenAI — Forward Deployed Engineer, Tokyo', note: '発見から本番展開までを担当。成功指標は本番採用と業務への測定可能な影響。' },
  { href: 'https://scale.com/careers/4593571005', title: 'Scale AI — Forward Deployed Engineer, GenAI', note: '顧客固有のインフラを構築し、企業・政府の課題をエンジニアリングに落とす。' }
];

/** ＦＤＥとは — the paper's 社説: what an FDE is and how this paper is made. */
export default function AboutFde() {
  const { overview } = usePaper();
  const counts = overview.counts ?? {};
  const sources = overview.sources?.length ?? 0;

  return <article className="ab" aria-labelledby="ab-title">
    <PaperHeader current="about" folio="（社説）　ＦＤＥとは" />

    <section className="ab-lead">
      <p className="ab-kind tate kuro">社説</p>
      <h1 id="ab-title" className="ab-h1 tate hl">ＡＩを業務に入れる<br />人のための一次情報の索引</h1>
      <div className="ab-body tate-body">
        <p>本紙は、ＡＩ導入に関わる公式発表、導入事例、制度・ガイドライン、セキュリティ、求人を六時間ごとに集め、ＦＤＥの観点で分類して並べている。モデル性能だけの話題や、一般的なＡＩニュースは載せない。</p>
        <p>ＦＤＥ（Forward Deployed Engineer）とは、顧客の現場に入り、課題の特定から実装、本番導入、利用定着までを一人で通して担うエンジニアである。調整役ではなく、自ら技術判断をしてコードを書く。</p>
        <p>【本紙の立場】ＡＩを「試した」で終わらせないために必要なのは、速報よりも一次情報の確かさだ。要約と分類は機械で作るため誤りを含みうる。判断の前には、必ず一次情報に当たってほしい。</p>
      </div>
      <dl className="ab-stats" aria-label="収録状況">
        <div className="tate"><dt>公開中の記事</dt><dd>{kanjiNum(counts.total)}件</dd></div>
        <div className="tate"><dt>うち日本</dt><dd>{kanjiNum(counts.japan)}件</dd></div>
        <div className="tate"><dt>収集元</dt><dd>{sources ? `${kanjiNum(sources)}か所` : '―'}</dd></div>
        <div className="tate"><dt>最終収集</dt><dd>{kanjiTime(overview.last_ingested_at)}</dd></div>
      </dl>
    </section>

    <div className="ab-columns">
      <section className="ab-col" aria-labelledby="ab-loop">
        <h2 id="ab-loop" className="ab-h2">五つの工程</h2>
        <p className="ab-text">ＦＤＥの仕事は、次の五段階の繰り返しである。学びは次の課題へ戻る。</p>
        <ol className="ab-steps">{fieldLoop.map(([title, copy], index) => <li key={title}>
          <b>{ordinals[index]}、{title}</b><span>{copy}</span>
        </li>)}</ol>
        <SectionLink to="questions" className="text-link"><span>二十四の問いで見る（三面）</span></SectionLink>
      </section>

      <section className="ab-col" aria-labelledby="ab-priority">
        <h2 id="ab-priority" className="ab-h2">優先度の読み方</h2>
        <ul className="ab-priority">{(['P0', 'P1', 'P2'] as Priority[]).map((key) => <li key={key} className={`ab-p-${key.toLowerCase()}`}>
          <p className="ab-p-name"><b>{zen(key)}　{priorityMeta[key].label}</b><span>{(counts[key.toLowerCase() as 'p0' | 'p1' | 'p2'] ?? 0).toLocaleString('ja-JP')}件</span></p>
          <p className="ab-text">{priorityMeta[key].description}</p>
        </li>)}</ul>
      </section>

      <section className="ab-col" aria-labelledby="ab-method">
        <h2 id="ab-method" className="ab-h2">収集と分類の仕組み</h2>
        <ul className="ab-bullets dotted">
          <li>公式 RSS・API・公開ページだけを取得する。ログイン壁や利用条件は迂回しない。</li>
          <li>キーワード規則で明らかに対象外のものを除き、判断が分かれる候補だけを Workers AI（Llama 3.1 8B）で判定する。</li>
          <li>残った記事を五つの観点、二十四の問い、Ｐ０〜Ｐ２に分類する。</li>
        </ul>
        <p className="ab-callout kakomi">要約・確認ポイント・分類は機械的に作っているため、誤りを含むことがある。判断の前に必ず一次情報を確認すること。</p>
      </section>

      <section className="ab-col" aria-labelledby="ab-jobs">
        <h2 id="ab-jobs" className="ab-h2">参考にした求人票</h2>
        <ul className="ab-jobs dotted">{jobPosts.map((post) => <li key={post.href}>
          <a href={post.href} target="_blank" rel="noreferrer">{post.title}</a>
          <p className="ab-text">{post.note}</p>
        </li>)}</ul>
      </section>
    </div>
    <SiteFooter />
  </article>;
}
