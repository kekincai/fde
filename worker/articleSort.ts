export type ArticleSort = 'newest' | 'priority' | 'published';

export function normalizeArticleSort(value?: string): ArticleSort {
  if (value === 'priority' || value === 'published') return value;
  return 'newest';
}

export function articleOrderBy(sort: ArticleSort): string {
  const collectedAt = "COALESCE(NULLIF(a.first_seen_at, ''), NULLIF(a.discovered_at, ''), a.created_at)";
  const publishedAt = `COALESCE(NULLIF(a.published_at, ''), ${collectedAt})`;
  if (sort === 'priority') {
    return `CASE a.priority_level WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 ELSE 2 END,
            a.priority_score DESC, ${publishedAt} DESC, a.id DESC`;
  }
  if (sort === 'published') return `${publishedAt} DESC, ${collectedAt} DESC, a.id DESC`;
  return `${collectedAt} DESC, ${publishedAt} DESC, a.id DESC`;
}
