import type { Article, Priority, Region, SortOrder } from '../../data/articles';

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
  location?: string;
  sector?: string;
  published_at?: string;
  first_seen_at?: string;
  discovered_at?: string;
  summary?: string;
  summary_ja?: string;
  relevance_tags?: string;
  canonical_url?: string;
  fde_score?: number;
};

export type User = { id: string; displayName: string; isAdmin: boolean };
export type Session = { id: string; created_at: string; last_seen_at: string; expires_at: string; user_agent: string; is_current: number };
export type Overview = { counts?: { total?: number; japan?: number; p0?: number; p1?: number; p2?: number }; last_ingested_at?: string | null };
export type CoverageChapter = { id: string; pillar: string; titleJa: string; questionJa: string; publishedCount: number; sourceCount: number; status: 'healthy' | 'thin' | 'empty' };
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

export function relativeTime(value: string): string {
  const diff = Math.max(0, Date.now() - Date.parse(value));
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return `${Math.max(1, Math.floor(diff / 60_000))}分前`;
  if (hours < 24) return `${hours}時間前`;
  return `${Math.floor(hours / 24)}日前`;
}

export function articleTime(article: Article, sort: SortOrder): string {
  if (sort === 'newest') return `収集 ${relativeTime(article.collectedAt || article.publishedAt)}`;
  return `公開 ${relativeTime(article.publishedAt || article.collectedAt)}`;
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
    location: raw.location || (region === 'Japan' ? '日本' : 'グローバル'),
    sector: raw.sector || '業界横断',
    publishedAt,
    collectedAt: raw.first_seen_at || raw.discovered_at || publishedAt,
    summary: raw.summary_ja || raw.summary || '公式情報源から取得した更新です。',
    relevanceTags: parseList(raw.relevance_tags),
    url: raw.canonical_url,
    score: Number(raw.fde_score ?? 0)
  };
}

export function formatDate(value?: string | null) {
  if (!value) return '収集中';
  const normalized = /^\d{4}-\d{2}-\d{2} /.test(value) ? `${value.replace(' ', 'T')}Z` : value;
  return new Intl.DateTimeFormat('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Tokyo'
  }).format(new Date(normalized));
}
