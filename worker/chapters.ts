import type { FdePillar } from './sourceRegistry';

export type ChapterId =
  | 'customer.problem' | 'customer.use-case' | 'customer.process' | 'customer.roi'
  | 'build.agent' | 'build.rag' | 'build.integration' | 'build.legacy'
  | 'deploy.cloud' | 'deploy.on-prem' | 'deploy.data' | 'deploy.identity' | 'deploy.observability' | 'deploy.cost'
  | 'govern.security' | 'govern.evaluation' | 'govern.privacy' | 'govern.regulation' | 'govern.reliability'
  | 'organization.fde' | 'organization.coe' | 'organization.change' | 'organization.talent' | 'organization.ai-native';

export type ChapterDefinition = {
  id: ChapterId;
  pillar: Exclude<FdePillar, 'Japan'>;
  titleJa: string;
  questionJa: string;
  minimumPublished: number;
  minimumSources: number;
};

export const chapterDefinitions: ChapterDefinition[] = [
  { id: 'customer.problem', pillar: 'Customer', titleJa: '顧客課題', questionJa: '顧客は何に困っているのか', minimumPublished: 6, minimumSources: 3 },
  { id: 'customer.use-case', pillar: 'Customer', titleJa: 'ユースケース', questionJa: 'AIをどの仕事に適用したのか', minimumPublished: 8, minimumSources: 4 },
  { id: 'customer.process', pillar: 'Customer', titleJa: '業務プロセス', questionJa: '仕事の流れをどう組み替えたのか', minimumPublished: 6, minimumSources: 3 },
  { id: 'customer.roi', pillar: 'Customer', titleJa: '成果・ROI', questionJa: '時間、品質、費用、売上に何が出たのか', minimumPublished: 6, minimumSources: 3 },
  { id: 'build.agent', pillar: 'Build', titleJa: 'Agent', questionJa: 'Agentをどう設計したのか', minimumPublished: 8, minimumSources: 4 },
  { id: 'build.rag', pillar: 'Build', titleJa: 'RAG・検索', questionJa: '社内知識と根拠をどう接続したのか', minimumPublished: 6, minimumSources: 3 },
  { id: 'build.integration', pillar: 'Build', titleJa: '連携・Connector', questionJa: '既存システムとどうつないだのか', minimumPublished: 6, minimumSources: 4 },
  { id: 'build.legacy', pillar: 'Build', titleJa: 'Legacy刷新', questionJa: '既存資産をどう安全に変えたのか', minimumPublished: 5, minimumSources: 3 },
  { id: 'deploy.cloud', pillar: 'Deploy', titleJa: 'Cloud・本番化', questionJa: '本番環境へどう載せたのか', minimumPublished: 8, minimumSources: 4 },
  { id: 'deploy.on-prem', pillar: 'Deploy', titleJa: 'On-prem・閉域', questionJa: '閉域や規制環境でどう成立させたのか', minimumPublished: 4, minimumSources: 2 },
  { id: 'deploy.data', pillar: 'Deploy', titleJa: 'Data', questionJa: 'データ境界と品質をどう設計したのか', minimumPublished: 6, minimumSources: 3 },
  { id: 'deploy.identity', pillar: 'Deploy', titleJa: 'Identity・権限', questionJa: '誰が何を実行できるようにしたのか', minimumPublished: 6, minimumSources: 3 },
  { id: 'deploy.observability', pillar: 'Deploy', titleJa: 'Observability', questionJa: '挙動、失敗、品質をどう監視するのか', minimumPublished: 6, minimumSources: 3 },
  { id: 'deploy.cost', pillar: 'Deploy', titleJa: 'Cost', questionJa: '利用量と費用をどう制御するのか', minimumPublished: 5, minimumSources: 3 },
  { id: 'govern.security', pillar: 'Govern', titleJa: 'Security', questionJa: '攻撃と情報漏えいをどう防ぐのか', minimumPublished: 8, minimumSources: 4 },
  { id: 'govern.evaluation', pillar: 'Govern', titleJa: 'Evaluation', questionJa: '良し悪しを何で測るのか', minimumPublished: 8, minimumSources: 4 },
  { id: 'govern.privacy', pillar: 'Govern', titleJa: 'Privacy', questionJa: '個人情報と機密情報をどう守るのか', minimumPublished: 5, minimumSources: 3 },
  { id: 'govern.regulation', pillar: 'Govern', titleJa: 'Regulation', questionJa: '制度と調達要件にどう適合するのか', minimumPublished: 6, minimumSources: 3 },
  { id: 'govern.reliability', pillar: 'Govern', titleJa: 'Reliability', questionJa: '失敗を前提にどう信頼性を作るのか', minimumPublished: 6, minimumSources: 3 },
  { id: 'organization.fde', pillar: 'Organization', titleJa: 'FDEの役割', questionJa: '誰が現場と技術をつなぐのか', minimumPublished: 6, minimumSources: 3 },
  { id: 'organization.coe', pillar: 'Organization', titleJa: 'AI CoE', questionJa: '横断組織は何を標準化するのか', minimumPublished: 5, minimumSources: 3 },
  { id: 'organization.change', pillar: 'Organization', titleJa: 'Change Management', questionJa: '利用を現場へどう定着させるのか', minimumPublished: 6, minimumSources: 3 },
  { id: 'organization.talent', pillar: 'Organization', titleJa: '人材・採用', questionJa: 'どんな能力と責任が必要なのか', minimumPublished: 5, minimumSources: 3 },
  { id: 'organization.ai-native', pillar: 'Organization', titleJa: 'AI-native組織', questionJa: '組織と仕事をAI前提でどう再設計するのか', minimumPublished: 6, minimumSources: 3 }
];

