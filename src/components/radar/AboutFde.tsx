import Icon, { type IconName } from './Icon';
import { formatDate, type Overview } from './model';

type Props = {
  overview: Overview;
  onKnowledge: () => void;
  onSignals: () => void;
};

const fieldLoop = [
  ['01', 'users', '顧客理解', '顧客の業務、制約、利用者、解くべき問題を現場で明らかにする。'],
  ['02', 'checklist', '技術要件の定義', '成果指標、対象範囲、アーキテクチャ、評価基準を具体化する。'],
  ['03', 'code', '構築・評価', '実際にコードを書き、モデルとシステムをつなぎ、成立条件を検証する。'],
  ['04', 'cloudUpload', '本番展開', 'データ、認証、権限、監視、安全性を整え、本番導入と利用定着を進める。'],
  ['05', 'arrowsExchange', '現場からのフィードバック', '効果を測り、学びを製品・モデル・再利用可能な実装パターンへ戻す。']
] as const;

const roleDimensions: Array<{ icon: IconName; title: string; copy: string }> = [
  { icon: 'users', title: '顧客', copy: '業務、制約、利用者、成功指標' },
  { icon: 'code', title: '技術', copy: 'モデル、データ、統合、評価' },
  { icon: 'server', title: '本番', copy: '権限、監視、コスト、安全性' },
  { icon: 'arrowsExchange', title: '定着', copy: '教育、運用、改善、再利用' }
];

const radarProcess = [
  ['inbox', '収集', '公式情報、日本のニュース・求人・実務共有を定期巡回します。'],
  ['layers', '整理', 'FDEの24の問いに対応づけ、一般的なAIニュースを除外します。'],
  ['target', '判断', '顧客・事業への影響、根拠、優先度、次に確認することを提示します。']
] as const;

export default function AboutFde({ overview, onKnowledge, onSignals }: Props) {
  return <main className="about-page" id="top">
    <section className="fde-definition" aria-labelledby="fde-definition-title">
      <div>
        <div className="definition-kicker">FIELD NOTES / AI IMPLEMENTATION</div>
        <h1 id="fde-definition-title">AIと、現場のあいだ。<br /><span>実装を、成果へ。</span></h1>
        <p><b>FDE は Forward Deployed Engineer の略です。</b> 顧客チームと並走し、課題発見、技術要件の定義、システム設計、実装、評価、本番導入、利用定着までを端から端まで担います。</p>
        <div className="intro-actions"><button onClick={onSignals}>収集情報を読む<Icon name="arrowRight" size={18} /></button><button onClick={onKnowledge}>24の問いから探す<Icon name="map" size={18} /></button></div>
        <p className="intro-caption">FDE RADAR は、AIの現場導入を考える人のための情報ガイドです。</p>
      </div>
      <aside className="about-status" aria-label="FDE Radar の収集状況">
        <span>THE FIELD LOOP</span>
        <div className="field-route">{roleDimensions.map((item, index) => <div key={item.title}><span className="route-index">0{index + 1}</span><Icon name={item.icon} size={24} /><div><b>{item.title}</b><small>{item.copy}</small></div><Icon name="arrowRight" size={16} /></div>)}</div>
        <div className="route-return"><Icon name="arrowsExchange" size={17} />現場の学びを、次の実装へ。</div>
        <div className="intro-live"><i className="live-dot" />6時間ごとに自動収集<small>更新 {formatDate(overview.last_ingested_at)}</small></div>
      </aside>
    </section>

    <section className="about-section role-boundary">
      <header className="section-heading"><Icon name="target" size={32} /><div><span>01 / FDEとは</span><h2>顧客の課題から、<br />本番の成果まで。</h2><p>顧客成果と技術実装をつなぐ責任</p></div></header>
      <div>
        <p>FDEは、顧客と技術の間に立つだけの調整役ではありません。顧客の成果に責任を持ちながら、自ら技術判断と実装を行い、曖昧な課題を安定した本番システムへ変えます。</p>
        <dl>{roleDimensions.map((dimension) => <div key={dimension.title}><dt><Icon name={dimension.icon} size={20} />{dimension.title}</dt><dd>{dimension.copy}</dd></div>)}</dl>
      </div>
    </section>

    <section className="about-section field-loop-section">
      <header className="section-heading"><Icon name="cycle" size={32} /><div><span>現場のサイクル</span><h2>FDEの仕事は、<br />5つを一周させること。</h2><p>発見から定着までを反復する</p></div></header>
      <ol>{fieldLoop.map(([number, icon, title, copy]) => <li key={number}><i>{number}</i><span className="loop-symbol"><Icon name={icon} size={18} /></span><b>{title}</b><p>{copy}</p></li>)}</ol>
    </section>

    <section className="about-section radar-purpose">
      <header className="section-heading"><Icon name="radar" size={32} /><div><span>このサイト</span><h2>このサイトは、FDEの判断材料を集めます。</h2><p>情報を判断可能なシグナルへ変える</p></div></header>
      <div className="radar-process">{radarProcess.map(([icon, title, copy]) => <div key={title}><Icon name={icon} size={25} /><b>{title}</b><p>{copy}</p></div>)}</div>
    </section>

    <section className="about-section about-sources">
      <header className="section-heading"><Icon name="document" size={32} /><div><span>公式資料</span><h2>公式資料から確認した<br />FDEの共通点。</h2><p>採用情報に共通する責任範囲</p></div></header>
      <div>
        <a href="https://openai.com/careers/forward-deployed-engineer-tokyo-tokyo-japan/" target="_blank" rel="noreferrer"><span className="source-symbol"><Icon name="userCode" size={19} /></span><div><b>OpenAI — Forward Deployed Engineer, Tokyo</b><p>顧客デリバリーと中核プラットフォーム開発の交点で、発見から本番展開までを所有。生産採用、業務への測定可能な影響、評価フィードバックを成功指標としています。</p></div><Icon name="external" size={16} /></a>
        <a href="https://scale.com/careers/4593571005" target="_blank" rel="noreferrer"><span className="source-symbol"><Icon name="building" size={19} /></span><div><b>Scale AI — Forward Deployed Engineer, GenAI</b><p>顧客固有のインフラを構築し、企業や政府の複雑なAI課題に直接向き合い、ビジネスとプロダクトの構想をエンジニアリングへ変換します。</p></div><Icon name="external" size={16} /></a>
      </div>
    </section>

    <section className="about-next" aria-labelledby="next-title">
      <div className="section-heading"><Icon name="compass" size={32} /><div><span>次に読む</span><h2 id="next-title">理解してから、情報を読む。</h2><p>全体像か、今日のシグナルか</p></div></div>
      <div className="about-next-actions">
        <button onClick={onKnowledge}><Icon name="map" size={18} /><b>ナレッジマップ</b><small>顧客課題から定着まで、24の問いで全体像を見る</small><Icon name="chevron" size={16} /></button>
        <button onClick={onSignals}><Icon name="radar" size={18} /><b>収集情報</b><small>収集したシグナルから、次に確認・検証することを読む</small><Icon name="chevron" size={16} /></button>
      </div>
    </section>
  </main>;
}
