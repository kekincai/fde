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

function sessionId(): string {
  const key = 'fde-radar-session';
  try {
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;
    const value = crypto.randomUUID();
    sessionStorage.setItem(key, value);
    return value;
  } catch { return ''; }
}

function referrerHost(): string {
  try {
    if (!document.referrer) return 'direct';
    const host = new URL(document.referrer).hostname.toLowerCase();
    return host === window.location.hostname.toLowerCase() ? 'self' : host;
  } catch { return ''; }
}

export function track(eventName: AnalyticsEvent, section: AnalyticsSection, articleId?: string): void {
  if (navigator.doNotTrack === '1') return;
  try {
    const body = JSON.stringify({
      eventName,
      section,
      articleId,
      visitorId: visitorId(),
      sessionId: sessionId(),
      deviceType: deviceType(),
      referrerHost: eventName === 'page_view' ? referrerHost() : undefined
    });
    fetch('/api/analytics/events', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true
    }).catch(() => undefined);
  } catch { /* analytics must never interrupt reading */ }
}
