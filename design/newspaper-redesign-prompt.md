# FDE Radar UI 重做：日本报纸纸面风格（实现提示）

把下面整段复制给实现用的 chat。设计稿在 Design 画布：https://claude.ai/artifact/YJBEJtSZySQ4SevT8md1aR （四块画板：一面、二面、三面、手机版）。

---

## 任务

把 FDE Radar（https://fde.kejincai.dev）的前端 UI 按「日本报纸纸面」风格全部重做。忽略现有视觉风格，只保留数据、API、路由状态和功能。设计稿见上面的画布链接，以画布为准；本文是对画布的文字说明和实现约束。

## 仓库现状（先读这些）

- Astro + React，Cloudflare Workers 部署。入口 `src/pages/index.astro`，应用根组件 `src/components/RadarApp.tsx`。
- 所有视图组件在 `src/components/radar/`：`Chrome.tsx`（品牌、导航、账号）、`SignalList.tsx` + `SignalRow.tsx`（列表）、`SignalDetail.tsx`（文章详情）、`FilterPanel.tsx`、`KnowledgeMap.tsx`（24 の問い）、`AboutFde.tsx`、`AuthDrawer.tsx`、`Icon.tsx`。
- 唯一的样式表 `src/styles/app.css`，token 在 `:root`。重做时整份替换。
- 数据模型 `src/data/articles.ts`（`Article` 类型、`pillars`、`priorityMeta`）和 `src/components/radar/model.ts`（`fromApi`、日期格式化、`usefulNote`）。
- URL 同步的筛选状态 `useRadarState.ts`：`view / channel / region / pillar / topic / chapter / priority / sort / query / page`。保持这些参数名和语义不变。
- 数据来源 `useArticles.ts` → `GET /api/articles`，另外 `GET /api/overview`（总数、日本件数、P0/P1/P2 件数、最后收集时间）、`GET /api/coverage`（24 章的 publishedCount / sourceCount / status）。
- 不要动 `worker/`、`AdminDashboard.tsx`、认证流程（passkey）、分析埋点 `src/lib/analytics.ts` 的事件名。

## 设计方向

一份日式报纸的朝刊一面：縦書き（竖排）标题与正文、段組（多段分栏）、右上题字框、紙面案内栏、黑底白字的「きょう対応」栏、双线与细线分段。纯白印刷纸底色（参考纽约时报网页：白底、近黑墨色、中性灰细线），不是米黄色。整页只有一种彩色：朱红，只用于 P0「きょう対応」标记和「薄い章」红框。

### 颜色 token

```
--paper: #FFFFFF        纸面
--surface: #F7F7F7      囲み、按钮底
--ink: #121212          墨色（标题、正文、黑底栏）
--ink-2: #363636        正文次要
--ink-3: #5A5A5A        说明文字、日期
--rule: #DFDFDF         细线、段间线
--rule-dot: #8A8A8A     点线
--heat-1: #B3B3B3  --heat-2: #8A8A8A  --heat-3: #5A5A5A  --heat-4: #363636  --heat-5: #121212   二十四の問い 热度格
--p0: #B3261E           朱红：きょう対応、薄い章红框
--p1: #8A6A00           琥珀：P1 今週検証 文字
```

### 字体（Google Fonts）

- 标题与正文：`Noto Serif JP`（500/700/900）。
- 题字「ＦＤＥレーダー」专用：`Yuji Syuku`（隷書风书法体，weight 400），一面题字框、页眉小题字、页脚小题字、手机版题字都用它。
- 横排的功能性文字（导航、按钮、列表 meta、表格）：`Noto Sans JP`（400/500/700）。
- 数字在竖排里用汉数字（六日、九八〇件、十三件），横排用阿拉伯数字。

### 竖排段组的 CSS 技法

竖排正文用 CSS 多栏在 `writing-mode: vertical-rl` 下实现「段」：

