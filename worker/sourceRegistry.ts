export type SourceRecord = {
  id: string;
  name: string;
  homepage: string;
  feedUrl?: string;
  apiUrl?: string;
  fetchMode: 'api' | 'rss' | 'html';
  language: 'ja' | 'en';
  country: 'JP' | 'GLOBAL';
  priority: number;
  pollIntervalMinutes: number;
  etag?: string;
  lastModified?: string;
  consecutiveFailures?: number;
  backoffUntil?: string;
};

export const sourceRegistry: SourceRecord[] = [
  {
    id: 'publickey',
    name: 'Publickey',
    homepage: 'https://www.publickey1.jp/',
    feedUrl: 'https://www.publickey1.jp/atom.xml',
    fetchMode: 'rss',
    language: 'ja',
    country: 'JP',
    priority: 90,
    pollIntervalMinutes: 360
  },
  {
    id: 'qiita',
    name: 'Qiita',
    homepage: 'https://qiita.com/',
    apiUrl: 'https://qiita.com/api/v2/items',
    fetchMode: 'api',
    language: 'ja',
    country: 'JP',
    priority: 88,
    pollIntervalMinutes: 360
  },
  {
    id: 'mercari-engineering',
    name: 'Mercari Engineering',
    homepage: 'https://engineering.mercari.com/',
    feedUrl: 'https://engineering.mercari.com/feed/',
    fetchMode: 'rss',
    language: 'ja',
    country: 'JP',
    priority: 86,
    pollIntervalMinutes: 720
  },
  {
    id: 'line-engineering',
    name: 'LINEヤフー Tech Blog',
    homepage: 'https://techblog.lycorp.co.jp/ja',
    feedUrl: 'https://techblog.lycorp.co.jp/ja/feed',
    fetchMode: 'rss',
    language: 'ja',
    country: 'JP',
    priority: 84,
    pollIntervalMinutes: 720
  },
  {
    id: 'chrome-dev',
    name: 'Chrome for Developers',
    homepage: 'https://developer.chrome.com/blog/',
    feedUrl: 'https://developer.chrome.com/static/blog/feed.xml',
    fetchMode: 'rss',
    language: 'en',
    country: 'GLOBAL',
    priority: 80,
    pollIntervalMinutes: 720
  }
];
