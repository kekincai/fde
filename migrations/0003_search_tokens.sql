ALTER TABLE articles ADD COLUMN search_tokens_ja TEXT NOT NULL DEFAULT '';

DROP TABLE IF EXISTS articles_fts;

CREATE VIRTUAL TABLE articles_fts USING fts5(
  article_id UNINDEXED,
  title,
  summary,
  tags,
  search_tokens_ja,
  tokenize = 'unicode61'
);
