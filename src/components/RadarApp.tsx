import { useEffect, useMemo, useState } from 'react';

import { pillarLabels, pillars, type Article, type Audience, type Region } from '../data/articles';

type IconName = 'arrow' | 'bookmark' | 'clock' | 'external' | 'search' | 'refresh' | 'check';

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.65, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
  if (name === 'arrow') return <svg {...common}><path d="M5 12h13" /><path d="m13 6 6 6-6 6" /></svg>;
  if (name === 'bookmark') return <svg {...common}><path d="M6.5 4.5A1.5 1.5 0 0 1 8 3h8a1.5 1.5 0 0 1 1.5 1.5V21l-5.5-3-5.5 3V4.5Z" /></svg>;
  if (name === 'clock') return <svg {...common}><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3 2" /></svg>;
  if (name === 'external') return <svg {...common}><path d="M14 5h5v5" /><path d="M19 5 11 13" /><path d="M18 13v4.5A1.5 1.5 0 0 1 16.5 19h-9A1.5 1.5 0 0 1 6 17.5v-9A1.5 1.5 0 0 1 7.5 7H12" /></svg>;
  if (name === 'search') return <svg {...common}><circle cx="10.8" cy="10.8" r="6.3" /><path d="m16 16 4 4" /></svg>;
  if (name === 'refresh') return <svg {...common}><path d="M20 7v5h-5" /><path d="M4 17v-5h5" /><path d="M6.1 9A7 7 0 0 1 18 6.5L20 9" /><path d="m4 15 1.9 2.5A7 7 0 0 0 18 15" /></svg>;
  return <svg {...common}><path d="m5 12 4 4L19 6" /></svg>;
}

type ApiArticle = {
  id?: string;
  title?: string;
  source_name?: string;
  source_kind?: string;
  summary?: string;
  signal_type?: string;
  pillar?: string;
  subtopic?: string;
  content_type?: string;
  region?: string;
  country_relevance?: string;
  published_at?: string;
  canonical_url?: string;
  location?: string;
  sector?: string;
  fde_score?: number;
  why_it_matters?: string;
  company_impact?: string;
  career_impact?: string;
  summary_ja?: string;
  customer_impact?: string;
  engineering_impact?: string;
};

type SourceStatus = {
  id: string;
  name: string;
  source_kind: string;
  homepage: string;
  last_success_at?: string | null;
  consecutive_failures?: number;
};

type Overview = {
  counts?: { total?: number; japan?: number; careers?: number; papers?: number; videos?: number };
  sources?: SourceStatus[];
  last_ingested_at?: string | null;
};

function formatToday(): string {
  return new Intl.DateTimeFormat('ja-JP', { month: 'long', day: 'numeric', weekday: 'short', timeZone: 'Asia/Tokyo' }).format(new Date());
}

function formatStamp(value?: string | null): string {
  if (!value) return '初回収集中';
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(value) ? `${value.replace(' ', 'T')}Z` : value;
  return new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' }).format(new Date(normalized));
}

function relativeTime(value?: string): string {
  if (!value) return '新着';
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
  const hours = Math.floor(elapsed / 3_600_000);
  if (hours < 1) return `${Math.max(1, Math.floor(elapsed / 60_000))}分前`;
  if (hours < 24) return `${hours}時間前`;
  return `${Math.floor(hours / 24)}日前`;
}

function fromApi(raw: ApiArticle): Article | null {
  if (!raw.id || !raw.title || !raw.canonical_url) return null;
  const region: Region = raw.region === 'Japan' || raw.country_relevance === 'JP' ? 'Japan' : 'Global';
  return {
    id: raw.id,
    title: raw.title,
    source: raw.source_name || '公式情報源',
    sourceKind: raw.source_kind || 'official',
    region,
    pillar: raw.pillar || 'Customer',
    subtopic: raw.subtopic || raw.signal_type || 'Use Case',
    contentType: raw.content_type || 'news',
    location: raw.location || (region === 'Japan' ? '日本' : 'グローバル'),
    sector: raw.sector || '業界横断',
    time: relativeTime(raw.published_at),
    date: raw.published_at ? new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(raw.published_at)) : '公開日不明',
    summary: raw.summary_ja || raw.summary || '公式情報源で公開されたAI導入に関する更新です。',
    whyItMatters: raw.why_it_matters || 'AIを実験から本番へ移す現場の変化を知る一次情報です。',
    customerImpact: raw.customer_impact || raw.company_impact || '自社の導入計画を考えるための参考になります。',
    engineeringImpact: raw.engineering_impact || raw.career_impact || 'FDEに必要な実装・評価・運用条件を知る参考になります。',
    url: raw.canonical_url,
    score: Number(raw.fde_score ?? 4)
  };
}

