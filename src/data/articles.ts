export type Audience = 'business' | 'career';
export type Region = 'JP' | 'APAC' | 'GLOBAL';

export type Article = {
  id: string;
  title: string;
  source: string;
  sourceKind: string;
  region: Region;
  signalType: string;
  location: string;
  sector: string;
  time: string;
  date: string;
  summary: string;
  whyItMatters: string;
  businessImpact: string;
  careerImpact: string;
  url: string;
  score: number;
};

export const signalTypes = ['すべて', '導入事例', '本番化・運用', '評価・品質', '安全・ガバナンス', '採用・役割'];
