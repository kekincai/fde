# FDE RADAR

AI導入の変化を `Customer → Build → Deploy → Govern → Organization` の実務ループで追い、P0（今日対応）/ P1（今週検証）/ P2（背景学習）へ整理する公開型の日本語フィールドインテリジェンスです。`Japan` は Pillar ではなく、横断的な Region / Japan Lens として扱います。

対象はエンジニアだけではありません。AIを導入する企業、FDEという役割を知りたい人、キャリアを検討する人が、一次情報を起点に「現場で何が変わるか」を理解できることを目指します。

## 主な機能

- 6時間ごとの定期収集と D1/FTS5 検索
- P0（今日対応）・P1（今週検証）・P2（背景学習）の判断レベル
- 10件単位のサーバーサイドページングと絞り込み
- メール不要のパスキー登録・ログインと記事保存
- 管理者だけに表示される利用状況・収集状態ダッシュボード
- IP、検索語、生体情報、パスキー内容を保存しない最小限の製品分析

## 管理者の設定

新規ユーザーは常に `member` です。管理者へ変更する場合は対象を確認したうえで D1 の `users.role` を `admin` に更新してください。表示上のフラグではなく、すべての管理 API でサーバー側のセッションと権限を再確認します。

## 技術構成

- **Astro**: SEO を意識した公開サイト
- **Hono**: Worker 内の `/api/*` と ingest の HTTP 入口
- **Cloudflare Workers Static Assets**: Astro の静的アセット配信
- **D1 + FTS5**: 記事メタデータ、全文検索、アカウント、WebAuthn challenge、保存記事
- **Hyperdrive + PostgreSQL**: Mini PC 上の許可された構造化アーカイブの保存
- **R2（任意）**: PostgreSQL が利用できない環境向けのアーカイブ fallback
- **KV**: 認証のレート制限、公開設定と短期キャッシュ
- **Queues + Cron Triggers**: 取得処理の非同期化と定期実行

## 実装済みの取得フロー

Cron は 6 時間ごとに Source Registry を読み、取得期限を迎えた Source を **1 Source = 1 Queue message** で送ります。ひとつの取得失敗で全体を止めません。Consumer は各 Source に設定された公開面を使い、次の優先順位で取得します。

```text
API → RSS / Atom → 静的 HTML（HTMLRewriter）
```

取得済みの Source では `ETag` と `Last-Modified` を再送し、`304` は再保存しません。`429` は `Retry-After` を尊重し、指数バックオフと `backoff_until` を D1 に記録します。`403 / 401 / CAPTCHA / ログイン壁` を迂回せず、明示された次の取得面だけに降格します。

タイトルに AI と書かれているだけでは公開しません。顧客、導入、本番化、評価、運用、採用役割などの複合条件から `fde_score`（0〜100）を計算し、Source ごとの基準未満の一般 AI ニュースや一般開発記事を除外します。通常巡回は既存の履歴を消さず、新着と更新だけを追加します。

各項目には Core Pillar、Japan Lens、Topic Layer、Affected Stack、Content Type、Region、P0/P1/P2、推奨アクション、判定根拠、原典 URL を保存します。過去記事を一件ずつ手作業で要約せず、Source が提供する要約と今後の自動取得時の抽出結果を使います。タイトルや要約が変わったときは `article_versions` に変更履歴を残します。

P0 は直近14日以内の、信頼できる情報源にある明確な脆弱性・侵害・破壊的変更・提供終了に限定します。普通のセキュリティ解説や「期限」という単語だけでは P0 にしません。P1 は本番、認証、監視、連携、費用などの検証候補、P2 は論文・調査・採用・背景知識です。

## アカウントと保存

メールアドレスとパスワードは収集しません。WebAuthn の discoverable credential（パスキー）を使い、Face ID、Touch ID、Windows Hello、セキュリティキーなどで登録・ログインします。D1 に保存するのはユーザー表示名、WebAuthn 公開鍵、署名カウンター、セッションのハッシュだけです。生体情報は端末から送信されません。

ログイン後の保存記事は `user_bookmarks` に記録され、端末をまたいで利用できます。保存・解除・記事を開いた行動は、今後の自動ランキング改善に使えるフィードバックとして `user_actions` に保存します。

各成功・失敗は `fetch_runs` と `sources` に記録されます。正規化 URL の SHA-256、記事 URL の UNIQUE 制約、D1 FTS5 の日本語分かち書きで重複と検索を処理します。許可された構造化データだけを PostgreSQL の `fde.source_archives` に保存します。Hyperdrive が未接続のローカル環境では、R2 binding がある場合だけ R2 に fallback します。

## 監視する情報源

Source Registry は日本とグローバルの一次情報、実装メディア、コミュニティ、求人、研究を分離して管理します。

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
