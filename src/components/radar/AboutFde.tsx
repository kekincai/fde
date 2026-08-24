import Icon from './Icon';
import { formatDate, type Overview } from './model';

type Props = {
  overview: Overview;
  onKnowledge: () => void;
  onSignals: () => void;
};

const fieldLoop = [
  ['01', '顧客理解', '顧客の業務、制約、利用者、解くべき問題を現場で明らかにする。'],
  ['02', '技術要件の定義', '成果指標、対象範囲、アーキテクチャ、評価基準を具体化する。'],
  ['03', '構築・評価', '実際にコードを書き、モデルとシステムをつなぎ、成立条件を検証する。'],
  ['04', '本番展開', 'データ、認証、権限、監視、安全性を整え、本番導入と利用定着を進める。'],
  ['05', '現場からのフィードバック', '効果を測り、学びを製品・モデル・再利用可能な実装パターンへ戻す。']
];

const radarProcess = [
  ['収集', '公式情報、日本のニュース・求人・実務共有を定期巡回します。'],
  ['整理', 'FDEの24の問いに対応づけ、一般的なAIニュースを除外します。'],
  ['判断', '顧客・事業への影響、根拠、優先度、次に確認することを提示します。']
];

export default function AboutFde({ overview, onKnowledge, onSignals }: Props) {
  return <main className="about-page" id="top">
    <section className="fde-definition" aria-labelledby="fde-definition-title">
      <div>
        <h1 id="fde-definition-title">FDEとは、顧客の現場で<br />AIを本番の成果に変える<br />フォワード・デプロイド・エンジニアです。</h1>
        <p><b>FDE は Forward Deployed Engineer の略です。</b> 顧客チームと並走し、課題発見、技術要件の定義、システム設計、実装、評価、本番導入、利用定着までを端から端まで担います。</p>
      </div>
      <aside className="about-status" aria-label="FDE Radar の収集状況">
        <span>FDE RADAR</span>
        <b>24<small>の実務の問い</small></b>
        <div><i className="live-dot" />6時間ごとに自動収集</div>
        <small>最終更新 {formatDate(overview.last_ingested_at)}</small>
      </aside>
    </section>

    <section className="about-section role-boundary">
      <header><span>役割</span><h2>技術を作るだけでも、<br />提案するだけでもない。</h2></header>
      <div>
        <p>FDEは、顧客と技術の間に立つだけの調整役ではありません。顧客の成果に責任を持ちながら、自ら技術判断と実装を行い、曖昧な課題を安定した本番システムへ変えます。</p>
        <dl>
          <div><dt>顧客</dt><dd>業務、制約、利用者、成功指標</dd></div>
          <div><dt>技術</dt><dd>モデル、データ、統合、評価</dd></div>
          <div><dt>本番</dt><dd>権限、監視、コスト、安全性</dd></div>
          <div><dt>定着</dt><dd>教育、運用、改善、再利用</dd></div>
        </dl>
      </div>
    </section>

    <section className="about-section field-loop-section">
      <header><span>現場のサイクル</span><h2>FDEの仕事は、<br />5つを一周させること。</h2></header>
      <ol>{fieldLoop.map(([number, title, copy]) => <li key={number}><i>{number}</i><div><b>{title}</b><p>{copy}</p></div></li>)}</ol>
    </section>

    <section className="about-section radar-purpose">
      <header><span>このサイト</span><h2>このサイトは、FDEの判断材料を集めます。</h2><p>普通のAIニュース一覧ではありません。</p></header>
      <div className="radar-process">{radarProcess.map(([title, copy], index) => <div key={title}><i>0{index + 1}</i><b>{title}</b><p>{copy}</p></div>)}</div>
    </section>

    <section className="about-section about-sources">
      <header><span>公式資料</span><h2>公式資料から確認した<br />FDEの共通点。</h2></header>
      <div>
        <a href="https://openai.com/careers/forward-deployed-engineer-tokyo-tokyo-japan/" target="_blank" rel="noreferrer"><div><b>OpenAI — Forward Deployed Engineer, Tokyo</b><p>顧客デリバリーと中核プラットフォーム開発の交点で、発見から本番展開までを所有。生産採用、業務への測定可能な影響、評価フィードバックを成功指標としています。</p></div><Icon name="external" size={16} /></a>
        <a href="https://scale.com/careers/4593571005" target="_blank" rel="noreferrer"><div><b>Scale AI — Forward Deployed Engineer, GenAI</b><p>顧客固有のインフラを構築し、企業や政府の複雑なAI課題に直接向き合い、ビジネスとプロダクトの構想をエンジニアリングへ変換します。</p></div><Icon name="external" size={16} /></a>
      </div>
    </section>

    <section className="about-next" aria-labelledby="next-title">
      <div><span>次に読む</span><h2 id="next-title">理解してから、情報を読む。</h2><p>先に全体像をつかむか、今日の判断材料へ進んでください。</p></div>
      <div className="about-next-actions">
        <button onClick={onKnowledge}><span>01</span><b>ナレッジマップ</b><small>顧客課題から定着まで、24の問いで全体像を見る</small><Icon name="chevron" size={16} /></button>
        <button onClick={onSignals}><span>02</span><b>収集情報</b><small>収集したシグナルから、次に確認・検証することを読む</small><Icon name="chevron" size={16} /></button>
      </div>
    </section>
  </main>;
}
