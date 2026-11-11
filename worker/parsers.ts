/**
 * Turns fetched feeds, APIs and pages into DiscoveredItem candidates. Pure functions apart from
 * HTMLRewriter (a Workers global), so the RSS / API / YouTube paths are unit-tested in parsers.test.ts.
 */
import { XMLParser } from 'fast-xml-parser';

import type { ContentType, FdePillar, SourceRecord } from './sourceRegistry';
import { AI_PATTERN, DELIVERY_PATTERN, FIELD_PATTERN, QUALITY_PATTERN, ROLE_PATTERN } from './vocabulary';
import { parseYoutubeChannelPage } from './youtubeFallback';

export type CorePillar = Exclude<FdePillar, 'Japan'>;

export type DiscoveredItem = {
  externalItemId: string;
  url: string;
  title: string;
  summary: string;
  publishedAt: string;
  tags: string[];
  signalType: string;
  location: string;
  sector: string;
  countryRelevance: 'JP' | 'APAC' | 'GLOBAL';
  /** 0–100, set by enrichItem. */
  fdeScore?: number;
  pillar?: CorePillar;
  subtopic?: string;
  contentType?: ContentType;
  summaryJa?: string;
  timeConfidence?: number;
};

export function parseYoutubeHtmlResponse(source: SourceRecord, body: string): DiscoveredItem[] {
  return parseYoutubeChannelPage(body).flatMap((video) => {
    const haystack = video.title;
    if (!AI_PATTERN.test(haystack) && !ROLE_PATTERN.test(haystack)) return [];
    return [{
      externalItemId: video.videoId,
      url: `https://www.youtube.com/watch?v=${video.videoId}`,
      title: video.title,
      summary: `${source.name}が公開したAI導入・運用に関する動画です。`,
      publishedAt: video.publishedAt,
      tags: compactTags(extractKeywords(haystack)),
      signalType: inferSignalType(haystack),
      location: inferLocation(haystack),
      sector: inferSector(haystack),
      countryRelevance: source.country === 'JP' ? 'JP' : inferRegion(haystack),
      timeConfidence: video.timeConfidence
    }];
  });
}