```css
.tate-body {
  writing-mode: vertical-rl;
  height: 470px;            /* 段的总高 = 每段高 × 段数 + 间隔 */
  column-width: 142px;      /* 每段的高度（竖排里 column-width 是竖向的） */
  column-gap: 22px;
  column-fill: auto;        /* 像报纸一样先填满上一段再到下一段 */
  column-rule: 1px solid var(--rule);
  overflow: hidden;
  font-size: 15px; line-height: 1.9; letter-spacing: .02em; text-align: justify;
}
.tate-body p { margin: 0; text-indent: 1em; }
```

竖排标题：`writing-mode: vertical-rl; font-weight: 900; line-height: 1.22; height: 固定值`，用 `<br>` 控制换行。阅读顺序从右到左：容器用 `display: flex; flex-direction: row-reverse`，DOM 顺序 = 阅读顺序（标题在前）。手机端（<768px）正文全部回退横排，只有题字和顶条标题保留竖排。给 Safari 老版本准备横排回退。

## 页面结构

### 一面（首页，`view=radar`）

从上到下：

1. 最上段，从右到左：题字框（竖排「ＦＤＥレーダー」，2px 黑框，右侧竖排日期「二〇二六年十一月六日　金曜日」与「朝刊　第N号」）→ 收集状况栏（竖排 4 项：収録記事、うち日本、きょう対応（朱红）、最終収集，数据来自 `/api/overview`）→ 左侧横排「紙面案内」黑底标题 + 6 项两列索引（きょうの一面 / 記事と確認ポイント / 二十四の問い / 日本レンズ / 保存した記事 / ＦＤＥとは），其下搜索框 + 「パスキーでログイン」黑底按钮。下沿双线。
2. 一面トップ：当日最高分的文章。右侧竖排主标题（46px/900，两行）+ 袖标题（26px/700）+ 竖排 meta（pillar 黑底白字、来源、收集时间、P 等级）；中间竖排三段组正文（`summary` 为主，`why_it_matters` 作「【本紙の見方】」段）；左侧竖排囲み「次に確かめること」（`recommended_action` 拆成「一、二、三」，底注「生成された補足。一次情報で確認を。」）。
3. 二段目：三篇文章并排，每篇竖排标题 28px + 副题 17px + 两段组正文 14px，末行括号出处与日期。P0 文章标题顶部加朱红「きょう対応」小标。
4. 三段目，从右到左：「きょう対応　Ｐ０」黑底标题 + 横排列表（朱红方块、标题、来源与一句说明、「十三件すべてを見る」）→「日本レンズ」竖排栏（竖排栏名 + 一句说明 + 三条带「制度／調達／基盤」小标的竖排标题，取 `region=Japan` 且 `japan_lens` 非空）→「二十四の問い　記事の厚み」横排表格（5 行 × 各章格子，格子底色按件数分 5 级灰阶，`status=thin` 的章用朱红框白底红字，取 `/api/coverage`，右上「三面へ」）。
5. 下段：五个 pillar 的短信栏（顧客課題 / 構築 / 本番導入 / 統制・安全 / 組織・定着），每栏黑色双线下 3 条横排标题，点线分隔。顺序从右到左是 Customer → Organization。
6. 页脚：第一行小题字 + 标语「ＡＩを「試した」で終わらせない、現場のためのフィールドインテリジェンス」（标语只出现在页脚，不出现在题字旁），第二行「きょうの一次情報源」列表与「六時間ごとに収集。本文は保存せず、一次情報へ送ります。」，右侧 ＦＤＥとは / プライバシー / ＡＰＩ / GitHub。

筛选（region / priority / pillar / topic / chapter / query / sort）仍要能用：放进「紙面案内」下方一条横排的折叠筛选条，激活时在顶条下方显示 chip，视觉用黑框白底，不加圆角。分页保留在五个短信栏之后，样式为「前の面 / 次の面」。

### 二面（文章详情，点任意标题进入；桌面端替代现有右侧 Drawer，也可作为 `/?a=<id>` 路由）

