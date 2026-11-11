export type Region = 'Japan' | 'Global';
export type Priority = 'P0' | 'P1' | 'P2';
export type Channel = 'action' | 'research' | 'career' | 'saved';
export type SortOrder = 'newest' | 'priority' | 'published';

export type Article = {
  id: string;
  title: string;
  source: string;
  sourceKind: string;
  region: Region;
  corePillar: string;
  japanLens: string;
  topicLayers: string[];
  affectedStack: string[];
  priority: Priority;
  recommendedAction: string;
  evidence: string;
  contentType: string;
  publishedAt: string;
  collectedAt: string;
  summary: string;
  relevanceTags: string[];
  url: string;
  score: number;
  whyItMatters: string;
  chapterId: string;
  semanticDecision: string;
  semanticConfidence: number;
};

/** Pillars in reading order (Customer first). On a vertical page they are laid out right to left. */
export const pillarOrder = ['Customer', 'Build', 'Deploy', 'Govern', 'Organization'] as const;
export const pillars: string[] = ['すべて', ...pillarOrder];
export const topics = ['すべて', 'Identity', 'Observability', 'Integration', 'Cost', 'Evaluation', 'Human-in-the-loop', 'Change Management'];

export const pillarLabels: Record<string, string> = {
  すべて: 'すべて', Customer: '顧客課題', Build: '構築', Deploy: '本番導入', Govern: '統制・安全', Organization: '組織・定着'
};

export const priorityMeta: Record<Priority, { label: string; description: string }> = {
  P0: { label: 'きょう対応', description: '破壊的変更・脆弱性・期限など、影響範囲をきょう判断する情報' },
  P1: { label: '今週検証', description: '本番導入、認証、監視、連携、費用など、今週試す価値がある情報' },
  P2: { label: '背景学習', description: '論文、調査、採用動向など、中長期の判断材料になる情報' }
};

/** Labels for the server's enum values (worker/sourceRegistry.ts, worker/index.ts inferIntelligence). */
export const japanLensLabels: Record<string, string> = {
  Regulation: '制度', Government: '行政', 'Engineering Community': '現場', 'Case Study': '事例', Enterprise: '企業'
};
export const contentTypeLabels: Record<string, string> = {
  news: 'ニュース', blog: '解説', video: '動画', paper: '論文', report: '調査報告', release: 'リリース', 'case-study': '導入事例', career: '求人'
};
export const sourceKindLabels: Record<string, string> = {
  official: '公式', careers: '採用', platform: 'プラットフォーム', government: '政府機関', media: '報道',
  community: 'コミュニティ', research: '研究機関', report: '調査機関', video: '動画'
};
export const decisionLabels: Record<string, string> = {
  publish: '掲載', review: '要確認', rules: '規則で掲載', pending: '審査待ち', skipped: '審査なし', legacy: '旧方式で掲載'
};