function kindLabel(kind: string): string {
  if (kind === 'careers') return '採用情報';
  if (kind === 'community') return '現場共有';
  if (kind === 'government') return '公共・制度';
  if (kind === 'media') return '専門メディア';
  if (kind === 'research') return '論文';
  if (kind === 'report') return '調査レポート';
  if (kind === 'video') return '動画';
  if (kind === 'platform') return '製品・基盤';
  return '公式情報';
}

function ArticleRow({ article, audience, open, saved, onOpen, onSave }: {
  article: Article;
  audience: Audience;
  open: boolean;
  saved: boolean;
  onOpen: () => void;
  onSave: () => void;
}) {
  return (
    <article className={`signal-row ${open ? 'is-open' : ''}`}>
      <button className="signal-main" type="button" onClick={onOpen} aria-expanded={open}>
        <div className="signal-meta">
          <span className={`source-kind kind-${article.sourceKind}`}>{kindLabel(article.sourceKind)}</span>
          <span>{article.source}</span><i />
          <span>{article.location}</span><i />
          <span>{article.time}</span>
          <span className="signal-type">{pillarLabels[article.pillar] ?? article.pillar} / {article.subtopic}</span>
        </div>
        <h3>{article.title}</h3>
        <p>{article.summary}</p>
        <div className="signal-foot"><span>{article.contentType} · {article.sector}</span><span>FDE関連度 {article.score.toFixed(0)}/100</span></div>
      </button>
      <button className={`save-button ${saved ? 'is-saved' : ''}`} type="button" onClick={onSave} aria-label={saved ? '保存を解除' : '保存する'} aria-pressed={saved}><Icon name="bookmark" /></button>
      {open && (
        <div className="signal-detail">
          <div><b>なぜ重要か</b><p>{article.whyItMatters}</p></div>
          <div><b>{audience === 'business' ? '顧客・事業への影響' : 'エンジニアリングへの影響'}</b><p>{audience === 'business' ? article.customerImpact : article.engineeringImpact}</p></div>
          <a href={article.url} target="_blank" rel="noreferrer">出典を読む <Icon name="external" size={15} /></a>
        </div>
      )}
    </article>
  );
}

