INSERT OR IGNORE INTO sources (id, name, homepage, feed_url, api_url, fetch_mode, language, country, priority, poll_interval_minutes, robots_checked_at, tos_reviewed_at)
VALUES
  ('publickey', 'Publickey', 'https://www.publickey1.jp/', 'https://www.publickey1.jp/atom.xml', NULL, 'rss', 'ja', 'JP', 90, 360, '2026-08-08', '2026-08-08'),
  ('qiita', 'Qiita', 'https://qiita.com/', NULL, 'https://qiita.com/api/v2/items', 'api', 'ja', 'JP', 88, 360, '2026-08-08', '2026-08-08'),
  ('mercari-engineering', 'Mercari Engineering', 'https://engineering.mercari.com/', 'https://engineering.mercari.com/feed/', NULL, 'rss', 'ja', 'JP', 86, 720, '2026-08-08', '2026-08-08'),
  ('line-engineering', 'LINEヤフー Tech Blog', 'https://techblog.lycorp.co.jp/ja', 'https://techblog.lycorp.co.jp/ja/feed', NULL, 'rss', 'ja', 'JP', 84, 720, '2026-08-08', '2026-08-08'),
  ('chrome-dev', 'Chrome for Developers', 'https://developer.chrome.com/blog/', 'https://developer.chrome.com/static/blog/feed.xml', NULL, 'rss', 'en', 'GLOBAL', 80, 720, '2026-08-08', '2026-08-08');
