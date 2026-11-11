# API

すべて `https://fde.kejincai.dev` の下にあります。詳細な request / response は `worker/index.ts` の各 route と型を正とします。API を変更したら、この表と画面の呼び出しを同じ commit で更新してください。

## 公開 API（認証不要）

| Method | Path | 用途 |
|---|---|---|
| GET | `/api/health` | 稼働確認とデプロイ中の Worker バージョン |
| GET | `/api/articles` | 記事検索・ページング |
| GET | `/api/articles/:id` | 1記事（二面の直リンク用） |
| GET | `/api/overview` | 公開件数、最終収集時刻、Source 名 |
| GET | `/api/coverage` | 24章の供給状況（`healthy / thin / empty`） |
| POST | `/api/analytics/events` | 匿名の利用イベント（同一 origin、回数制限あり） |

`/api/articles`、`/api/articles/:id`、`/api/overview`、`/api/coverage` は edge cache されます。

### `/api/articles` の検索条件

| パラメーター | 値 |
|---|---|
| `channel` | `action`（既定）/ `research` / `career` |
| `region` | `Japan` / `Global` |
| `pillar` / `layer` / `chapter` | 工程・テーマ・章 |
| `priority` | `P0` / `P1` / `P2` |
| `q` | 検索語（FTS5） |
| `sort` | `newest`（既定）/ `priority` / `published` |
| `page` / `pageSize` | ページング（`pageSize` は既定10、最大25） |

並び順:

- `newest`: 再取得時刻ではなく初回収集時刻（`first_seen_at`）。古い記事を再巡回しても一覧の先頭へ戻らない。
- `priority`: P0 → P1 → P2、次に重要度スコア。
- `published`: 情報源の公開日時。

## ログインユーザー（session）

| Method | Path | 用途 | 認証 |
|---|---|---|---|
| POST | `/api/auth/passkey/*` | パスキー登録・ログイン | challenge / WebAuthn |
| GET | `/api/auth/me` | 現在の session と保存 ID | session |
| POST | `/api/auth/logout` | ログアウト | session |
| GET | `/api/auth/sessions` | ログイン中のセッション一覧 | session |
| DELETE | `/api/auth/sessions/:id` | セッションの終了 | session |
| GET | `/api/bookmarks` | 保存記事（公開中のものだけ。検索条件と並び順は記事一覧と同じ） | session |
| PUT / DELETE | `/api/bookmarks/:id` | 保存・解除 | session |

## 管理・運用

| Method | Path | 用途 | 認証 |
|---|---|---|---|
| GET | `/api/admin/analytics` | 管理統計 | admin |
| GET | `/api/ingest/status` | Source と取得 run の状態 | admin または `INGEST_TOKEN` |
| POST | `/api/ingest/dispatch` | 手動収集 | `INGEST_TOKEN` |
| POST | `/api/ingest/backfill` | 過去分の取り込み | `INGEST_TOKEN` |
| POST | `/api/ingest/email/test` | メール接続テスト・日報の試験送信 | `EMAIL_TEST_TOKEN` |

token は `Authorization: Bearer <token>` で渡します。使い方の例は [operations.md](operations.md) にあります。
