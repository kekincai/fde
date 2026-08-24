import { useEffect, useMemo, useState } from 'react';
import Icon, { type IconName } from './radar/Icon';

type MetricRow = {
  page_views?: number; article_opens?: number; source_clicks?: number; bookmark_saves?: number; visitors?: number;
};
type AdminData = {
  days: number;
  metrics?: MetricRow;
  users?: { total_users?: number; new_users?: number };
  trend?: Array<{ day: string; page_views: number; article_opens: number; bookmark_saves: number }>;
  popularArticles?: Array<{ id: string; title: string; source_name: string; opens: number; source_clicks: number; saves: number }>;
  sections?: Array<{ section: string; views: number }>;
  devices?: Array<{ device_type: string; views: number }>;
  ingest?: { runs?: number; successful_runs?: number; failed_runs?: number; new_articles?: number; successRate?: number };
  sourceHealth?: Array<{ name: string; last_success_at?: string; consecutive_failures: number }>;
  error?: string;
};

const sectionLabels: Record<string, string> = { about: 'FDEとは', action: '収集情報', japan: '日本', research: 'リサーチ', saved: '保存済み', admin: '管理' };
const deviceLabels: Record<string, string> = { desktop: 'デスクトップ', tablet: 'タブレット', mobile: 'モバイル' };
const deviceIcons: Record<string, IconName> = { desktop: 'desktop', tablet: 'tablet', mobile: 'mobile' };
const number = (value?: number) => new Intl.NumberFormat('ja-JP').format(Number(value ?? 0));

