import { useEffect, useState } from 'react';

import type { Article } from '../../data/articles';
import { fromApi, type ApiArticle, type Pagination } from './model';
import type { RadarState } from './useRadarState';

export const PAGE_SIZE = 20;
const emptyPagination: Pagination = { page: 1, pageSize: PAGE_SIZE, total: 0, totalPages: 1 };

type Options = { enabled: boolean; userKey: string; onUnauthorized: () => void };

export function useArticles(state: RadarState, { enabled, userKey, onUnauthorized }: Options) {
  const [articles, setArticles] = useState<Article[]>([]);
  const [pagination, setPagination] = useState<Pagination>(emptyPagination);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { channel, region, pillar, topic, chapter, priority, sort, query, page } = state;

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError('');
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), sort });
      if (channel !== 'saved') params.set('channel', channel);
      if (region !== 'ALL') params.set('region', region);
      if (pillar !== 'すべて') params.set('pillar', pillar);
      if (topic !== 'すべて') params.set('layer', topic);
      if (chapter) params.set('chapter', chapter);
      if (priority !== 'ALL') params.set('priority', priority);
      if (query.trim()) params.set('q', query.trim());
      const endpoint = channel === 'saved' ? `/api/bookmarks?${params}` : `/api/articles?${params}`;
      fetch(endpoint, { signal: controller.signal }).then(async (response) => {
        if (response.status === 401) {
          onUnauthorized();
          return { articles: [], pagination: emptyPagination };
        }
        if (!response.ok) throw new Error('情報を取得できませんでした。');
        return response.json() as Promise<{ articles?: ApiArticle[]; pagination?: Pagination }>;
      }).then((data) => {
        const next = (data.articles ?? []).map(fromApi).filter((item): item is Article => Boolean(item));
        setArticles(next);
        setPagination(data.pagination ?? { ...emptyPagination, total: next.length });
      }).catch((reason) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return;
        setError(reason instanceof Error ? reason.message : '読み込みに失敗しました。');
      }).finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    }, query ? 280 : 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
    // onUnauthorized is intentionally excluded: it is recreated on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, userKey, channel, region, pillar, topic, chapter, priority, sort, query, page]);

  return { articles, setArticles, pagination, loading, error };
}
