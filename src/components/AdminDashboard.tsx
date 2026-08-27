import { useEffect, useMemo, useState } from 'react';
import Icon, { type IconName } from './radar/Icon';

type MetricRow = {
  page_views?: number; article_opens?: number; source_clicks?: number; bookmark_saves?: number; visitors?: number; sessions?: number;
  previous_page_views?: number; previous_article_opens?: number; previous_source_clicks?: number; previous_visitors?: number;
  first_event_at?: string; last_event_at?: string;
};
type TrendRow = { day: string; page_views: number; article_opens: number; source_clicks: number; visitors: number };
type AdminData = {
  days: number; timezone?: string; measuredSince?: string; metrics?: MetricRow;
  users?: { total_users?: number; new_users?: number };
  trend?: TrendRow[];
  popularArticles?: Array<{ id: string; title: string; source_name: string; opens: number; source_clicks: number; saves: number; readers: number }>;
  sections?: Array<{ section: string; views: number; visitors: number }>;
  devices?: Array<{ device_type: string; views: number; visitors: number }>;
  referrers?: Array<{ referrer: string; views: number; visitors: number }>;
  timeBands?: Array<{ time_band: string; views: number; visitors: number }>;
  ingest?: { runs?: number; successful_runs?: number; failed_runs?: number; new_articles?: number; successRate?: number };
  inventory?: { published_articles?: number; suppressed_articles?: number; active_sources?: number; latest_article_at?: string };
  sourceHealth?: Array<{ id: string; name: string; last_success_at?: string; last_error_at?: string; consecutive_failures: number; backoff_until?: string }>;
  error?: string;
};

const sectionLabels: Record<string, string> = { about: 'FDEとは', action: '実務シグナル', japan: '日本', research: 'リサーチ', saved: '保存済み', admin: '管理' };
const deviceLabels: Record<string, string> = { desktop: 'デスクトップ', tablet: 'タブレット', mobile: 'モバイル' };
const deviceIcons: Record<string, IconName> = { desktop: 'desktop', tablet: 'tablet', mobile: 'mobile' };
const referrerLabels: Record<string, string> = { direct: '直接アクセス', self: 'サイト内', unknown: '計測開始前・不明' };
const number = (value?: number) => new Intl.NumberFormat('ja-JP').format(Number(value ?? 0));
const percent = (value: number) => `${Number.isFinite(value) ? value.toFixed(1) : '0.0'}%`;

