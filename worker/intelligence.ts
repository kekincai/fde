import type { SourceRecord } from './sourceRegistry';

export type CandidateText = {
  title: string;
  summary: string;
  tags: string[];
  url: string;
};

export type GateDecision = {
  decision: 'publish' | 'review' | 'reject';
  score: number;
  reasons: string[];
};

export type SemanticDecision = {
  decision: 'publish' | 'review' | 'reject';
  confidence: number;
  corePillar: 'Customer' | 'Build' | 'Deploy' | 'Govern' | 'Organization';
  topics: string[];
  signalType: string;
  relevanceScore: number;
  actionabilityScore: number;
  clientFitScore: number;
  whyItMattersJa: string;
  recommendedActionJa: string;
  evidenceJa: string;
  rejectionReason: string;
};

const AI = /\b(ai|artificial intelligence|llm|large language model|generative ai|genai|agentic|gpt|chatgpt|codex|claude|gemini|bedrock|copilot|aip|workers ai|mcp)\b|生成AI|人工知能|大規模言語モデル/i;
const FDE_ROLE = /forward deployed|\bfde\b|fdse|deployment strategist|フォワード.?デプロイド|AI導入エンジニア/i;
const CUSTOMER = /customer|client|enterprise|public sector|case stud|use case|roi|business process|顧客|企業|行政|導入事例|活用事例|業務|効果/i;
const DELIVERY = /deploy|production|rollout|adoption|implementation|integration|workflow|migration|legacy|本番|導入|実装|運用|連携|移行|定着/i;
const CONTROL = /security|governance|privacy|personal data|identity|permission|evaluation|evals|observability|reliability|guardrail|安全|ガバナンス|ガイドライン|指針|規制|プライバシー|個人情報|注意喚起|認証|権限|評価|監視|品質/i;
const BUILD = /agent|rag|retrieval|connector|mcp|tool use|coding agent|codex|エージェント|検索|コネクタ|ツール利用/i;
const GENERIC_NOISE = /giveaway|coupon|wallpaper|horoscope|sports score|celebrity|ゲーム攻略|プレゼント|占い|芸能|株価だけ/i;

export const SEMANTIC_REVIEW_POLICY = 'あなたは FDE Radar の編集判定器です。FDE は顧客チームと並走し、課題発見、技術要件の定義、システム設計、実装、評価、本番導入、利用定着、現場から製品・モデルへのフィードバックまでを端から端まで担う実践です。一般的なAIニュース、モデル性能だけの話、AIと無関係な行政情報は reject。顧客課題、企業導入、統合、本番運用、ID・権限、評価、監視、セキュリティ、組織定着、FDEの役割に具体的な意味があるものだけ publish。曖昧なら review。説明は日本語で短く、記事にない事実を作らないでください。';

function bounded(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : fallback;
}

function score100(value: unknown, fallback: number): number {
  const score = bounded(value, fallback);
  return score > 0 && score <= 1 ? Math.round(score * 100) : score;
}

function shortText(value: unknown, max: number): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function evaluateCandidate(source: SourceRecord, item: CandidateText): GateDecision {
  const text = `${item.title} ${item.summary} ${item.tags.join(' ')}`;
  const reasons: string[] = [];
  if (GENERIC_NOISE.test(text)) return { decision: 'reject', score: 0, reasons: ['generic-noise'] };
  if (source.excludeTerms?.some((term) => text.toLowerCase().includes(term.toLowerCase()))) {
    return { decision: 'reject', score: 0, reasons: ['source-exclusion'] };
  }
  if (source.includeTerms?.length && !source.includeTerms.some((term) => text.toLowerCase().includes(term.toLowerCase()))) {
    return { decision: 'reject', score: 5, reasons: ['outside-source-scope'] };
  }

  const hasRole = FDE_ROLE.test(text);
  const hasAi = AI.test(text) || hasRole;
  const hasCustomer = CUSTOMER.test(text);
  const hasDelivery = DELIVERY.test(text);
  const hasControl = CONTROL.test(text);
  const hasBuild = BUILD.test(text);
  if (!hasAi) return { decision: 'reject', score: 0, reasons: ['not-ai'] };
  if (hasRole) reasons.push('fde-role');
  if (hasCustomer) reasons.push('customer-context');
  if (hasDelivery) reasons.push('delivery-context');
  if (hasControl) reasons.push('control-context');
  if (hasBuild) reasons.push('build-context');

  // FDE intelligence must connect AI to a field, production, control or
  // organizational consequence. A model name or benchmark alone is not enough.
  const operationalSignals = [hasCustomer, hasDelivery, hasControl, hasBuild].filter(Boolean).length;
  if (!hasRole && operationalSignals === 0) return { decision: 'reject', score: 15, reasons: ['ai-without-fde-consequence'] };
  if (source.kind === 'research' && !(hasDelivery || hasControl || (hasBuild && hasCustomer))) {
    return { decision: 'reject', score: 25, reasons: ['research-not-field-adjacent'] };
  }
  if (source.kind === 'careers' && !hasRole) return { decision: 'reject', score: 20, reasons: ['career-not-fde'] };

  const score = Math.min(100, 25 + (hasRole ? 40 : 0) + operationalSignals * 14 + (source.sourceTier === 1 ? 8 : 0));
  const policy = source.semanticPolicy ?? 'required';
  if (policy === 'none' || (hasRole && hasCustomer && hasDelivery)) return { decision: 'publish', score, reasons };
  return { decision: 'review', score, reasons };
}