function TrendChart({ rows = [] }: { rows?: AdminData['trend'] }) {
  const values = rows.map((row) => Number(row.page_views ?? 0));
  const max = Math.max(...values, 1);
  const points = values.map((value, index) => `${24 + index * (652 / Math.max(values.length - 1, 1))},${150 - value / max * 112}`).join(' ');
  return <div className="trend-chart">
    <div className="chart-legend"><span><i className="chart-blue" />ページ表示</span><span><i className="chart-coral" />記事を開く</span></div>
    {rows.length ? <svg viewBox="0 0 700 176" role="img" aria-label="日別ページ表示の推移">
      {[38, 66, 94, 122, 150].map((y) => <line key={y} x1="20" x2="680" y1={y} y2={y} />)}
      <polyline points={points} />
      {values.map((value, index) => <circle key={rows[index].day} cx={24 + index * (652 / Math.max(values.length - 1, 1))} cy={150 - value / max * 112} r="3" />)}
    </svg> : <div className="chart-empty">計測データがたまると、ここに日別の利用推移が表示されます。</div>}
  </div>;
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
    }).then((payload) => { if (active) setData(payload); }).catch((error) => { if (active) setData({ days, error: error instanceof Error ? error.message : '読み込みに失敗しました。' }); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [days]);
  const totalDeviceViews = useMemo(() => (data?.devices ?? []).reduce((sum, row) => sum + Number(row.views), 0), [data]);
  const metrics = data?.metrics;
  const metricItems: Array<{ icon: IconName; label: string; value: string; note: string }> = [
    { icon: 'eye', label: 'ページ表示', value: number(metrics?.page_views), note: '計測した閲覧' },
    { icon: 'article', label: '記事を開いた回数', value: number(metrics?.article_opens), note: '詳しい判断を確認' },
    { icon: 'pointer', label: '出典クリック', value: number(metrics?.source_clicks), note: '一次情報へ移動' },
    { icon: 'bookmark', label: '保存された回数', value: number(metrics?.bookmark_saves), note: '判断材料として保存' },
    { icon: 'users', label: '登録ユーザー', value: number(data?.users?.total_users), note: `期間内 +${number(data?.users?.new_users)}` },
    { icon: 'database', label: '収集成功率', value: `${Number(data?.ingest?.successRate ?? 100).toFixed(1)}%`, note: `${number(data?.ingest?.runs)} 回の収集` }
  ];
  return <main id="top" className="admin-main">
    <section className="admin-head"><div className="admin-title"><Icon name="chart" size={38} /><div><span className="overline">ADMIN / PRODUCT HEALTH</span><h1>管理ダッシュボード</h1><p>FDE Radar が読まれ、判断と行動につながっているかを確認します。</p></div></div><div className="range-tabs">{[7, 30, 90].map((range) => <button key={range} className={days === range ? 'active' : ''} onClick={() => setDays(range)}><Icon name="calendar" size={14} />{range}日</button>)}</div></section>
    {loading && <div className="admin-loading">利用状況を集計しています…</div>}
    {!loading && data?.error && <div className="admin-loading is-error">{data.error}</div>}
    {!loading && !data?.error && <>
      <section className="metric-grid">
        {metricItems.map((item) => <div key={item.label}><Icon name={item.icon} size={22} /><span>{item.label}</span><strong>{item.value}</strong><small>{item.note}</small></div>)}
      </section>
      <section className="admin-panel chart-panel"><div className="panel-head"><div className="panel-title"><Icon name="chartBar" size={25} /><div><span>USAGE TREND</span><h2>利用の推移</h2></div></div><small>計測開始後の集計</small></div><TrendChart rows={data?.trend} /></section>
      <section className="admin-panel"><div className="panel-head"><div className="panel-title"><Icon name="article" size={25} /><div><span>POPULAR SIGNALS</span><h2>よく使われた記事</h2></div></div></div>
        <div className="admin-table"><div className="admin-table-head"><span>記事</span><span>展開</span><span>出典</span><span>保存</span></div>
          {(data?.popularArticles ?? []).map((article) => <div className="admin-table-row" key={article.id}><div><b>{article.title}</b><small>{article.source_name}</small></div><span>{number(article.opens)}</span><span>{number(article.source_clicks)}</span><span>{number(article.saves)}</span></div>)}
          {!data?.popularArticles?.length && <div className="table-empty">記事の利用データはまだありません。</div>}
        </div>
      </section>
      <section className="admin-split">
        <div className="admin-panel"><div className="panel-head"><div className="panel-title"><Icon name="layers" size={25} /><div><span>SECTIONS</span><h2>セクション別</h2></div></div></div><div className="bar-list">{(data?.sections ?? []).map((row) => <div key={row.section}><span>{sectionLabels[row.section] || row.section}</span><i><b style={{ width: `${Math.max(4, Number(row.views) / Math.max(...(data?.sections ?? []).map((item) => Number(item.views)), 1) * 100)}%` }} /></i><strong>{number(row.views)}</strong></div>)}{!data?.sections?.length && <small>計測データはまだありません。</small>}</div></div>
        <div className="admin-panel"><div className="panel-head"><div className="panel-title"><Icon name="devices" size={25} /><div><span>DEVICES</span><h2>デバイス</h2></div></div></div><div className="device-list">{(data?.devices ?? []).map((row) => <div key={row.device_type}><Icon name={deviceIcons[row.device_type] ?? 'devices'} size={21} /><span>{deviceLabels[row.device_type] || row.device_type}</span><strong>{totalDeviceViews ? Math.round(Number(row.views) / totalDeviceViews * 100) : 0}%</strong><small>{number(row.views)} 表示</small></div>)}{!data?.devices?.length && <small>計測データはまだありません。</small>}</div></div>
      </section>
      <section className="admin-panel ingest-panel"><div className="panel-head"><div className="panel-title"><Icon name="database" size={25} /><div><span>INGEST HEALTH</span><h2>情報収集の状態</h2></div></div><strong>{number(data?.ingest?.new_articles)} 件追加</strong></div><div className="source-health">{(data?.sourceHealth ?? []).map((source) => <div key={source.name}><span className={source.consecutive_failures ? 'health-bad' : 'health-good'} /> <b>{source.name}</b><small>{source.consecutive_failures ? `${source.consecutive_failures} 回連続失敗` : '正常'}</small></div>)}</div></section>
      <p className="privacy-note"><Icon name="lock" size={17} />プライバシー: 集計には製品内の操作イベントだけを使用します。IPアドレス、検索語、生体情報、パスキーの内容は保存しません。</p>
    </>}
  </main>;
}