export default function RadarApp() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [overview, setOverview] = useState<Overview>({});
  const [audience, setAudience] = useState<Audience>('business');
  const [region, setRegion] = useState<Region | 'ALL'>('ALL');
  const [pillar, setPillar] = useState('すべて');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch('/api/articles?limit=50').then(async (response) => {
        if (!response.ok) throw new Error('シグナルを取得できませんでした');
        return response.json() as Promise<{ articles?: ApiArticle[] }>;
      }),
      fetch('/api/overview').then((response) => response.ok ? response.json() as Promise<Overview> : ({}))
    ]).then(([payload, nextOverview]) => {
      if (cancelled) return;
      const next = (payload.articles ?? []).map(fromApi).filter((item): item is Article => Boolean(item));
      setArticles(next);
      setOverview(nextOverview);
      setSelectedId(next[0]?.id ?? '');
    }).catch((reason) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : '読み込みに失敗しました');
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('ai-fde-radar-saved');
      if (stored) setSavedIds(JSON.parse(stored));
    } catch { /* storage is optional */ }
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return articles.filter((article) => {
      const regionMatch = region === 'ALL' || article.region === region;
      const typeMatch = pillar === 'すべて' || article.pillar === pillar;
      const text = `${article.title} ${article.summary} ${article.source} ${article.location} ${article.sector} ${article.pillar} ${article.subtopic}`.toLowerCase();
      return regionMatch && typeMatch && (!needle || text.includes(needle));
    });
  }, [articles, query, region, pillar]);

  const audienceCopy = audience === 'business'
    ? { label: '企業で導入する', title: 'PoCで終わらせず、業務で使われるところまで。', body: '導入事例、評価、安全、運用をつなげて、次の意思決定に使える形で読み解きます。' }
    : { label: 'FDEを知る・目指す', title: 'コードだけではない、AIを現場に届ける仕事。', body: '募集職種と現場事例から、顧客理解・実装・評価・定着までの役割を具体的に見ます。' };

  function toggleSaved(id: string) {
    const next = savedIds.includes(id) ? savedIds.filter((item) => item !== id) : [...savedIds, id];
    setSavedIds(next);
    try { localStorage.setItem('ai-fde-radar-saved', JSON.stringify(next)); } catch { /* optional */ }
  }

  return (
    <div className="site-shell">
      <header className="site-header">
        <a className="brand" href="#top"><img className="brand-mark" src="/icon-192.png" alt="" /><span>AI FDE <em>RADAR</em></span></a>
        <nav aria-label="メインナビゲーション"><a href="#about">FDEとは</a><a href="#signals">シグナル</a><a href="#sources">情報源</a></nav>
        <div className="header-status"><span className="live-dot" />自動収集中 <b>{formatToday()}</b></div>
      </header>

      <main id="top">
        <section className="hero">
          <div className="hero-copy">
            <span className="eyebrow">AI FORWARD DEPLOYED ENGINEERING</span>
            <h1>AIを、<br /><em>現場の成果</em>まで<br />届ける人たち。</h1>
            <p>世界と日本の公式情報から、AI FDEの採用、導入、本番運用、評価、安全の動きを定期収集する日本語リファレンスです。</p>
            <div className="hero-actions"><a className="primary-action" href="#signals">最新シグナルを見る <Icon name="arrow" /></a><a href="#about">まずFDEを知る</a></div>
          </div>
          <div className="radar-panel" aria-label="FDEの仕事の循環と収集状況">
            <div className="field-map">
              <div className="field-map-head"><span>LIVE FIELD LOOP</span><b>JP / GLOBAL</b></div>
              <img src="/ai-fde-mark-512.png" alt="顧客課題から現場への導入、知見の還元までを表すAI FDEアイコン" />
              <span className="map-label map-customer">CUSTOMER</span>
              <span className="map-label map-build">BUILD</span>
              <span className="map-label map-deploy">DEPLOY</span>
              <span className="map-label map-govern">GOVERN</span>
              <div className="field-map-note"><b>技術能力</b><span>現場の成果</span></div>
            </div>
            <div className="radar-stats">
              <div><strong>{overview.counts?.total ?? articles.length}</strong><span>公開シグナル</span></div>
              <div><strong>{overview.counts?.japan ?? articles.filter((item) => item.region === 'Japan').length}</strong><span>日本関連</span></div>
              <div><strong>{overview.sources?.length ?? 35}</strong><span>監視ソース</span></div>
            </div>
            <p><Icon name="refresh" size={15} /> 最終収集 {formatStamp(overview.last_ingested_at)}</p>
          </div>
        </section>

        <section className="definition" id="about">
          <div><span className="section-no">01</span><span className="eyebrow">WHAT IS AN AI FDE?</span></div>
          <div className="definition-copy"><h2>技術を渡して終わらない。<br />顧客と一緒に、使われる仕組みをつくる。</h2><p>AI FDEは、顧客の課題を見つけ、データと業務を理解し、AIシステムを実装・評価して、本番導入と定着まで責任を持つ役割です。</p></div>
          <ol className="delivery-flow"><li><b>01</b><span>顧客課題</span><small>CUSTOMER</small></li><li><b>02</b><span>構築</span><small>BUILD</small></li><li><b>03</b><span>本番導入</span><small>DEPLOY</small></li><li><b>04</b><span>安全・評価</span><small>GOVERN</small></li><li><b>05</b><span>定着・成果</span><small>ADOPTION</small></li><li><b>06</b><span>現場から還元</span><small>FIELD FEEDBACK</small></li></ol>
        </section>

        <section className="viewpoint">
          <div><span className="section-no">02</span><span className="eyebrow">CHOOSE A VIEWPOINT</span><h2>{audienceCopy.title}</h2><p>{audienceCopy.body}</p></div>
          <div className="audience-switch" role="group" aria-label="読み方を選ぶ"><button className={audience === 'business' ? 'selected' : ''} onClick={() => setAudience('business')}>企業で導入する</button><button className={audience === 'career' ? 'selected' : ''} onClick={() => setAudience('career')}>FDEを知る・目指す</button></div>
        </section>

        <section className="signals" id="signals">
          <div className="section-head"><div><span className="section-no">03</span><span className="eyebrow">FIELD SIGNALS</span><h2>現場のシグナル</h2></div><p>公式情報と日本の現場共有だけを、<br />FDE関連度で選別しています。</p></div>
          <div className="filters">
            <div className="region-switch"><button className={region === 'ALL' ? 'selected' : ''} onClick={() => setRegion('ALL')}>すべて</button><button className={region === 'Japan' ? 'selected' : ''} onClick={() => setRegion('Japan')}>日本</button><button className={region === 'Global' ? 'selected' : ''} onClick={() => setRegion('Global')}>世界</button></div>
            <label className="search-field"><Icon name="search" size={17} /><span className="sr-only">検索</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="企業・地域・テーマで検索" /></label>
          </div>
          <div className="type-switch">{pillars.map((item) => <button key={item} className={pillar === item ? 'selected' : ''} onClick={() => setPillar(item)}>{pillarLabels[item]}</button>)}</div>
          <div className="signal-layout">
            <aside><span>{audienceCopy.label}</span><p>記事を開くと、この視点に合わせた読みどころを確認できます。</p><div><small>保存済み</small><strong>{String(savedIds.length).padStart(2, '0')}</strong></div></aside>
            <div className="signal-list">
              {loading && <div className="state"><Icon name="refresh" /> 公式ソースからシグナルを読み込んでいます。</div>}
              {!loading && error && <div className="state is-error"><b>現在データを取得できません。</b><span>{error}</span></div>}
              {!loading && !error && filtered.length === 0 && <div className="state"><b>条件に合うシグナルはまだありません。</b><span>定期収集後に自動で追加されます。条件を変えて確認してください。</span><button onClick={() => { setQuery(''); setRegion('ALL'); setPillar('すべて'); }}>絞り込みを解除</button></div>}
              {(showAll ? filtered : filtered.slice(0, 6)).map((article) => <ArticleRow key={article.id} article={article} audience={audience} open={selectedId === article.id} saved={savedIds.includes(article.id)} onOpen={() => setSelectedId(selectedId === article.id ? '' : article.id)} onSave={() => toggleSaved(article.id)} />)}
              {filtered.length > 6 && <button className="more-button" onClick={() => setShowAll(!showAll)}>{showAll ? '表示を戻す' : `残り${filtered.length - 6}件を見る`} <Icon name="arrow" size={16} /></button>}
            </div>
          </div>
        </section>

        <section className="sources" id="sources">
          <div className="sources-intro"><span className="section-no">04</span><span className="eyebrow">SOURCE POLICY</span><h2>仕事の閉ループを、情報源でつなぐ。</h2><p>顧客課題、構築、本番導入、安全・評価、組織、現場フィードバックを別々に追います。全文転載はせず、短い要約と出典リンクだけを掲載します。</p></div>
          <div className="source-groups">
            <div><span>01 / PRIMARY</span><h3>AI企業の公式情報</h3><p>OpenAI、Anthropic、Google、Microsoft、AWS、Cloudflare、Palantir</p></div>
            <div><span>02 / JAPAN</span><h3>日本の制度と企業現場</h3><p>デジタル庁、IPA、専門メディア、企業技術ブログ、求人・コミュニティ</p></div>
            <div><span>03 / RESEARCH</span><h3>実装に近い研究</h3><p>Agent、RAG、評価、セキュリティ、信頼性に限定した arXiv</p></div>
            <div><span>04 / REPORTS</span><h3>組織・ROI・市場</h3><p>AI Indexと企業導入レポート。「なぜFDEが見るか」を付加</p></div>
            <div><span>05 / VIDEO</span><h3>公式動画チャンネル</h3><p>記事になる前の発表、事例、カンファレンスセッションを収集</p></div>
          </div>
          <div className="source-health">{(overview.sources ?? []).map((source) => <a key={source.id} href={source.homepage} target="_blank" rel="noreferrer"><span className={source.consecutive_failures ? 'health-bad' : 'health-ok'}><Icon name="check" size={13} /></span><b>{source.name}</b><small>{source.last_success_at ? `${formatStamp(source.last_success_at)} 確認` : '収集待ち'}</small></a>)}</div>
        </section>
      </main>

      <footer><div><img src="/icon-192.png" alt="" /><b>AI FDE RADAR</b><span>AIを、現場の成果まで。</span></div><div><span>6時間ごとに自動収集</span><a href="https://github.com/kekincai/fde" target="_blank" rel="noreferrer">公開コード <Icon name="external" size={13} /></a></div></footer>
    </div>
  );
}
