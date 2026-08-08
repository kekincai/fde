# FDE RADAR

日本を中心に、Web とデジタルの変化を「会社の参考」と「個人の参考」の両方から読めるように整理する、公開型の技術・業界動向サイトです。

FDE はここでは **Front-end Development Engineering** を中心とした広い領域を指します。対象は開発者だけではありません。サービス、組織、採用、学び方、アクセシビリティなど、変化の影響を知りたい人が判断材料として使えることを目指します。

## 技術構成

- **Astro**: SEO を意識した公開フロントエンド
- **Hono**: Worker 内の `/api/*` と ingest の HTTP 入口
- **Cloudflare Workers Static Assets**: Astro の静的アセット配信
- **D1 + FTS5**: 記事メタデータ、タイムライン、初期の全文検索
- **R2**: 許可された構造化アーカイブの保存
- **KV**: 公開設定と短期キャッシュ
- **Queues + Cron Triggers**: 取得処理の非同期化と定期実行

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
2. `wrangler r2 bucket create fde-radar-archive` で R2 bucket を作成する。
3. `wrangler kv namespace create CACHE` で KV namespace を作成し、返された ID を `wrangler.toml` に設定する。
4. `wrangler queues create fde-radar-ingest` で Queue を作成する。
5. `npm run db:migrate:remote` と `npm run cf:deploy` を実行する。

最初は RSS / API を優先し、robots.txt、利用規約、Feed の利用条件を確認できた Source だけを登録してください。403 / 429 / CAPTCHA / ログイン壁を自動で回避しないこと、第三者記事の全文を保存・再配布しないことをデフォルトにしています。

## Git / 公開リポジトリ

このリポジトリは小さなコミットを積み上げる前提です。推奨の区切りは、`scaffold`、`content-model`、`frontend`、`worker-ingest`、`docs` です。公開する際は、Cloudflare のリソース ID や API キーをコミットしないでください。

## ライセンス

MIT License。外部ソースの記事コンテンツは各ソースの利用条件に従います。
