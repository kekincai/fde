export type SourceKind = 'deployment' | 'careers' | 'community' | 'news';

export type SourceRecord = {
  id: string;
  name: string;
  homepage: string;
  feedUrl?: string;
  apiUrl?: string;
  fetchMode: 'api' | 'rss' | 'html';
  language: 'ja' | 'en';
  country: 'JP' | 'GLOBAL';
  kind: SourceKind;
  priority: number;
  pollIntervalMinutes: number;
  etag?: string;
  lastModified?: string;
  consecutiveFailures?: number;
  backoffUntil?: string;
};

// Public, first-party sources only. General AI news and frontend sources are
// intentionally excluded: every accepted item must also pass the FDE filter.
export const sourceRegistry: SourceRecord[] = [
  {
    id: 'openai-deployments',
    name: 'OpenAI',
    homepage: 'https://openai.com/news/',
    feedUrl: 'https://openai.com/news/rss.xml',
    fetchMode: 'rss',
    language: 'en',
    country: 'GLOBAL',
    kind: 'deployment',
    priority: 100,
    pollIntervalMinutes: 360
  },
  {
    id: 'anthropic-careers',
    name: 'Anthropic Careers',
    homepage: 'https://www.anthropic.com/careers/jobs',
    apiUrl: 'https://boards-api.greenhouse.io/v1/boards/anthropic/jobs?content=true',
    fetchMode: 'api',
    language: 'en',
    country: 'GLOBAL',
    kind: 'careers',
    priority: 96,
    pollIntervalMinutes: 720
  },
  {
    id: 'scale-ai-careers',
    name: 'Scale AI Careers',
    homepage: 'https://scale.com/careers',
    apiUrl: 'https://boards-api.greenhouse.io/v1/boards/scaleai/jobs?content=true',
    fetchMode: 'api',
    language: 'en',
    country: 'GLOBAL',
    kind: 'careers',
    priority: 94,
    pollIntervalMinutes: 720
  },
  {
    id: 'palantir-deployments',
    name: 'Palantir Blog',
    homepage: 'https://blog.palantir.com/',
    feedUrl: 'https://blog.palantir.com/feed',
    fetchMode: 'rss',
    language: 'en',
    country: 'GLOBAL',
    kind: 'deployment',
    priority: 92,
    pollIntervalMinutes: 720
  },
  {
    id: 'ai-native-fde-career',
    name: 'AI Native Careers',
    homepage: 'https://www.ai-native.jp/careers/forward-deployed-engineer',
    fetchMode: 'html',
    language: 'ja',
    country: 'JP',
    kind: 'careers',
    priority: 91,
    pollIntervalMinutes: 1440
  },
  {
    id: 'tokyodev-ai-jobs',
    name: 'TokyoDev',
    homepage: 'https://www.tokyodev.com/jobs',
    fetchMode: 'html',
    language: 'en',
    country: 'JP',
    kind: 'careers',
    priority: 86,
    pollIntervalMinutes: 720
  },
  {
    id: 'qiita-fde-fieldnotes',
    name: 'Qiita',
    homepage: 'https://qiita.com/',
    apiUrl: 'https://qiita.com/api/v2/items?per_page=30&query=FDE%20OR%20%22Forward%20Deployed%20Engineer%22',
    fetchMode: 'api',
    language: 'ja',
    country: 'JP',
    kind: 'community',
    priority: 82,
    pollIntervalMinutes: 360
  },
  {
    id: 'zenn-genai-fieldnotes',
    name: 'Zenn',
    homepage: 'https://zenn.dev/topics/%E7%94%9F%E6%88%90ai',
    feedUrl: 'https://zenn.dev/topics/%E7%94%9F%E6%88%90ai/feed',
    fetchMode: 'rss',
    language: 'ja',
    country: 'JP',
    kind: 'community',
    priority: 80,
    pollIntervalMinutes: 360
  },
  {
    id: 'yahoo-japan-it',
    name: 'Yahoo!ニュース IT',
    homepage: 'https://news.yahoo.co.jp/categories/it',
    feedUrl: 'https://news.yahoo.co.jp/rss/topics/it.xml',
    fetchMode: 'rss',
    language: 'ja',
    country: 'JP',
    kind: 'news',
    priority: 76,
    pollIntervalMinutes: 180
  }
];