export function inferChapter(pillar: Exclude<FdePillar, 'Japan'>, value: string): ChapterId {
  const text = value.normalize('NFKC').toLowerCase();
  // Strong operational concepts take precedence over a broad model-assigned
  // pillar. This keeps identity and observability articles from disappearing
  // into a generic governance bucket.
  if (/privacy|personal data|個人情報|プライバシー/.test(text)) return 'govern.privacy';
  if (/on.?prem|private cloud|closed network|air.?gapped|閉域|オンプレ/.test(text)) return 'deploy.on-prem';
  if (/observab|monitoring|telemetry|可観測|監視/.test(text)) return 'deploy.observability';
  if (/identity|permission|authentication|authorization|\biam\b|認証|権限/.test(text)) return 'deploy.identity';
  if (/legacy|modernization|migration|mainframe|cobol|レガシー|刷新|移行/.test(text)) return 'build.legacy';
  if (/\bcoe\b|center of excellence|推進組織|横断組織/.test(text)) return 'organization.coe';
  if (/connector|integration|\bmcp\b|連携|統合|コネクタ/.test(text)) return 'build.integration';
  if (pillar === 'Customer') {
    if (/\broi\b|return on investment|cost saving|revenue|成果|効果|削減|売上|時間短縮/.test(text)) return 'customer.roi';
    if (/workflow|business process|業務プロセス|ワークフロー|業務フロー/.test(text)) return 'customer.process';
    if (/problem|pain point|challenge|課題|困り|ボトルネック/.test(text)) return 'customer.problem';
    return 'customer.use-case';
  }
  if (pillar === 'Build') {
    if (/\brag\b|retrieval|enterprise search|検索|ナレッジ/.test(text)) return 'build.rag';
    if (/connector|integration|\bmcp\b|連携|統合|コネクタ/.test(text)) return 'build.integration';
    if (/legacy|modernization|migration|レガシー|刷新|移行/.test(text)) return 'build.legacy';
    return 'build.agent';
  }
  if (pillar === 'Deploy') {
    if (/identity|permission|authentication|authorization|\biam\b|認証|権限/.test(text)) return 'deploy.identity';
    if (/observab|monitor|trace|telemetry|監視|可観測/.test(text)) return 'deploy.observability';
    if (/cost|token efficiency|budget|費用|コスト|予算/.test(text)) return 'deploy.cost';
    if (/on.?prem|private cloud|closed network|閉域|オンプレ/.test(text)) return 'deploy.on-prem';
    if (/data platform|database|data boundary|データ|データベース/.test(text)) return 'deploy.data';
    return 'deploy.cloud';
  }
  if (pillar === 'Govern') {
    if (/eval|evaluation|benchmark|評価|テスト/.test(text)) return 'govern.evaluation';
    if (/privacy|personal data|個人情報|プライバシー/.test(text)) return 'govern.privacy';
    if (/regulat|policy|law|procurement|規制|法令|政策|調達|ガイドライン/.test(text)) return 'govern.regulation';
    if (/reliab|resilien|incident|fallback|信頼性|障害|復旧/.test(text)) return 'govern.reliability';
    return 'govern.security';
  }
  if (/\bcoe\b|center of excellence|推進組織|横断組織/.test(text)) return 'organization.coe';
  if (/change management|adoption|literacy|training|定着|研修|リテラシー|変革/.test(text)) return 'organization.change';
  if (/career|hiring|job|talent|採用|求人|人材/.test(text)) return 'organization.talent';
  if (/ai.native|ai-first|ai first|AIネイティブ|aiネイティブ/.test(value)) return 'organization.ai-native';
  return 'organization.fde';
}
