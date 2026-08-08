# FDE RADAR

日本を中心に、Web とデジタルの変化を「会社の参考」と「個人の参考」の両方から読めるように整理する、公開型の技術・業界動向サイトです。

FDE はここでは **Front-end Development Engineering** を中心とした広い領域を指します。対象は開発者だけではありません。サービス、組織、採用、学び方、アクセシビリティなど、変化の影響を知りたい人が判断材料として使えることを目指します。

## 技術構成

- **Astro**: SEO を意識した公開フロントエンド
- **Hono**: Worker 内の `/api/*` と ingest の HTTP 入口
- **Cloudflare Workers Static Assets**: Astro の静的アセット配信
- **D1 + FTS5**: 記事メタデータ、タイムライン、初期の全文検索
- **Hyperdrive + PostgreSQL**: Mini PC 上の許可された構造化アーカイブの保存
- **R2（任意）**: PostgreSQL が利用できない環境向けのアーカイブ fallback
- **KV**: 公開設定と短期キャッシュ
- **Queues + Cron Triggers**: 取得処理の非同期化と定期実行

## 実装済みの取得フロー

Cron は Source Registry を読み、Source ID の配列を 1 件の Queue message にまとめて dispatch します。Consumer は各 Source を次の順で試します。

```text
API → RSS / Atom → 静的 HTML（HTMLRewriter）
```

取得済みの Source では `ETag` と `Last-Modified` を再送し、`304` は再保存しません。`429` は `Retry-After` を尊重し、指数バックオフと `backoff_until` を D1 に記録します。`403 / 401 / CAPTCHA / ログイン壁` を迂回せず、明示された次の取得面だけに降格します。

各成功・失敗は `fetch_runs` と `sources` に記録されます。正規化 URL の SHA-256、記事 URL の UNIQUE 制約、`source_id + external_item_id`、D1 FTS5 の日本語分かち書きで重複と検索を処理します。許可された構造化データだけを PostgreSQL の `fde.source_archives` に保存します。Hyperdrive が未接続のローカル環境では、R2 binding がある場合だけ R2 に fallback します。

本番の手動確認用 API は `POST /api/ingest/dispatch`、状態確認用 API は `GET /api/ingest/status` です。`INGEST_TOKEN` secret を設定した場合、dispatch は `Authorization: Bearer <token>` が必要です。

## ローカルで動かす

```bash
npm install
npm run dev
```

本番相当の Worker 配信を確認する場合は、先に `npm run build` を実行してから `npm run cf:dev` を使います。D1 をローカルで試す場合は、Wrangler のローカル D1 を準備してから次を実行します。

```bash
npm run db:migrate:local
npm run db:seed
```

## Cloudflare の準備

1. `wrangler d1 create fde-radar` で D1 を作成し、返された ID を `wrangler.toml` の `database_id` に設定する。
2. Hyperdrive の `minipc-postgres-hyperdrive` を `wrangler.toml` の `HYPERDRIVE` binding に設定する。
3. `migrations/postgres/0001_archive.sql` を PostgreSQL の `fde` database で実行する。
4. `wrangler kv namespace create CACHE` で KV namespace を作成し、返された ID を `wrangler.toml` に設定する。
5. `wrangler queues create fde-radar-ingest` で Queue を作成する。
6. `npm run db:migrate:remote` と `npm run cf:deploy` を実行する。

R2 はこの構成では必須ではありません。既存の Workers VPC + Hyperdrive + PostgreSQL を優先して使うため、R2 のアカウント有効化やカード登録なしでアーカイブを保存できます。R2 を使う場合だけ Dashboard で有効化し、bucket を作成して binding のコメントを外してください。

最初は RSS / API を優先し、robots.txt、利用規約、Feed の利用条件を確認できた Source だけを登録してください。403 / 429 / CAPTCHA / ログイン壁を自動で回避しないこと、第三者記事の全文を保存・再配布しないことをデフォルトにしています。

## Git / 公開リポジトリ

このリポジトリは小さなコミットを積み上げる前提です。推奨の区切りは、`scaffold`、`content-model`、`frontend`、`worker-ingest`、`docs` です。公開する際は、Cloudflare のリソース ID や API キーをコミットしないでください。

## ライセンス

MIT License。外部ソースの記事コンテンツは各ソースの利用条件に従います。
