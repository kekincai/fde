# ローカル開発

## 必要なもの

- Node.js の現行 LTS
- npm
- Cloudflare アカウントへログイン済みの Wrangler（本番操作時のみ）

## 画面だけを動かす

```bash
npm install
npm run dev
```

`http://localhost:4321` で開きます。環境変数は不要で、`/api` は本番 API へ proxy されます。別の API（たとえば下の `cf:dev` で起動した Worker）を使う場合だけ、起動時に環境変数で指定します。

```bash
FDE_API=http://localhost:8787 npm run dev
```

## Worker とデータベースまで動かす

```bash
npm run db:migrate:local
npm run cf:dev
```

`cf:dev` は先に Astro を build し、静的ファイルと Worker API を同じ Wrangler 開発環境で起動します。情報源（Source）は Worker が起動時・収集時に `worker/sourceRegistry.ts` から同期するため、seed は不要です。

## 品質チェック

```bash
npm test          # worker/ と src/ の *.test.ts（node --test + tsx）
npm run lint
npm run check
npx tsc --noEmit
npm run build
```

テストでは主に次を確認します。

- feed の解析
- 24章が欠落していないこと、すべての章に最低3 Source が設定されていること
- 一般 AI ニュースを除外すること
- 企業導入・FDE 求人・日本のプライバシー情報を正しく扱うこと

## npm scripts

| コマンド | 内容 |
|---|---|
| `npm run dev` | 画面の開発サーバー |
| `npm run build` | 静的ファイルを `dist/` に出力 |
| `npm run cf:dev` | build してから Worker を含めてローカル起動 |
| `npm run cf:deploy` | build してから手元から本番へ deploy |
| `npm run db:migrate:local` | ローカルの D1 に migration を適用 |
| `npm run db:migrate:remote` | 本番の D1 に migration を適用 |

本番への出し方は [deployment.md](deployment.md) を参照してください。

## Git の運用

- `main` はデプロイ可能な状態を保つ（push すると自動で本番へ出る）。
- Source 追加、判定変更、UI 変更、migration は可能な限り別の commit に分ける。
- migration は適用後に書き換えず、新しい連番ファイルで補正する。
- 生成物 `dist/`、`.astro/`、`.wrangler/`、`.env*` は commit しない。
- commit 前に `git diff --check` と品質チェックを実行する。
- API key、DB password、接続文字列、secret は issue、README、commit に残さない。
- API を変更した場合は、[api.md](api.md) と画面の呼び出しを同じ commit で更新する。