- 页眉：小题字、日期、紙面导航（一面 / 二面 記事 / 三面 二十四の問い / 日本レンズ / 保存），右端「（二面）　<pillar>」。
- 前后文章导航一行（「← 前の記事 ○○」「次の記事 ○○ →」），不显示任何键盘快捷键提示。
- 正文区从右到左：竖排主标题 52px + 袖标题 28px + 竖排 meta（pillar、P、出典、公開、収集、種別、関連度）→ 竖排四段组正文 15.5px → 左侧横排侧栏：囲み「現場での確認ポイント」（`recommended_action`）+「関連箇所」（`evidence`）+ 底注；黑底按钮「一次情報を読む（域名）」；两个白底黑框按钮「保存する」「リンクを複製」；`dl` 显示 章（可点到三面）、視点（japan_lens）、影響（tags）、判定（semantic_decision 与 confidence）。
- 下段「同じ問いの記事」：同一 `chapter_id` 的 4 篇横排卡，细线分列，末行说明「本文は保存していません…」与「一面へ戻る」。

### 三面（`view=knowledge`，24 の問い）

- 页眉同二面，右端「（三面）　ナレッジマップ」。
- 面头：竖排大标题「二十四の問いで現場を見る」+ 副题 + 竖排两段组说明 + 集計栏（健全な章 / 薄い章 / 公開記事）。
- 五个 pillar 各占一「段」，上下用 1px 黑线分隔，段内从右到左：竖排段名（26px/900，上方小字「第一　Customer　四問　三〇七件」）→ 主记事（该 pillar 中 `publishedCount` 最大的章：竖排问题标题 28px + 竖排两栏短文，短文说明件数、情报源数和今天新增的文章标题）→ 其余章按件数分主次的网格：件数大的用 19px 明朝标题 + 一句说明 + 大号件数；件数小的只留 15px 标题 + 件数；`status=thin` 的章合并进一个朱红内框的囲み「薄い章」，可两章并排。点任意章 = 跳回一面并应用 `chapter` 筛选。
- 页脚凡例：「各段の縦見出しは、その工程で最も記事が厚い問い」、薄い章红框、きょうの一面の章（浅灰底）、更新时间，右端「この集計を API で取得（/api/coverage）」。

### 手机版（<768px）

- 顶部：竖排小题字框（36×128）+ 竖排日期，左侧横排收集状况 `dl`。
- 紙面案内改为 5 格等宽横条（一面 / 記事 / 二十四の問い / 日本 / 书签图标），当前项黑底白字，高 44px。
- 顶条文章：竖排标题 30px + 副题 + 竖排两段组（高 300px），下方两个 44px 按钮「要点と確認ポイント」「一次情報を開く」。
- 其余段全部横排：きょう対応黑底栏、两篇竖排标题 + 横排摘要的文章、日本レンズ、二十四の問い 简表、工程别短信、「昨日以前の紙面を読む」整宽按钮、页脚。

## 行为约束

- 键盘快捷键 j/k/o/s// 继续工作，但界面上任何地方都不显示快捷键提示。
- 所有交互元素是真实的 `<a href>` / `<button>` / `<input>`+`<label>`，触控目标 ≥ 44px，文字对比 ≥ 4.5:1。
- 不用 emoji、渐变、圆角卡片、阴影。线条只有 1px 细线、2px 粗线、3px 双线。
- 题字框、黑底栏、朱红标记以外不要再加装饰。
- 深色模式这次不做，删掉现有 `prefers-color-scheme: dark` 的 token。
- 保持 `track()` 的事件名和 section 划分不变。

## 验收

- 一面在 1440 宽下与画布「一面」画板一致；二面、三面同理；390 宽下与「手机版」画板一致。
- 竖排段组在 Chrome 与 Safari 最新版渲染正常；旧 Safari 回退横排不乱版。
- 筛选、搜索、分页、保存、登录、管理后台全部可用，URL 参数不变。
- `npm run build` 通过，无新的类型错误。