export async function reviewWithWorkersAI(ai: Ai, source: SourceRecord, item: CandidateText): Promise<SemanticDecision> {
  const schema = {
    type: 'object',
    properties: {
      decision: { type: 'string', enum: ['publish', 'review', 'reject'] },
      confidence: { type: 'number' },
      corePillar: { type: 'string', enum: ['Customer', 'Build', 'Deploy', 'Govern', 'Organization'] },
      topics: { type: 'array', items: { type: 'string' }, maxItems: 5 },
      signalType: { type: 'string' },
      relevanceScore: { type: 'number' },
      actionabilityScore: { type: 'number' },
      clientFitScore: { type: 'number' },
      whyItMattersJa: { type: 'string' },
      recommendedActionJa: { type: 'string' },
      evidenceJa: { type: 'string' },
      rejectionReason: { type: 'string' }
    },
    required: ['decision', 'confidence', 'corePillar', 'topics', 'signalType', 'relevanceScore', 'actionabilityScore', 'clientFitScore', 'whyItMattersJa', 'recommendedActionJa', 'evidenceJa', 'rejectionReason']
  };
  const prompt = `${SEMANTIC_REVIEW_POLICY}\n\n情報源: ${source.name}\n分類ストリーム: ${source.stream ?? 'production-pattern'}\nタイトル: ${item.title}\n概要: ${item.summary.slice(0, 3500)}\nタグ: ${item.tags.join(', ')}\nURL: ${item.url}`;
  const runner = ai as unknown as { run(model: string, input: Record<string, unknown>): Promise<unknown> };
  const output = await runner.run('@cf/meta/llama-3.1-8b-instruct-fast', {
    messages: [{ role: 'system', content: 'Return only data matching the JSON schema.' }, { role: 'user', content: prompt }],
    response_format: { type: 'json_schema', json_schema: schema },
    temperature: 0,
    max_tokens: 600
  }) as { response?: unknown };
  const raw = typeof output.response === 'string' ? JSON.parse(output.response) : output.response;
  if (!raw || typeof raw !== 'object') throw new Error('Workers AI returned no structured decision');
  const value = raw as Record<string, unknown>;
  const decision = ['publish', 'review', 'reject'].includes(String(value.decision)) ? value.decision as SemanticDecision['decision'] : 'review';
  const pillar = ['Customer', 'Build', 'Deploy', 'Govern', 'Organization'].includes(String(value.corePillar))
    ? value.corePillar as SemanticDecision['corePillar'] : 'Deploy';
  return {
    decision,
    confidence: bounded(value.confidence, 50) / (Number(value.confidence) > 1 ? 100 : 1),
    corePillar: pillar,
    topics: Array.isArray(value.topics) ? value.topics.map((topic) => shortText(topic, 40)).filter(Boolean).slice(0, 5) : [],
    signalType: shortText(value.signalType, 50) || 'AI導入・運用',
    relevanceScore: score100(value.relevanceScore, 50),
    actionabilityScore: score100(value.actionabilityScore, 40),
    clientFitScore: score100(value.clientFitScore, 40),
    whyItMattersJa: shortText(value.whyItMattersJa, 320),
    recommendedActionJa: shortText(value.recommendedActionJa, 240),
    evidenceJa: shortText(value.evidenceJa, 240),
    rejectionReason: shortText(value.rejectionReason, 240)
  };
}
