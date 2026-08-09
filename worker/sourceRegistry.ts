export type SourceKind = 'official' | 'careers' | 'platform' | 'government' | 'media' | 'community' | 'research' | 'report' | 'video';
export type ContentType = 'news' | 'blog' | 'video' | 'paper' | 'report' | 'release' | 'case-study' | 'career';
export type FdePillar = 'Customer' | 'Build' | 'Deploy' | 'Govern' | 'Organization' | 'Japan';
export type CollectionStream = 'official-change' | 'customer-outcome' | 'production-pattern' | 'japan-government' | 'japan-enterprise' | 'field-note' | 'research' | 'report' | 'talent' | 'video';

export type SourceRecord = {
  id: string;
  name: string;
  homepage: string;
  feedUrl?: string;
  apiUrl?: string;
  fetchMode: 'api' | 'rss' | 'html';
  parseMode?: 'listing' | 'page';
  language: 'ja' | 'en';
  country: 'JP' | 'GLOBAL';
  kind: SourceKind;
  contentType: ContentType;
  defaultPillar: FdePillar;
  sourceTier: 1 | 2 | 3;
  weight: number;
  minScore: number;
  priority: number;
  pollIntervalMinutes: number;
  etag?: string;
  lastModified?: string;
  consecutiveFailures?: number;
  backoffUntil?: string;
  enabled?: boolean;
  backfillPages?: number;
  backfillMode?: 'feed-window' | 'api-page' | 'feed-page';
  stream?: CollectionStream;
  semanticPolicy?: 'required' | 'fallback' | 'none';
  dailyItemCap?: number;
  includeTerms?: string[];
  excludeTerms?: string[];
};

export function collectionStreamFor(source: SourceRecord): CollectionStream {
  if (source.stream) return source.stream;
  if (source.kind === 'research') return 'research';
  if (source.kind === 'report') return 'report';
  if (source.kind === 'careers') return 'talent';
  if (source.kind === 'video') return 'video';
  if (source.country === 'JP' && source.kind === 'government') return 'japan-government';
  if (source.country === 'JP' && source.kind === 'community') return 'field-note';
  if (source.country === 'JP') return 'japan-enterprise';
  if (source.contentType === 'case-study') return 'customer-outcome';
  if (source.contentType === 'release') return 'official-change';
  return 'production-pattern';
}

