import { useCallback, useEffect, useRef, useState } from 'react';

import { pillars, topics, type Channel, type Priority, type Region, type SortOrder } from '../../data/articles';

export type RadarView = 'about' | 'radar' | 'knowledge' | 'admin';

export type RadarState = {
  view: RadarView;
  channel: Channel;
  region: Region | 'ALL';
  pillar: string;
  topic: string;
  chapter: string;
  priority: Priority | 'ALL';
  sort: SortOrder;
  query: string;
  page: number;
};

export const defaultState: RadarState = {
  view: 'radar', channel: 'action', region: 'ALL', pillar: 'すべて', topic: 'すべて', chapter: '', priority: 'ALL', sort: 'newest', query: '', page: 1
};

const viewParams: Record<RadarView, string> = { radar: '', about: 'about', knowledge: 'map', admin: 'admin' };
const listKeys: Array<keyof RadarState> = ['channel', 'region', 'pillar', 'topic', 'chapter', 'priority', 'sort', 'query'];

function readUrl(): RadarState {
  const params = new URLSearchParams(window.location.search);
  const view = (Object.keys(viewParams) as RadarView[]).find((key) => viewParams[key] === (params.get('v') ?? '')) ?? 'radar';
  const channel = params.get('ch');
  const region = params.get('region');
  const priority = params.get('p');
  const sort = params.get('sort');
  const pillar = params.get('pillar') ?? '';
  const topic = params.get('topic') ?? '';
  return {
    view,
    channel: channel === 'research' || channel === 'saved' ? channel : 'action',
    region: region === 'Japan' || region === 'Global' ? region : 'ALL',
    pillar: pillars.includes(pillar) ? pillar : 'すべて',
    topic: topics.includes(topic) ? topic : 'すべて',
    chapter: params.get('chapter') ?? '',
    priority: priority === 'P0' || priority === 'P1' || priority === 'P2' ? priority : 'ALL',
    sort: sort === 'priority' || sort === 'published' ? sort : 'newest',
    query: params.get('q') ?? '',
    page: Math.max(1, Number(params.get('page')) || 1)
  };
}

function writeUrl(state: RadarState): string {
  const params = new URLSearchParams();
  if (viewParams[state.view]) params.set('v', viewParams[state.view]);
  if (state.view === 'radar') {
    if (state.channel !== 'action') params.set('ch', state.channel);
    if (state.region !== 'ALL') params.set('region', state.region);
    if (state.pillar !== 'すべて') params.set('pillar', state.pillar);
    if (state.topic !== 'すべて') params.set('topic', state.topic);
    if (state.chapter) params.set('chapter', state.chapter);
    if (state.priority !== 'ALL') params.set('p', state.priority);
    if (state.sort !== 'newest') params.set('sort', state.sort);
    if (state.query.trim()) params.set('q', state.query.trim());
    if (state.page > 1) params.set('page', String(state.page));
  }
  const search = params.toString();
  return search ? `?${search}` : window.location.pathname;
}

/**
 * View and list filters, mirrored into the URL so a view can be shared and the
 * back button moves between views. Changing any list filter returns to page 1.
 */
export function useRadarState() {
  const [state, setState] = useState<RadarState>(defaultState);
  const [ready, setReady] = useState(false);
  const lastView = useRef<RadarView>(defaultState.view);

  useEffect(() => {
    const restore = () => {
      const next = readUrl();
      lastView.current = next.view;
      setState(next);
    };
    restore();
    setReady(true);
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const next = writeUrl(state);
    const viewChanged = state.view !== lastView.current;
    lastView.current = state.view;
    if (next === (window.location.search || window.location.pathname)) return;
    if (viewChanged) window.history.pushState(null, '', next);
    else window.history.replaceState(null, '', next);
  }, [ready, state]);

  const update = useCallback((patch: Partial<RadarState>) => {
    setState((current) => {
      const resetsPage = !('page' in patch) && listKeys.some((key) => key in patch && patch[key] !== current[key]);
      return { ...current, ...patch, ...(resetsPage ? { page: 1 } : {}) };
    });
  }, []);

  return { state, update, ready };
}
