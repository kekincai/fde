export type Audience = 'business' | 'career';
export type Region = 'Japan' | 'Global';

export type Article = {
  id: string;
  title: string;
  source: string;
  sourceKind: string;
  region: Region;
  pillar: string;
  subtopic: string;
  contentType: string;
  location: string;
  sector: string;
  time: string;
  date: string;
  summary: string;
  whyItMatters: string;
  customerImpact: string;
  engineeringImpact: string;
  url: string;
  score: number;
};

export const pillars = ['すべて', 'Customer', 'Build', 'Deploy', 'Govern', 'Organization', 'Japan'];

export const pillarLabels: Record<string, string> = {
  すべて: 'すべて',
  Customer: '顧客課題',
  Build: '構築',
  Deploy: '本番導入',
  Govern: 'ガバナンス',
  Organization: '組織・FDE',
  Japan: '日本'
};
