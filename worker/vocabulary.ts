/**
 * Keyword patterns shared by the parsers (index.ts) and the Hard Gate (intelligence.ts).
 * Keep each concept defined once: when the parser and the gate disagreed on what counts as
 * "AI", items mentioning only MCP or 大規模言語モデル were dropped before the gate could accept them.
 * Chapter routing (chapters.ts) keeps its own, narrower patterns per chapter.
 */

/** Anything that makes an item about AI at all. */
export const AI_PATTERN = /\b(ai|artificial intelligence|llm|large language model|generative ai|genai|agentic|gpt|chatgpt|codex|claude|gemini|bedrock|copilot|aip|workers ai|mcp)\b|生成AI|人工知能|大規模言語モデル/i;

/** The FDE role itself (job titles and the practice). */
export const ROLE_PATTERN = /(forward deployed|\bfde\b|\bfdse\b|deployment strategist|deployment engineer|deployment engineering|applied ai (engineer|architect)|technical deployment lead|customer deployment|beneficial deployments|フォワード.?デプロイド|AI導入エンジニア|AIソリューションエンジニア)/i;

/** Who the work is for. */
export const FIELD_PATTERN = /(customer|client|enterprise|government|public sector|現場|顧客|企業)/i;

/** Getting AI into production and into use. */
export const DELIVERY_PATTERN = /(deploy|deployment|production|rollout|adoption|implementation|integrat|workflow|pilot|migration|legacy|本番|導入|実装|運用|連携|移行|定着)/i;

/** Quality, safety and control. */
export const QUALITY_PATTERN = /(eval|evaluation|reliability|observability|guardrail|security|governance|safety|品質|評価|安全|ガバナンス)/i;

/** Customer outcomes and business processes (pillar Customer). */
export const CUSTOMER_PATTERN = /(customer stor|case stud|use case|business process|roi|adoption|transformation|customer|client|導入事例|業務|顧客|活用事例|効果)/i;

/** Building blocks (pillar Build). */
export const BUILD_PATTERN = /(agent|rag|retrieval|tool use|computer use|coding|codex|mcp|connector|integration|legacy|エージェント|検索|連携|コード|コネクタ|ツール利用)/i;

/** Running it (pillar Deploy). */
export const DEPLOY_PATTERN = /(cloud|on.?prem|identity|permission|data residency|database|observability|latency|cost|production|deploy|運用|本番|権限|認証|データ|コスト)/i;

/** Risk and rules (pillar Govern). */
export const GOVERN_PATTERN = /(security|privacy|regulat|policy|governance|evaluation|evals|reliability|prompt injection|安全|規制|指針|ガイドライン|評価|品質|プライバシー)/i;

/** People and organisation (pillar Organization). */
export const ORG_PATTERN = /(forward deployed|\bfde\b|fdse|deployment strategist|ai coe|center of excellence|change management|ai.native|組織|人材|採用|内製化)/i;

/** True when any configured include term appears (case-insensitive). No terms means no restriction. */
export function matchesIncludeTerms(text: string, terms?: string[]): boolean {
  if (!terms?.length) return true;
  const lower = text.toLowerCase();
  return terms.some((term) => lower.includes(term.toLowerCase()));
}
