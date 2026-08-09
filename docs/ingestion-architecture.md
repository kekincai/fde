# FDE Radar 収集・判定アーキテクチャ

FDE Radar は AI ニュースの量を増やすサイトではない。顧客の現場を理解し、小さく試し、本番で確かめ、運用可能な型として残すための行動材料を集める。

## 収集ストリーム

| ストリーム | 主な問い | 代表ソース | 日次上限 |
|---|---|---|---:|
| official-change | API・製品・廃止予定に何が変わったか | OpenAI、Anthropic、Google、AWS、Microsoft、Cloudflare | 15 |
| customer-outcome | 顧客課題、導入条件、成果は何か | 公式 Customer Stories、国内事例 | 12 |
| production-pattern | 本番化・統合・運用の再利用可能な型は何か | Palantir、各社技術ブログ | 10 |
| japan-government | 日本の行政利用・安全・制度に何が起きたか | デジタル庁 Gennai、IPA、経産省 | 8 |
| japan-enterprise | 日本企業の現場で何が成立したか | 企業技術ブログ、専門メディア | 12 |
| field-note | 実装者が得た具体的な知見は何か | Qiita、Zenn、登壇資料 | 8 |
| research | 現場課題を解く研究上の進展は何か | 絞り込んだ arXiv | 5 |
| report | 市場・経営・組織の大きな変化は何か | AI Index、調査レポート | 3 |
| talent | FDE の責任範囲と必要能力はどう変わるか | 公式採用ページ | 5 |
| video | デモ・講演から何を確認できるか | 公式 YouTube | 5 |

日本とグローバルは表示時に別軸で集計し、目標比率をおおむね 50:50 とする。研究・採用・動画は主フィードを占有しない。

## パイプライン

```text
DISCOVER → EXTRACT → NORMALIZE → HARD GATE → SEMANTIC REVIEW
         → DEDUPE / EVENT FINGERPRINT → PUBLISH → INDEX / NOTIFY
```

1. **DISCOVER**: 公式 RSS/API/対象ページから候補を取得する。
2. **EXTRACT**: タイトル、短い概要、公開時刻、タグ、URL を取り出す。
3. **NORMALIZE**: URL、時刻、文字列を正規化する。
4. **HARD GATE**: AI と無関係な情報、一般ニュース、対象外求人、現場との接点がない研究を除外する。
5. **SEMANTIC REVIEW**: Workers AI が FDE との意味的な関連、行動可能性、顧客適合度を JSON で判定する。
6. **DEDUPE**: URL・本文ハッシュに加え、見出しのイベント指紋で同一事象を束ねる。
7. **PUBLISH**: 合格した記事だけを公開し、理由・推奨行動・根拠を保存する。

AI 判定が失敗した候補は公開せず `pending` に残す。クローラー全体は失敗させず、次回再判定できる。すべての候補は `ingest_candidates` に残り、収録・拒否の理由を監査できる。

## 収録条件

AI という語があるだけでは収録しない。少なくとも次の一つが必要である。

- 顧客課題、業務プロセス、導入成果
- 統合、本番化、移行、運用、定着
- ID、権限、評価、監視、品質、セキュリティ、ガバナンス
- Agent、RAG、Connector、MCP などを現場で成立させる具体策
- FDE / FDSE / Deployment Strategist の責任や組織設計

モデル性能だけの記事、一般的な AI ニュース、AI と無関係な官公庁公告、入門チュートリアル、対象外求人は除外する。

## 品質指標

`source_quality_daily` で発見数、硬判定除外数、AI審査数、AI除外数、公開数、重複数、AIエラー数をソース別に記録する。管理画面では次を追う。

- Precision@20 / Actionable@20
- Japan Recall と日本・グローバル比率
- 公式一次情報比率
- 重複イベント率
- 発見までの時間と重要ソースの鮮度
- 未分類トピック率
- 保存・クリック・行動化率