const youtubeFeed = (channelId: string) => `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;

// Registry policy: first-party and public feeds first. Source authority controls
// review priority, but never substitutes for article-level FDE relevance.
export const sourceRegistry: SourceRecord[] = [
  { id: 'openai-news', name: 'OpenAI News', homepage: 'https://openai.com/news/', feedUrl: 'https://openai.com/news/rss.xml', fetchMode: 'rss', language: 'en', country: 'GLOBAL', kind: 'official', contentType: 'news', defaultPillar: 'Customer', sourceTier: 1, weight: 100, minScore: 55, priority: 100, pollIntervalMinutes: 180, backfillPages: 12, backfillMode: 'feed-window', stream: 'official-change', semanticPolicy: 'required', dailyItemCap: 12 },
  { id: 'openai-customer-stories', name: 'OpenAI Customer Stories', homepage: 'https://openai.com/ja-JP/business/customer-stories/', fetchMode: 'html', parseMode: 'listing', language: 'ja', country: 'JP', kind: 'official', contentType: 'case-study', defaultPillar: 'Customer', sourceTier: 1, weight: 100, minScore: 48, priority: 100, pollIntervalMinutes: 720, stream: 'customer-outcome', semanticPolicy: 'required', dailyItemCap: 12 },
  // OpenAI currently returns HTTP 403 to Workers for this page. Keep the
  // official URL in the directory without repeatedly retrying a blocked page.
  { id: 'openai-fde-tokyo', name: 'OpenAI FDE Tokyo', homepage: 'https://openai.com/careers/forward-deployed-engineer-tokyo-tokyo-japan/', fetchMode: 'html', parseMode: 'page', language: 'en', country: 'JP', kind: 'careers', contentType: 'career', defaultPillar: 'Organization', sourceTier: 1, weight: 100, minScore: 40, priority: 100, pollIntervalMinutes: 720, enabled: false },
  { id: 'openai-platform-changelog', name: 'OpenAI Platform Changelog', homepage: 'https://developers.openai.com/api/docs/changelog', fetchMode: 'html', parseMode: 'listing', language: 'en', country: 'GLOBAL', kind: 'platform', contentType: 'release', defaultPillar: 'Build', sourceTier: 1, weight: 98, minScore: 50, priority: 98, pollIntervalMinutes: 360, stream: 'official-change', semanticPolicy: 'required', dailyItemCap: 15 },
  { id: 'palantir-blog', name: 'Palantir Blog', homepage: 'https://blog.palantir.com/', feedUrl: 'https://blog.palantir.com/feed', fetchMode: 'rss', language: 'en', country: 'GLOBAL', kind: 'official', contentType: 'blog', defaultPillar: 'Organization', sourceTier: 1, weight: 100, minScore: 50, priority: 98, pollIntervalMinutes: 360, backfillPages: 1, backfillMode: 'feed-window', stream: 'production-pattern', semanticPolicy: 'required', dailyItemCap: 10 },
  { id: 'anthropic-careers', name: 'Anthropic Careers', homepage: 'https://www.anthropic.com/careers/jobs', apiUrl: 'https://boards-api.greenhouse.io/v1/boards/anthropic/jobs?content=true', fetchMode: 'api', language: 'en', country: 'GLOBAL', kind: 'careers', contentType: 'career', defaultPillar: 'Organization', sourceTier: 1, weight: 96, minScore: 50, priority: 96, pollIntervalMinutes: 720 },
  { id: 'anthropic-news', name: 'Anthropic News', homepage: 'https://www.anthropic.com/news', fetchMode: 'html', parseMode: 'listing', language: 'en', country: 'GLOBAL', kind: 'official', contentType: 'news', defaultPillar: 'Build', sourceTier: 1, weight: 95, minScore: 60, priority: 94, pollIntervalMinutes: 360, backfillPages: 1 },
  { id: 'scale-ai-careers', name: 'Scale AI Careers', homepage: 'https://scale.com/careers', apiUrl: 'https://boards-api.greenhouse.io/v1/boards/scaleai/jobs?content=true', fetchMode: 'api', language: 'en', country: 'GLOBAL', kind: 'careers', contentType: 'career', defaultPillar: 'Organization', sourceTier: 1, weight: 94, minScore: 50, priority: 93, pollIntervalMinutes: 720 },

  { id: 'google-cloud', name: 'Google Cloud Blog', homepage: 'https://cloud.google.com/blog/products/ai-machine-learning', feedUrl: 'https://cloudblog.withgoogle.com/rss/', fetchMode: 'rss', language: 'en', country: 'GLOBAL', kind: 'platform', contentType: 'blog', defaultPillar: 'Build', sourceTier: 1, weight: 92, minScore: 62, priority: 91, pollIntervalMinutes: 360, backfillPages: 1, backfillMode: 'feed-window' },
  { id: 'vertex-ai-release-notes', name: 'Vertex AI Release Notes', homepage: 'https://docs.cloud.google.com/vertex-ai/generative-ai/docs/release-notes', fetchMode: 'html', parseMode: 'listing', language: 'en', country: 'GLOBAL', kind: 'platform', contentType: 'release', defaultPillar: 'Deploy', sourceTier: 1, weight: 96, minScore: 48, priority: 96, pollIntervalMinutes: 720, stream: 'official-change', semanticPolicy: 'required', dailyItemCap: 12 },
  { id: 'azure-blog', name: 'Microsoft Azure Blog', homepage: 'https://azure.microsoft.com/en-us/blog/', feedUrl: 'https://azure.microsoft.com/en-us/blog/feed/', fetchMode: 'rss', language: 'en', country: 'GLOBAL', kind: 'platform', contentType: 'blog', defaultPillar: 'Deploy', sourceTier: 1, weight: 91, minScore: 62, priority: 90, pollIntervalMinutes: 360, backfillPages: 1, backfillMode: 'feed-window' },
  { id: 'github-ai', name: 'GitHub AI & ML', homepage: 'https://github.blog/ai-and-ml/', feedUrl: 'https://github.blog/ai-and-ml/feed/', fetchMode: 'rss', language: 'en', country: 'GLOBAL', kind: 'platform', contentType: 'blog', defaultPillar: 'Build', sourceTier: 1, weight: 90, minScore: 62, priority: 89, pollIntervalMinutes: 360, backfillPages: 1, backfillMode: 'feed-window' },
  { id: 'aws-ml', name: 'AWS Machine Learning Blog', homepage: 'https://aws.amazon.com/blogs/machine-learning/', feedUrl: 'https://aws.amazon.com/blogs/machine-learning/feed/', fetchMode: 'rss', language: 'en', country: 'GLOBAL', kind: 'platform', contentType: 'blog', defaultPillar: 'Deploy', sourceTier: 1, weight: 91, minScore: 62, priority: 89, pollIntervalMinutes: 360, backfillPages: 1, backfillMode: 'feed-window' },
  { id: 'aws-architecture', name: 'AWS Architecture Blog', homepage: 'https://aws.amazon.com/blogs/architecture/', feedUrl: 'https://aws.amazon.com/blogs/architecture/feed/', fetchMode: 'rss', language: 'en', country: 'GLOBAL', kind: 'platform', contentType: 'blog', defaultPillar: 'Deploy', sourceTier: 1, weight: 89, minScore: 66, priority: 87, pollIntervalMinutes: 720, backfillPages: 1, backfillMode: 'feed-window' },
  { id: 'aws-agentcore-release-notes', name: 'Amazon Bedrock AgentCore Release Notes', homepage: 'https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/release-notes.html', fetchMode: 'html', parseMode: 'listing', language: 'en', country: 'GLOBAL', kind: 'platform', contentType: 'release', defaultPillar: 'Deploy', sourceTier: 1, weight: 96, minScore: 48, priority: 95, pollIntervalMinutes: 720, stream: 'official-change', semanticPolicy: 'required', dailyItemCap: 10, includeTerms: ['AgentCore', 'agent', 'runtime', 'identity', 'gateway', 'observability', 'evaluation'] },
  { id: 'cloudflare-blog', name: 'Cloudflare Blog', homepage: 'https://blog.cloudflare.com/', feedUrl: 'https://blog.cloudflare.com/rss/', fetchMode: 'rss', language: 'en', country: 'GLOBAL', kind: 'platform', contentType: 'blog', defaultPillar: 'Deploy', sourceTier: 1, weight: 90, minScore: 62, priority: 88, pollIntervalMinutes: 360, backfillPages: 1, backfillMode: 'feed-window' },

  { id: 'digital-agency-jp', name: 'デジタル庁 AI・Gennai', homepage: 'https://www.digital.go.jp/policies/genai', feedUrl: 'https://www.digital.go.jp/rss/news.xml', fetchMode: 'rss', language: 'ja', country: 'JP', kind: 'government', contentType: 'news', defaultPillar: 'Japan', sourceTier: 1, weight: 98, minScore: 42, priority: 98, pollIntervalMinutes: 360, backfillPages: 1, backfillMode: 'feed-window', stream: 'japan-government', semanticPolicy: 'required', dailyItemCap: 8, includeTerms: ['AI', '生成AI', '人工知能', 'Gennai', 'ガバメントAI'] },
  { id: 'digital-agency-gennai', name: 'デジタル庁 Gennai', homepage: 'https://www.digital.go.jp/policies/genai', fetchMode: 'html', parseMode: 'listing', language: 'ja', country: 'JP', kind: 'government', contentType: 'case-study', defaultPillar: 'Japan', sourceTier: 1, weight: 100, minScore: 35, priority: 100, pollIntervalMinutes: 720, stream: 'japan-government', semanticPolicy: 'required', dailyItemCap: 8, includeTerms: ['AI', '生成AI', 'Gennai', 'ガバメントAI'] },
  { id: 'ipa-ai-security', name: 'IPA AIセキュリティ', homepage: 'https://www.ipa.go.jp/digital/ai/security/index.html', fetchMode: 'html', parseMode: 'page', language: 'ja', country: 'JP', kind: 'government', contentType: 'report', defaultPillar: 'Japan', sourceTier: 1, weight: 97, minScore: 40, priority: 97, pollIntervalMinutes: 720, stream: 'japan-government', semanticPolicy: 'none', dailyItemCap: 3 },
  { id: 'meti-ai', name: '経済産業省 AI政策', homepage: 'https://www.meti.go.jp/policy/it_policy/jinzai/aiutilization.html', fetchMode: 'html', parseMode: 'listing', language: 'ja', country: 'JP', kind: 'government', contentType: 'report', defaultPillar: 'Govern', sourceTier: 1, weight: 96, minScore: 45, priority: 96, pollIntervalMinutes: 1440, stream: 'japan-government', semanticPolicy: 'required', dailyItemCap: 5, includeTerms: ['AI', '生成AI', '人工知能', 'AI事業者ガイドライン'] },
  { id: 'publickey-ai', name: 'Publickey', homepage: 'https://www.publickey1.jp/', feedUrl: 'https://www.publickey1.jp/atom.xml', fetchMode: 'rss', language: 'ja', country: 'JP', kind: 'media', contentType: 'news', defaultPillar: 'Japan', sourceTier: 2, weight: 88, minScore: 48, priority: 88, pollIntervalMinutes: 360, backfillPages: 1, backfillMode: 'feed-window' },
  { id: 'itmedia-ai', name: 'ITmedia AI+', homepage: 'https://www.itmedia.co.jp/aiplus/', feedUrl: 'https://rss.itmedia.co.jp/rss/2.0/aiplus.xml', fetchMode: 'rss', language: 'ja', country: 'JP', kind: 'media', contentType: 'news', defaultPillar: 'Japan', sourceTier: 2, weight: 86, minScore: 48, priority: 86, pollIntervalMinutes: 180, backfillPages: 1, backfillMode: 'feed-window' },
  { id: 'codezine-ai', name: 'CodeZine', homepage: 'https://codezine.jp/', feedUrl: 'https://codezine.jp/rss/new/20/index.xml', fetchMode: 'rss', language: 'ja', country: 'JP', kind: 'media', contentType: 'blog', defaultPillar: 'Japan', sourceTier: 2, weight: 84, minScore: 48, priority: 84, pollIntervalMinutes: 360, backfillPages: 1, backfillMode: 'feed-window' },
  { id: 'enterprisezine-ai', name: 'EnterpriseZine', homepage: 'https://enterprisezine.jp/', feedUrl: 'https://enterprisezine.jp/rss/new/20/index.xml', fetchMode: 'rss', language: 'ja', country: 'JP', kind: 'media', contentType: 'news', defaultPillar: 'Japan', sourceTier: 2, weight: 86, minScore: 45, priority: 85, pollIntervalMinutes: 360, backfillPages: 1, backfillMode: 'feed-window' },
  { id: 'developersio-ai', name: 'DevelopersIO', homepage: 'https://dev.classmethod.jp/', feedUrl: 'https://dev.classmethod.jp/feed/', fetchMode: 'rss', language: 'ja', country: 'JP', kind: 'community', contentType: 'blog', defaultPillar: 'Japan', sourceTier: 2, weight: 84, minScore: 50, priority: 84, pollIntervalMinutes: 360, backfillPages: 1, backfillMode: 'feed-window' },
  { id: 'ly-engineering-ai', name: 'LY Corporation Tech Blog', homepage: 'https://techblog.lycorp.co.jp/ja', feedUrl: 'https://techblog.lycorp.co.jp/ja/feed/index.xml', fetchMode: 'rss', language: 'ja', country: 'JP', kind: 'community', contentType: 'blog', defaultPillar: 'Japan', sourceTier: 1, weight: 88, minScore: 48, priority: 86, pollIntervalMinutes: 720, backfillPages: 1, backfillMode: 'feed-window' },
  { id: 'cyberagent-ai', name: 'CyberAgent Developers Blog', homepage: 'https://developers.cyberagent.co.jp/blog/', feedUrl: 'https://developers.cyberagent.co.jp/blog/feed/', fetchMode: 'rss', language: 'ja', country: 'JP', kind: 'community', contentType: 'blog', defaultPillar: 'Japan', sourceTier: 1, weight: 87, minScore: 48, priority: 85, pollIntervalMinutes: 720, backfillPages: 8, backfillMode: 'feed-page' },
  { id: 'dena-ai', name: 'DeNA Engineering AI', homepage: 'https://engineering.dena.com/blog/tags/ai/', fetchMode: 'html', parseMode: 'listing', language: 'ja', country: 'JP', kind: 'community', contentType: 'blog', defaultPillar: 'Japan', sourceTier: 1, weight: 90, minScore: 48, priority: 90, pollIntervalMinutes: 720, stream: 'japan-enterprise', semanticPolicy: 'required', dailyItemCap: 8, includeTerms: ['AI', '生成AI', 'LLM', 'エージェント', 'Devin', 'Claude', 'Codex'] },
  { id: 'recruit-ai-agent', name: 'Recruit Data Blog AIエージェント', homepage: 'https://blog.recruit.co.jp/data/tags/ai%E3%82%A8%E3%83%BC%E3%82%B8%E3%82%A7%E3%83%B3%E3%83%88/', fetchMode: 'html', parseMode: 'listing', language: 'ja', country: 'JP', kind: 'community', contentType: 'blog', defaultPillar: 'Japan', sourceTier: 1, weight: 90, minScore: 48, priority: 89, pollIntervalMinutes: 720, stream: 'japan-enterprise', semanticPolicy: 'required', dailyItemCap: 8 },
  { id: 'nttdata-ai-insight', name: 'NTT DATA AI・業務変革', homepage: 'https://www.nttdata.com/jp/ja/trends/', fetchMode: 'html', parseMode: 'listing', language: 'ja', country: 'JP', kind: 'official', contentType: 'case-study', defaultPillar: 'Customer', sourceTier: 1, weight: 94, minScore: 48, priority: 94, pollIntervalMinutes: 720, stream: 'japan-enterprise', semanticPolicy: 'required', dailyItemCap: 10, includeTerms: ['AI', '生成AI', '人工知能', 'AIエージェント', 'AI CoE'] },
  { id: 'ai-native-fde-career', name: 'AI Native Careers', homepage: 'https://www.ai-native.jp/careers/forward-deployed-engineer', fetchMode: 'html', parseMode: 'page', language: 'ja', country: 'JP', kind: 'careers', contentType: 'career', defaultPillar: 'Japan', sourceTier: 1, weight: 94, minScore: 38, priority: 94, pollIntervalMinutes: 720 },
  { id: 'tokyodev-ai-jobs', name: 'TokyoDev', homepage: 'https://www.tokyodev.com/jobs', fetchMode: 'html', parseMode: 'listing', language: 'en', country: 'JP', kind: 'careers', contentType: 'career', defaultPillar: 'Japan', sourceTier: 2, weight: 82, minScore: 50, priority: 80, pollIntervalMinutes: 720 },
  { id: 'qiita-fde', name: 'Qiita FDE実践', homepage: 'https://qiita.com/', apiUrl: 'https://qiita.com/api/v2/items?per_page=30&query=%28%22%E7%94%9F%E6%88%90AI%22%20OR%20LLM%29%20%28%E6%9C%AC%E7%95%AA%20OR%20%E5%B0%8E%E5%85%A5%20OR%20%E9%81%8B%E7%94%A8%20OR%20%E8%A9%95%E4%BE%A1%20OR%20%E3%82%BB%E3%82%AD%E3%83%A5%E3%83%AA%E3%83%86%E3%82%A3%29', fetchMode: 'api', language: 'ja', country: 'JP', kind: 'community', contentType: 'blog', defaultPillar: 'Japan', sourceTier: 3, weight: 76, minScore: 55, priority: 76, pollIntervalMinutes: 360, backfillPages: 20, backfillMode: 'api-page', stream: 'field-note', semanticPolicy: 'required', dailyItemCap: 8 },
  { id: 'zenn-enterprise-ai', name: 'Zenn', homepage: 'https://zenn.dev/topics/%E7%94%9F%E6%88%90ai', feedUrl: 'https://zenn.dev/topics/%E7%94%9F%E6%88%90ai/feed', fetchMode: 'rss', language: 'ja', country: 'JP', kind: 'community', contentType: 'blog', defaultPillar: 'Japan', sourceTier: 3, weight: 75, minScore: 55, priority: 75, pollIntervalMinutes: 360, backfillPages: 1, backfillMode: 'feed-window' },
  { id: 'yahoo-japan-it', name: 'Yahoo!ニュース IT', homepage: 'https://news.yahoo.co.jp/categories/it', feedUrl: 'https://news.yahoo.co.jp/rss/topics/it.xml', fetchMode: 'rss', language: 'ja', country: 'JP', kind: 'media', contentType: 'news', defaultPillar: 'Japan', sourceTier: 3, weight: 70, minScore: 58, priority: 70, pollIntervalMinutes: 180, backfillPages: 1, backfillMode: 'feed-window' },

  { id: 'arxiv-fde-research', name: 'arXiv FDE-adjacent', homepage: 'https://arxiv.org/', feedUrl: 'https://export.arxiv.org/api/query?search_query=%28all%3A%22agent%20evaluation%22%20OR%20all%3A%22prompt%20injection%22%20OR%20all%3A%22production%20RAG%22%20OR%20all%3A%22enterprise%20AI%20agent%22%29&sortBy=submittedDate&sortOrder=descending&max_results=15', fetchMode: 'rss', language: 'en', country: 'GLOBAL', kind: 'research', contentType: 'paper', defaultPillar: 'Build', sourceTier: 2, weight: 86, minScore: 58, priority: 72, pollIntervalMinutes: 1440, backfillPages: 3, backfillMode: 'api-page', stream: 'research', semanticPolicy: 'required', dailyItemCap: 5 },
  { id: 'stanford-ai-index', name: 'Stanford AI Index', homepage: 'https://hai.stanford.edu/ai-index', fetchMode: 'html', parseMode: 'page', language: 'en', country: 'GLOBAL', kind: 'report', contentType: 'report', defaultPillar: 'Organization', sourceTier: 1, weight: 94, minScore: 40, priority: 86, pollIntervalMinutes: 1440 },

  { id: 'youtube-openai', name: 'OpenAI YouTube', homepage: 'https://www.youtube.com/@OpenAI', feedUrl: youtubeFeed('UCXZCJLdBC09xxGZ6gcdrc6A'), fetchMode: 'rss', language: 'en', country: 'GLOBAL', kind: 'video', contentType: 'video', defaultPillar: 'Build', sourceTier: 1, weight: 92, minScore: 58, priority: 84, pollIntervalMinutes: 360, backfillPages: 1, backfillMode: 'feed-window' },
  { id: 'youtube-anthropic', name: 'Anthropic YouTube', homepage: 'https://www.youtube.com/@anthropic-ai', feedUrl: youtubeFeed('UCrDwWp7EBBv4NwvScIpBDOA'), fetchMode: 'rss', language: 'en', country: 'GLOBAL', kind: 'video', contentType: 'video', defaultPillar: 'Build', sourceTier: 1, weight: 90, minScore: 58, priority: 82, pollIntervalMinutes: 360, backfillPages: 1, backfillMode: 'feed-window' },
  { id: 'youtube-google-cloud', name: 'Google Cloud Tech YouTube', homepage: 'https://www.youtube.com/@googlecloudtech', feedUrl: youtubeFeed('UCJS9pqu9BzkAMNTmzNMNhvg'), fetchMode: 'rss', language: 'en', country: 'GLOBAL', kind: 'video', contentType: 'video', defaultPillar: 'Deploy', sourceTier: 1, weight: 88, minScore: 60, priority: 80, pollIntervalMinutes: 360, backfillPages: 1, backfillMode: 'feed-window' },
  { id: 'youtube-aws', name: 'AWS YouTube', homepage: 'https://www.youtube.com/@amazonwebservices', feedUrl: youtubeFeed('UCd6MoB9NC6uYN2grvUNT-Zg'), fetchMode: 'rss', language: 'en', country: 'GLOBAL', kind: 'video', contentType: 'video', defaultPillar: 'Deploy', sourceTier: 1, weight: 87, minScore: 60, priority: 79, pollIntervalMinutes: 360, backfillPages: 1, backfillMode: 'feed-window' },
  { id: 'youtube-cloudflare', name: 'Cloudflare YouTube', homepage: 'https://www.youtube.com/@cloudflare', feedUrl: youtubeFeed('UCgv3xMy6kECn0boYP9d2o-g'), fetchMode: 'rss', language: 'en', country: 'GLOBAL', kind: 'video', contentType: 'video', defaultPillar: 'Deploy', sourceTier: 1, weight: 86, minScore: 60, priority: 78, pollIntervalMinutes: 360, backfillPages: 1, backfillMode: 'feed-window' },
  { id: 'youtube-palantir', name: 'Palantir YouTube', homepage: 'https://www.youtube.com/@palantirtech', feedUrl: youtubeFeed('UCwed6_f0WcDIioXvMQfcP2Q'), fetchMode: 'rss', language: 'en', country: 'GLOBAL', kind: 'video', contentType: 'video', defaultPillar: 'Organization', sourceTier: 1, weight: 90, minScore: 55, priority: 81, pollIntervalMinutes: 360, backfillPages: 1, backfillMode: 'feed-window' }
];