export function parseApiResponse(source: SourceRecord, body: string): DiscoveredItem[] {
  const json = JSON.parse(body) as { jobs?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>;
  const rawItems = Array.isArray(json) ? json : json.jobs ?? [];
  return rawItems.slice(0, 800).flatMap((item) => {
    if (source.id === 'qiita-fde') return parseQiitaItem(item);
    const title = cleanText(String(item.title ?? item.name ?? ''));
    const location = cleanText(String((item.location as Record<string, unknown> | undefined)?.name ?? ''));
    const content = cleanText(String(item.content ?? item.description ?? ''));
    const haystack = `${title} ${content} ${(source.includeTerms ?? []).join(' ')}`;
    if (!ROLE_PATTERN.test(title) || !AI_PATTERN.test(haystack)) return [];
    const url = String(item.absolute_url ?? item.url ?? '');
    if (!url || !title) return [];
    const company = source.name.replace(' Careers', '');
    return [{
      externalItemId: String(item.id ?? url),
      url,
      title,
      summary: `${company}が${location || '複数地域'}で募集する、顧客のAI導入を設計から本番運用まで担うポジションです。`,
      publishedAt: safeIsoDate(item.updated_at ?? item.created_at),
      tags: compactTags(['FDE', 'AI deployment', location, ...extractKeywords(haystack)]),
      signalType: '採用・役割',
      location,
      sector: inferSector(haystack),
      countryRelevance: inferRegion(location)
    }];
  });
}

export function parseQiitaItem(item: Record<string, unknown>): DiscoveredItem[] {
  const title = cleanText(String(item.title ?? ''));
  const body = cleanText(String(item.body ?? item.rendered_body ?? '')).slice(0, 12_000);
  const tags = Array.isArray(item.tags)
    ? item.tags.map((tag) => cleanText(String((tag as Record<string, unknown>)?.name ?? ''))).filter(Boolean)
    : [];
  const haystack = `${title} ${body} ${tags.join(' ')}`;
  const url = String(item.url ?? '');
  // Community posts must name the role or describe getting AI into use, not only mention it.
  if (!url || !title || !passesCommunityGate(title, haystack)) return [];
  if (!ROLE_PATTERN.test(haystack) && !DELIVERY_PATTERN.test(haystack)) return [];
  return [{
    externalItemId: String(item.id ?? url),
    url,
    title,
    summary: body.slice(0, 300),
    publishedAt: safeIsoDate(item.updated_at ?? item.created_at),
    tags: compactTags([...tags, ...extractKeywords(haystack)]),
    signalType: inferSignalType(haystack),
    location: '日本',
    sector: inferSector(haystack),
    countryRelevance: 'JP'
  }];
}

export function parseRssResponse(source: SourceRecord, body: string, maxEntries = 60): DiscoveredItem[] {
  const parsed = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' }).parse(body);
  const entries = parsed.feed?.entry ?? parsed.rss?.channel?.item ?? parsed.channel?.item ?? [];
  const list = Array.isArray(entries) ? entries : [entries];
  return list.slice(0, maxEntries).flatMap((entry) => {
    const link = readFeedLink(entry?.link, source.homepage);
    const title = cleanText(String(entry?.title ?? ''));
    const rawSummary = cleanText(String(
      entry?.summary ?? entry?.description ?? entry?.['content:encoded']
      ?? entry?.['media:group']?.['media:description'] ?? ''
    ));
    const tags = extractFeedTags(entry?.category);
    const haystack = `${title} ${rawSummary} ${tags.join(' ')}`;
    if (!link || !title) return [];
    // includeTerms are applied once, by the Hard Gate, so out-of-scope items are recorded as rejected candidates.
    if (!AI_PATTERN.test(haystack) && !ROLE_PATTERN.test(haystack) && source.kind !== 'report') return [];
    if (source.kind === 'community' && !passesCommunityGate(title, haystack)) return [];
    if (source.id === 'yahoo-japan-it' && !(AI_PATTERN.test(title) && FIELD_PATTERN.test(haystack) && (DELIVERY_PATTERN.test(haystack) || QUALITY_PATTERN.test(haystack)))) return [];
    const signalType = inferSignalType(haystack);
    const location = inferLocation(haystack);
    return [{
      externalItemId: String(entry?.guid?.['#text'] ?? entry?.guid ?? entry?.id ?? link),
      url: link,
      title,
      summary: rawSummary.slice(0, 300) || `${source.name}が公開したAI導入・運用に関する更新です。`,
      publishedAt: safeIsoDate(entry?.published ?? entry?.pubDate ?? entry?.updated),
      tags: compactTags([...tags, ...extractKeywords(haystack)]),
      signalType,
      location,
      sector: inferSector(haystack),
      countryRelevance: source.country === 'JP' ? 'JP' : inferRegion(location || haystack)
    }];
  });
}

export async function parseHtmlResponse(source: SourceRecord, body: string): Promise<DiscoveredItem[]> {
  if (source.parseMode === 'page') return parseSingleCareerPage(source, body);
  const candidates: DiscoveredItem[] = [];
  let active: { url: string; title: string } | undefined;
  const rewriter = new HTMLRewriter().on('main a[href]', {
    element(element) {
      const href = element.getAttribute('href');
      if (!href) return;
      try { active = { url: new URL(href, source.homepage).toString(), title: '' }; } catch { active = undefined; }
      const current = active;
      element.onEndTag(() => {
        if (!current) return;
        const title = cleanText(current.title);
        const isRelevantCareer = source.kind !== 'careers' || ROLE_PATTERN.test(title);
        if (title.length >= 8 && isRelevantCareer && (AI_PATTERN.test(title) || ROLE_PATTERN.test(title))) candidates.push({
          externalItemId: current.url,
          url: current.url,
          title,
          summary: `${source.name}の公式ページで確認された更新です。`,
          publishedAt: dateFromTitle(title) ?? new Date().toISOString(),
          tags: compactTags(extractKeywords(title)),
          signalType: source.kind === 'careers' ? '採用・役割' : inferSignalType(title),
          location: inferLocation(title),
          sector: inferSector(title),
          countryRelevance: source.country === 'JP' ? 'JP' : inferRegion(title)
        });
        if (active === current) active = undefined;
      });
    },
    text(text) { if (active) active.title += text.text; }
  });
  await rewriter.transform(new Response(body, { headers: { 'content-type': 'text/html; charset=utf-8' } })).arrayBuffer();
  return candidates.slice(0, 50);
}

async function parseSingleCareerPage(source: SourceRecord, body: string): Promise<DiscoveredItem[]> {
  let title = '';
  let description = '';
  let publishedAt = '';
  const rewriter = new HTMLRewriter()
    .on('title', { text(text) { title += text.text; } })
    .on('meta[name="description"]', { element(element) { description = element.getAttribute('content') ?? ''; } })
    .on('meta[property="article:published_time"]', { element(element) { publishedAt ||= element.getAttribute('content') ?? ''; } })
    .on('meta[name="date"]', { element(element) { publishedAt ||= element.getAttribute('content') ?? ''; } })
    .on('time[datetime]', { element(element) { publishedAt ||= element.getAttribute('datetime') ?? ''; } });
  await rewriter.transform(new Response(body, { headers: { 'content-type': 'text/html; charset=utf-8' } })).arrayBuffer();
  title = cleanText(title);
  description = cleanText(description);
  const haystack = `${title} ${description}`;
  if (!title || (!AI_PATTERN.test(haystack) && source.kind !== 'government' && source.kind !== 'report' && source.kind !== 'careers')) return [];
  return [{
    externalItemId: source.homepage,
    url: source.homepage,
    title,
    summary: description.slice(0, 300),
    publishedAt: safeIsoDate(publishedAt || dateFromTitle(title) || new Date().toISOString()),
    tags: compactTags([source.kind === 'careers' ? 'FDE' : source.defaultPillar, 'AI', ...extractKeywords(haystack)]),
    signalType: source.kind === 'careers' ? '採用・役割' : inferSignalType(haystack),
    location: source.country === 'JP' ? '日本' : inferLocation(haystack),
    sector: inferSector(haystack),
    countryRelevance: source.country === 'JP' ? 'JP' : inferRegion(haystack)
  }];
}

function passesCommunityGate(title: string, haystack: string): boolean {
  if (ROLE_PATTERN.test(title) || /\bFDE\b/i.test(title)) return true;
  return AI_PATTERN.test(title)
    && FIELD_PATTERN.test(haystack)
    && (DELIVERY_PATTERN.test(haystack) || QUALITY_PATTERN.test(haystack));
}

function inferSignalType(value: string): string {
  if (ROLE_PATTERN.test(value)) return '採用・役割';
  if (QUALITY_PATTERN.test(value) && /(security|governance|safety|guardrail|安全|ガバナンス)/i.test(value)) return '安全・ガバナンス';
  if (QUALITY_PATTERN.test(value)) return '評価・品質';
  if (/(production|rollout|operation|observability|本番|運用)/i.test(value)) return '本番化・運用';
  return '導入事例';
}

function inferRegion(value: string): 'JP' | 'APAC' | 'GLOBAL' {
  if (/(tokyo|japan|japanese|日本|東京|大阪)/i.test(value)) return 'JP';
  if (/(singapore|seoul|korea|sydney|australia|india|apac|asia|シンガポール|韓国|アジア)/i.test(value)) return 'APAC';
  return 'GLOBAL';
}

function inferLocation(value: string): string {
  const matches = value.match(/(Tokyo, Japan|Japan|Singapore|Seoul, South Korea|Sydney, Australia|London, UK|San Francisco, CA|New York(?: City)?, NY|Washington, DC)/i);
  return matches?.[0] ?? '';
}

function inferSector(value: string): string {
  if (/(government|public sector|defen[cs]e)/i.test(value)) return '公共・行政';
  if (/(health|medical|life science)/i.test(value)) return '医療・ライフサイエンス';
  if (/(financial|bank|insurance|fintech)/i.test(value)) return '金融';
  if (/(manufactur|industrial|semiconductor)/i.test(value)) return '製造';
  if (/(retail|commerce)/i.test(value)) return '小売・流通';
  return '業界横断';
}

function extractKeywords(value: string): string[] {
  const candidates = ['FDE', 'Applied AI', 'AI deployment', 'evaluation', 'production', 'security', 'governance', 'agents'];
  return candidates.filter((candidate) => new RegExp(candidate.replace('FDE', 'forward deployed|FDE'), 'i').test(value));
}

export function compactTags(tags: string[]): string[] {
  return [...new Set(tags.map(cleanText).filter(Boolean))].slice(0, 10);
}

export function safeIsoDate(value: unknown): string {
  const timestamp = typeof value === 'number' ? value : typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : new Date().toISOString();
}

function dateFromTitle(value: string): string | undefined {
  const match = value.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+20\d{2}\b/i);
  if (!match) return undefined;
  const timestamp = Date.parse(match[0]);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
}

export function cleanText(value: string): string {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(?:amp;)?lt;/g, '<').replace(/&(?:amp;)?gt;/g, '>')
    .replace(/&(?:amp;)?quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
    .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function readFeedLink(rawLink: unknown, baseUrl: string): string | undefined {
  for (const link of Array.isArray(rawLink) ? rawLink : [rawLink]) {
    const value = typeof link === 'string' ? link : (link as Record<string, unknown> | undefined)?.['@_href'] ?? (link as Record<string, unknown> | undefined)?.href;
    if (!value) continue;
    try { return new URL(String(value), baseUrl).toString(); } catch { /* malformed item */ }
  }
  return undefined;
}

function extractFeedTags(raw: unknown): string[] {
  return (Array.isArray(raw) ? raw : raw ? [raw] : []).slice(0, 8).map((tag) => {
    if (typeof tag === 'string') return cleanText(tag);
    const value = tag as Record<string, unknown>;
    return cleanText(String(value?.['#text'] ?? value?.['@_term'] ?? value?.name ?? ''));
  }).filter(Boolean);
}
