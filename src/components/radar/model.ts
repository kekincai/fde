import type { Article, Priority, Region } from '../../data/articles';

export type ApiArticle = Partial<Record<keyof Article, unknown>> & {
  id?: string;
  title?: string;
  source_name?: string;
  source_kind?: string;
  region?: string;
  country_relevance?: string;
  core_pillar?: string;
  pillar?: string;
  japan_lens?: string;
  topic_layers?: string;
  affected_stack?: string;
  priority_level?: Priority;
  recommended_action?: string;
  evidence?: string;
  content_type?: string;
  published_at?: string;
  first_seen_at?: string;
  discovered_at?: string;
  summary?: string;
  summary_ja?: string;
  relevance_tags?: string;
  canonical_url?: string;
  fde_score?: number;
  why_it_matters?: string;
  chapter_id?: string;
  semantic_decision?: string;
  semantic_confidence?: number;
};

export type User = { id: string; displayName: string; isAdmin: boolean };
export type Session = { id: string; last_seen_at: string; user_agent: string; is_current: number };
export type Overview = { counts?: { total?: number; japan?: number; p0?: number; p1?: number; p2?: number }; sources?: Array<{ id: string; name?: string }>; last_ingested_at?: string | null };
export type CoverageChapter = { id: string; pillar: string; titleJa: string; questionJa: string; publishedCount: number; sourceCount: number; status: 'healthy' | 'thin' | 'empty'; japanCount?: number };

/** 薄い章: anything short of healthy, including an empty chapter. One rule for 一面 and 三面. */
export const isThinChapter = (chapter: Pick<CoverageChapter, 'status'>) => chapter.status !== 'healthy';
export type Pagination = { page: number; pageSize: number; total: number; totalPages: number };

function parseList(value?: string, fallback = ''): string[] {
  if (value) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.filter((item): item is string => typeof item === 'string' && Boolean(item));
    } catch {
      // Older rows can contain a single plain-text value.
    }
  }
  return fallback ? [fallback] : [];
}

// D1 returns "YYYY-MM-DD HH:MM:SS" in UTC without a zone marker.
export function parseDate(value?: string | null): Date | null {
  if (!value) return null;
  const normalized = /^\d{4}-\d{2}-\d{2} /.test(value) ? `${value.replace(' ', 'T')}Z` : value;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

const jstDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' });

export function dayKey(value?: string | null): string {
  const date = parseDate(value);
  return date ? jstDay.format(date) : '';
}


const stripText = (value: string) => value.replace(/[\s\p{P}\p{S}]/gu, '');

// Generated notes often restate the title or summary; keep only text that adds something.
export function usefulNote(note: string, article: Pick<Article, 'title' | 'summary'>): string {
  const key = stripText(note).slice(0, 20);
  if (key.length < 8) return '';
  return stripText(article.summary).includes(key) || stripText(article.title).includes(key) ? '' : note;
}


// Some feeds hand over Markdown; the paper prints plain text.
function plain(value: string): string {
  return value.replace(/^\s{0,3}#{1,6}\s+/gm, '').replace(/\*\*|__|`/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\s*#{2,}\s*/g, ' ').trim();
}

export function fromApi(raw: ApiArticle): Article | null {
  if (!raw.id || !raw.title || !raw.canonical_url) return null;
  const region: Region = raw.region === 'Japan' || raw.country_relevance === 'JP' ? 'Japan' : 'Global';
  const publishedAt = raw.published_at || '';
  return {
    id: raw.id,
    title: raw.title,
    source: raw.source_name || '公式情報源',
    sourceKind: raw.source_kind || 'official',
    region,
    corePillar: raw.core_pillar || raw.pillar || 'Customer',
    japanLens: raw.japan_lens || '',
    topicLayers: parseList(raw.topic_layers, raw.core_pillar || raw.pillar || 'FDE'),
    affectedStack: parseList(raw.affected_stack),
    priority: raw.priority_level || 'P2',
    recommendedAction: raw.recommended_action || '',
    evidence: raw.evidence || '',
    contentType: raw.content_type || 'news',
    publishedAt,
    collectedAt: raw.first_seen_at || raw.discovered_at || publishedAt,
    summary: plain(raw.summary_ja || raw.summary || '') || '公式情報源から取得した更新です。',
    relevanceTags: parseList(raw.relevance_tags),
    url: raw.canonical_url,
    score: Math.round(Number(raw.fde_score ?? 0)),
    whyItMatters: plain(raw.why_it_matters || ''),
    chapterId: raw.chapter_id || '',
    semanticDecision: raw.semantic_decision || '',
    semanticConfidence: Number(raw.semantic_confidence ?? 0)
  };
}

const jstDateTime = new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' });

export function formatDate(value?: string | null) {
  const date = parseDate(value);
  return date ? jstDateTime.format(date) : '収集中';
}
