export type AnalyticsSection = 'about' | 'action' | 'japan' | 'research' | 'saved' | 'admin';
export type AnalyticsEvent = 'page_view' | 'section_view' | 'article_open' | 'source_click';

function visitorId(): string {
  const key = 'fde-radar-visitor';
  try {
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const value = crypto.randomUUID();
    localStorage.setItem(key, value);
    return value;
  } catch { return ''; }
}

function deviceType(): 'desktop' | 'tablet' | 'mobile' {
  if (window.innerWidth < 680) return 'mobile';
  if (window.innerWidth < 1024) return 'tablet';
  return 'desktop';
}

export function track(eventName: AnalyticsEvent, section: AnalyticsSection, articleId?: string): void {
  if (navigator.doNotTrack === '1') return;
  try {
    const body = JSON.stringify({ eventName, section, articleId, visitorId: visitorId(), deviceType: deviceType() });
    fetch('/api/analytics/events', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true
    }).catch(() => undefined);
  } catch { /* analytics must never interrupt reading */ }
}
