export type Region = 'Japan' | 'Global';
export type Priority = 'P0' | 'P1' | 'P2';
export type Channel = 'action' | 'research' | 'career' | 'saved';

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
  location: string;
  sector: string;
  publishedAt: string;
  time: string;
  summary: string;
  relevanceTags: string[];
  url: string;
  score: number;
};

export const pillars = ['すべて', 'Customer', 'Build', 'Deploy', 'Govern', 'Organization'];
export const topics = ['すべて', 'Identity', 'Observability', 'Integration', 'Cost', 'Evaluation', 'Human-in-the-loop', 'Change Management'];

export const pillarLabels: Record<string, string> = {
  すべて: 'すべて', Customer: '顧客課題', Build: '構築', Deploy: '本番導入', Govern: '統制・安全', Organization: '組織・定着'
};

export const priorityMeta: Record<Priority, { label: string; short: string; description: string }> = {
  P0: { label: '今日対応', short: '今すぐ確認', description: '破壊的変更・脆弱性・期限など、影響範囲を今日判断する情報' },
  P1: { label: '今週検証', short: '検証候補', description: '本番導入、認証、監視、連携、費用など、今週試す価値がある情報' },
  P2: { label: '背景学習', short: '知識を蓄積', description: '論文、調査、採用動向など、中長期の判断材料になる情報' }
};