function formatDateTime(value?: string) {
  if (!value) return 'データなし';
  const normalized = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`;
  return new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(normalized));
}

function comparison(current?: number, previous?: number) {
  const now = Number(current ?? 0);
  const before = Number(previous ?? 0);
  if (!before) return now ? '前期間は 0' : '前期間と同じ';
  const change = (now - before) / before * 100;
  return `${change >= 0 ? '+' : ''}${change.toFixed(1)}% 前期間比`;
}

function niceMax(values: number[]) {
  const max = Math.max(...values, 1);
  const power = 10 ** Math.floor(Math.log10(max));
  return Math.ceil(max / power) * power;
}

function TrendChart({ rows = [] }: { rows?: TrendRow[] }) {
  const [active, setActive] = useState<number | null>(null);
  const width = 760;
  const height = 250;
  const left = 46;
  const right = 14;
  const top = 20;
  const bottom = 38;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const max = niceMax(rows.flatMap((row) => [Number(row.page_views), Number(row.visitors), Number(row.article_opens)]));
  const x = (index: number) => left + index * (plotWidth / Math.max(rows.length - 1, 1));
  const y = (value: number) => top + plotHeight - Number(value) / max * plotHeight;
  const points = (key: keyof Pick<TrendRow, 'page_views' | 'visitors' | 'article_opens'>) => rows.map((row, index) => `${x(index)},${y(Number(row[key]))}`).join(' ');
  const xLabelIndexes = new Set([0, Math.floor((rows.length - 1) / 2), rows.length - 1]);
  const selected = active === null ? rows.at(-1) : rows[active];

  if (!rows.length) return <div className="chart-empty">計測データがたまると、日別の利用推移が表示されます。</div>;

  return <div className="trend-chart">
    <div className="chart-legend" aria-label="グラフの系列">
      <span><i className="chart-blue" />ページ表示 <b>{number(rows.reduce((sum, row) => sum + Number(row.page_views), 0))}</b></span>
      <span><i className="chart-coral" />日別利用者</span>
      <span><i className="chart-slate" />記事展開 <b>{number(rows.reduce((sum, row) => sum + Number(row.article_opens), 0))}</b></span>
    </div>
    <div className="chart-canvas">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="日別のページ表示、利用者、記事展開の推移">
        {[0, 1, 2, 3, 4].map((step) => {
          const value = Math.round(max - max * step / 4);
          const lineY = top + plotHeight * step / 4;
          return <g key={step}><line x1={left} x2={width - right} y1={lineY} y2={lineY} /><text x={left - 9} y={lineY + 4} textAnchor="end">{number(value)}</text></g>;
        })}
        {rows.map((row, index) => xLabelIndexes.has(index) ? <text className="chart-date" key={row.day} x={x(index)} y={height - 8} textAnchor={index === 0 ? 'start' : index === rows.length - 1 ? 'end' : 'middle'}>{new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric' }).format(new Date(`${row.day}T00:00:00+09:00`))}</text> : null)}
        <polyline className="series-views" points={points('page_views')} />
        <polyline className="series-visitors" points={points('visitors')} />
        <polyline className="series-opens" points={points('article_opens')} />
        {rows.map((row, index) => <rect key={row.day} className="chart-hit" x={Math.max(left, x(index) - plotWidth / Math.max(rows.length, 1) / 2)} y={top} width={Math.max(8, plotWidth / Math.max(rows.length, 1))} height={plotHeight} onMouseEnter={() => setActive(index)} onTouchStart={() => setActive(index)} />)}
        {active !== null && <line className="chart-guide" x1={x(active)} x2={x(active)} y1={top} y2={top + plotHeight} />}
      </svg>
      {selected && <div className="chart-readout" aria-live="polite"><b>{new Intl.DateTimeFormat('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date(`${selected.day}T00:00:00+09:00`))}</b><span>表示 <strong>{number(selected.page_views)}</strong></span><span>利用者 <strong>{number(selected.visitors)}</strong></span><span>記事展開 <strong>{number(selected.article_opens)}</strong></span><span>出典 <strong>{number(selected.source_clicks)}</strong></span></div>}
    </div>
    <div className="daily-scroll" aria-label="日別利用数の一覧">
      {rows.slice(-14).reverse().map((row) => <div key={row.day}><time>{new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric' }).format(new Date(`${row.day}T00:00:00+09:00`))}</time><span>表示 <b>{number(row.page_views)}</b></span><span>利用者 <b>{number(row.visitors)}</b></span><span>記事 <b>{number(row.article_opens)}</b></span></div>)}
    </div>
  </div>;
}

function RankedBars({ rows }: { rows: Array<{ label: string; value: number; detail: string; icon?: IconName }> }) {
  const max = Math.max(...rows.map((row) => row.value), 1);
  return <div className="ranked-bars">{rows.map((row) => <div key={row.label}>
    <span className="rank-label">{row.icon && <Icon name={row.icon} size={17} />}<b>{row.label}</b><small>{row.detail}</small></span>
    <i><b style={{ width: `${row.value / max * 100}%` }} /></i><strong>{number(row.value)}</strong>
  </div>)}</div>;
}

export default function AdminDashboard() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`/api/admin/analytics?days=${days}`).then(async (response) => {
      const payload = await response.json() as AdminData;
      if (!response.ok) throw new Error(payload.error || '管理データを取得できませんでした。');
      return payload;
    }).then((payload) => { if (active) setData(payload); }).catch((error) => {
      if (active) setData({ days, error: error instanceof Error ? error.message : '読み込みに失敗しました。' });
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [days]);

  const metrics = data?.metrics;
  const pageViews = Number(metrics?.page_views ?? 0);
  const articleOpens = Number(metrics?.article_opens ?? 0);
  const sourceClicks = Number(metrics?.source_clicks ?? 0);
  const metricItems: Array<{ icon: IconName; label: string; value: string; note: string }> = [
    { icon: 'users', label: 'ユニーク利用者', value: number(metrics?.visitors), note: comparison(metrics?.visitors, metrics?.previous_visitors) },
    { icon: 'eye', label: 'ページ表示', value: number(metrics?.page_views), note: comparison(metrics?.page_views, metrics?.previous_page_views) },
    { icon: 'article', label: '記事展開率', value: percent(pageViews ? articleOpens / pageViews * 100 : 0), note: `${number(articleOpens)} 回開かれました` },
    { icon: 'external', label: '出典遷移率', value: percent(articleOpens ? sourceClicks / articleOpens * 100 : 0), note: `${number(sourceClicks)} 回、一次情報へ` },
    { icon: 'userPlus', label: '登録ユーザー', value: number(data?.users?.total_users), note: `期間内 +${number(data?.users?.new_users)}` }
  ];

  const sectionRows = useMemo(() => (data?.sections ?? []).map((row) => ({ label: sectionLabels[row.section] || row.section, value: Number(row.views), detail: `${number(row.visitors)} 人` })), [data]);
  const deviceRows = useMemo(() => (data?.devices ?? []).map((row) => ({ label: deviceLabels[row.device_type] || row.device_type, value: Number(row.views), detail: `${number(row.visitors)} 人`, icon: (deviceIcons[row.device_type] ?? 'devices') as IconName })), [data]);
  const referrerRows = useMemo(() => (data?.referrers ?? []).map((row) => ({ label: referrerLabels[row.referrer] || row.referrer, value: Number(row.views), detail: `${number(row.visitors)} 人`, icon: (row.referrer === 'direct' ? 'route' : row.referrer === 'unknown' ? 'messageQuestion' : 'world') as IconName })), [data]);
  const timeRows = useMemo(() => (data?.timeBands ?? []).map((row) => ({ label: row.time_band, value: Number(row.views), detail: `${number(row.visitors)} 人`, icon: 'clock' as IconName })), [data]);
  const failingSources = (data?.sourceHealth ?? []).filter((source) => Number(source.consecutive_failures) > 0);

  return <main id="top" className="admin-main">
    <section className="admin-head">
      <div className="admin-title"><span className="admin-title-icon"><Icon name="chart" size={27} /></span><div><span className="overline">ADMIN / SITE OPERATIONS</span><h1>サイト運用</h1><p>利用、読まれ方、情報収集の状態を、同じ期間で確認します。</p></div></div>
      <div className="range-tabs" role="group" aria-label="集計期間">{[7, 30, 90].map((range) => <button key={range} className={days === range ? 'active' : ''} onClick={() => setDays(range)} aria-pressed={days === range}><Icon name="calendar" size={14} />{range}日</button>)}</div>
    </section>
    {loading && <div className="admin-loading"><Icon name="activity" size={23} />利用状況を集計しています…</div>}
    {!loading && data?.error && <div className="admin-loading is-error"><Icon name="alert" size={23} />{data.error}</div>}
    {!loading && !data?.error && <>
      <div className="admin-freshness"><span><Icon name="calendar" size={15} />直近 {days} 日・日本時間</span><span><Icon name="heartbeat" size={15} />最終イベント {formatDateTime(metrics?.last_event_at)}</span><span><Icon name="lock" size={15} />個人を特定しない集計</span></div>
      <section className="metric-grid" aria-label="主要な利用指標">{metricItems.map((item) => <div key={item.label}><Icon name={item.icon} size={22} /><span>{item.label}</span><strong>{item.value}</strong><small>{item.note}</small></div>)}</section>

      <section className="admin-section chart-panel">
        <div className="panel-head"><div className="panel-title"><Icon name="chartLine" size={25} /><div><span>DAILY USAGE</span><h2>利用の推移</h2></div></div><small>日別・JST / 数値に触れると内訳を表示</small></div>
        <TrendChart rows={data?.trend} />
      </section>

      <section className="admin-section">
        <div className="panel-head"><div className="panel-title"><Icon name="compass" size={25} /><div><span>AUDIENCE</span><h2>どこで、どのように読まれたか</h2></div></div><small>表示回数 / ユニーク利用者</small></div>
        <div className="audience-grid">
          <div><h3><Icon name="layers" size={18} />セクション</h3><RankedBars rows={sectionRows} /></div>
          <div><h3><Icon name="devices" size={18} />デバイス</h3><RankedBars rows={deviceRows} /></div>
          <div><h3><Icon name="route" size={18} />流入元</h3><RankedBars rows={referrerRows} /><p>流入元ドメインは今回から計測します。過去分は「計測開始前・不明」です。</p></div>
          <div><h3><Icon name="clock" size={18} />アクセス時間帯</h3><RankedBars rows={timeRows} /></div>
        </div>
      </section>

      <section className="admin-section popular-section">
        <div className="panel-head"><div className="panel-title"><Icon name="article" size={25} /><div><span>CONTENT ENGAGEMENT</span><h2>よく読まれた記事</h2></div></div><small>展開 + 出典遷移 + 保存の多い順</small></div>
        <div className="admin-table" role="table" aria-label="よく読まれた記事">
          <div className="admin-table-head" role="row"><span>記事</span><span>読者</span><span>展開</span><span>出典</span><span>保存</span></div>
          {(data?.popularArticles ?? []).map((article, index) => <div className="admin-table-row" role="row" key={article.id}><div><i>{String(index + 1).padStart(2, '0')}</i><span><b>{article.title}</b><small>{article.source_name}</small></span></div><span>{number(article.readers)}</span><span>{number(article.opens)}</span><span>{number(article.source_clicks)}</span><span>{number(article.saves)}</span></div>)}
          {!data?.popularArticles?.length && <div className="table-empty"><Icon name="article" size={22} />記事の利用データはまだありません。</div>}
        </div>
      </section>

      <section className="admin-section operations-section">
        <div className="panel-head"><div className="panel-title"><Icon name="database" size={25} /><div><span>COLLECTION & PUBLISHING</span><h2>情報収集と公開</h2></div></div><strong className={failingSources.length ? 'status-warning' : 'status-good'}><i />{failingSources.length ? `現在 ${number(failingSources.length)} 件異常` : '現在は正常'}</strong></div>
        <div className="operations-metrics">
          <div><Icon name="heartbeat" size={20} /><span>期間内の収集成功率</span><b>{percent(Number(data?.ingest?.successRate ?? 0))}</b><small>成功 {number(data?.ingest?.successful_runs)} / 失敗 {number(data?.ingest?.failed_runs)}</small></div>
          <div><Icon name="cloudUpload" size={20} /><span>期間内の新規記事</span><b>{number(data?.ingest?.new_articles)}</b><small>重複を除外</small></div>
          <div><Icon name="article" size={20} /><span>公開中の記事</span><b>{number(data?.inventory?.published_articles)}</b><small>非表示 {number(data?.inventory?.suppressed_articles)} 件</small></div>
          <div><Icon name="databaseSearch" size={20} /><span>公開に寄与した情報源</span><b>{number(data?.inventory?.active_sources)}</b><small>最新追加 {formatDateTime(data?.inventory?.latest_article_at)}</small></div>
        </div>
        <div className="source-status-head"><h3><Icon name={failingSources.length ? 'alert' : 'check'} size={18} />情報源の状態</h3><small>{failingSources.length ? '対応が必要な情報源を先頭に表示' : '連続失敗している情報源はありません'}</small></div>
        <div className="source-health">{(data?.sourceHealth ?? []).map((source) => <div key={source.id}><span className={source.consecutive_failures ? 'health-bad' : 'health-good'} /><b>{source.name}</b><small>{source.consecutive_failures ? `${source.consecutive_failures} 回連続失敗` : `最終成功 ${formatDateTime(source.last_success_at)}`}</small></div>)}</div>
      </section>

      <p className="privacy-note"><Icon name="shieldLock" size={18} /><span><b>プライバシー</b> 操作イベントを匿名集計します。IPアドレス、検索語、完全な参照URL、生体情報、パスキーの内容は保存しません。Do Not Track が有効なブラウザは計測対象外です。</span></p>
    </>}
  </main>;
}
