# FDE RADAR

**AI Forward Deployed Engineer / Engineering** の仕事を、`Customer → Build → Deploy → Govern → Organization → Japan` の閉ループで追う公開型の日本語リファレンスです。

対象はエンジニアだけではありません。AIを導入する企業、FDEという役割を知りたい人、キャリアを検討する人が、一次情報を起点に「現場で何が変わるか」を理解できることを目指します。

## 技術構成

- **Astro**: SEO を意識した公開サイト
- **Hono**: Worker 内の `/api/*` と ingest の HTTP 入口
- **Cloudflare Workers Static Assets**: Astro の静的アセット配信
- **D1 + FTS5**: 記事メタデータ、タイムライン、初期の全文検索
- **Hyperdrive + PostgreSQL**: Mini PC 上の許可された構造化アーカイブの保存
- **R2（任意）**: PostgreSQL が利用できない環境向けのアーカイブ fallback
- **KV**: 公開設定と短期キャッシュ
- **Queues + Cron Triggers**: 取得処理の非同期化と定期実行

## 実装済みの取得フロー

Cron は 6 時間ごとに Source Registry を読み、取得期限を迎えた Source を **1 Source = 1 Queue message** で送ります。ひとつの取得失敗で全体を止めません。Consumer は各 Source に設定された公開面を使い、次の優先順位で取得します。

```text
API → RSS / Atom → 静的 HTML（HTMLRewriter）
```

取得済みの Source では `ETag` と `Last-Modified` を再送し、`304` は再保存しません。`429` は `Retry-After` を尊重し、指数バックオフと `backoff_until` を D1 に記録します。`403 / 401 / CAPTCHA / ログイン壁` を迂回せず、明示された次の取得面だけに降格します。

タイトルに AI と書かれているだけでは公開しません。顧客、導入、本番化、評価、運用、採用役割などの複合条件から `fde_score`（0〜100）を計算し、Source ごとの基準未満の一般 AI ニュースや一般開発記事を除外します。取得のたびに Source 単位の公開スナップショットを更新し、判定基準から外れた古い項目は公開一覧から退避します。

各項目には Pillar、Subtopic、Content Type、Region、日中要約、本文から判定した FDE 接点・事業影響・実装影響タグ、原典 URL を保存します。影響を説明する定型文は生成しません。タイトルや要約が変わったときは `article_versions` に変更履歴を残します。公開 API は Japan / Global を交互に返し、初期画面が片方だけに偏らないようにしています。

各成功・失敗は `fetch_runs` と `sources` に記録されます。正規化 URL の SHA-256、記事 URL の UNIQUE 制約、D1 FTS5 の日本語分かち書きで重複と検索を処理します。許可された構造化データだけを PostgreSQL の `fde.source_archives` に保存します。Hyperdrive が未接続のローカル環境では、R2 binding がある場合だけ R2 に fallback します。

## 監視する情報源

Source Registry は 35 件（うち取得可能な 34 件を自動実行）です。

- 上流一次情報: OpenAI News / Platform Changelog、Anthropic、Palantir
- 実装・クラウド: Google Cloud、Microsoft Azure、GitHub、AWS、Cloudflare
- 日本の行政・安全: デジタル庁、IPA
- 日本の企業・技術メディア: Publickey、ITmedia AI+、CodeZine、EnterpriseZine、DevelopersIO、LY、CyberAgent
- 日本の現場共有・求人: Qiita、Zenn、AI Native Careers、TokyoDev、Yahoo!ニュース IT
- 研究・レポート: FDE 隣接テーマに限定した arXiv、Stanford AI Index
- 動画: OpenAI、Anthropic、Google Cloud、AWS、Cloudflare、Palantir の公式 YouTube Feed

OpenAI の東京 FDE 公式ページは Source Directory に保持していますが、Cloudflare Workers から 403 になるため自動取得を停止しています。アクセス制限は迂回しません。

Yahoo!ニュースは発見用の二次情報として区別します。記事本文は転載せず、メタデータ、短い要約、出典リンクのみを公開します。

本番の手動確認用 API は `POST /api/ingest/dispatch`、状態確認用 API は `GET /api/ingest/status` です。`INGEST_TOKEN` secret を設定した場合、dispatch は `Authorization: Bearer <token>` が必要です。

## 履歴データの初期投入

`POST /api/ingest/backfill` は、指定日以降の公開履歴を Source ごとの Queue message に分割して投入します。2026年6月以降を初期データにする例は `{"since":"2026-06-01"}` です。途中から再開するときは `sourceIds` と `pages` で Source とページを限定できます。再実行しても URL の一意制約で重複しません。通常巡回の公開スナップショットを退避しないため、履歴投入中に古い記事が消えることもありません。

ここでいう履歴の範囲は「各 Source が公式 RSS、公開 API、または公開ページで提供している範囲」です。Qiita と arXiv は API pagination、CyberAgent は Feed pagination、OpenAI News は全履歴 Feed を日付で区切って処理します。直近20件などに限定された Feed は、その公開窓を超える記事を完全取得したとは扱いません。取得結果は `fetch_runs` の `ingest_mode`、`backfill_page`、`since_at` で監査できます。

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

このリポジトリは小さなコミットを積み上げる前提です。API キー、データベースの接続情報、`INGEST_TOKEN` はコミットしません。

## ライセンス

MIT License。外部ソースの記事コンテンツは各ソースの利用条件に従います。
