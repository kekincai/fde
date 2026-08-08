import { useEffect, useMemo, useState } from 'react';

import { articles, topics, type Article, type Audience, type Region } from '../data/articles';

type IconName = 'arrow' | 'bookmark' | 'clock' | 'external' | 'search' | 'spark' | 'chevron';

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
  if (name === 'arrow') return <svg {...common}><path d="M5 12h13" /><path d="m13 6 6 6-6 6" /></svg>;
  if (name === 'bookmark') return <svg {...common}><path d="M6.5 4.5A1.5 1.5 0 0 1 8 3h8a1.5 1.5 0 0 1 1.5 1.5V21l-5.5-3-5.5 3V4.5Z" /></svg>;
  if (name === 'clock') return <svg {...common}><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3 2" /></svg>;
  if (name === 'external') return <svg {...common}><path d="M14 5h5v5" /><path d="M19 5 11 13" /><path d="M18 13v4.5A1.5 1.5 0 0 1 16.5 19h-9A1.5 1.5 0 0 1 6 17.5v-9A1.5 1.5 0 0 1 7.5 7H12" /></svg>;
  if (name === 'search') return <svg {...common}><circle cx="10.8" cy="10.8" r="6.3" /><path d="m16 16 4 4" /></svg>;
  if (name === 'spark') return <svg {...common}><path d="m12 2 1.25 5.75L19 9l-5.75 1.25L12 16l-1.25-5.75L5 9l5.75-1.25L12 2Z" /><path d="m19 15 .55 2.45L22 18l-2.45.55L19 21l-.55-2.45L16 18l2.45-.55L19 15Z" /></svg>;
  return <svg {...common}><path d="m9 6 6 6-6 6" /></svg>;
}

function formatDate(): string {
  return new Intl.DateTimeFormat('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date('2026-08-09T09:00:00+09:00'));
}

function ArticleRow({ article, selected, saved, audience, onSelect, onSave }: { article: Article; selected: boolean; saved: boolean; audience: Audience; onSelect: () => void; onSave: () => void }) {
  return (
    <article className={`article-row ${selected ? 'is-selected' : ''}`}>
      <button className="article-main" type="button" onClick={onSelect} aria-expanded={selected}>
        <div className="article-meta">
          <span className={`signal-dot ${article.importance === 'high' ? 'is-high' : ''}`} aria-hidden="true" />
          <span>{article.source}</span>
          <span className="meta-separator">/</span>
          <span>{article.time}</span>
          <span className="article-topic">{article.topic}</span>
        </div>
        <h3>{article.title}</h3>
        <p>{article.summary}</p>
        <div className="article-footer">
          <span><Icon name="clock" size={14} /> 読了 {article.readingTime}</span>
          <span className="article-audience-note">{audience === 'company' ? '会社への視点あり' : '暮らしへの視点あり'}</span>
        </div>
      </button>
      <button className={`save-button ${saved ? 'is-saved' : ''}`} type="button" onClick={onSave} aria-label={saved ? '保存を解除' : '記事を保存'} aria-pressed={saved}>
        <Icon name="bookmark" size={19} />
      </button>
      {selected && (
        <div className="article-detail">
          <div>
            <span className="detail-label">なぜ見る？</span>
            <p>{article.whyItMatters}</p>
          </div>
          <div>
            <span className="detail-label">{audience === 'company' ? '会社の参考に' : '自分の参考に'}</span>
            <p>{audience === 'company' ? article.companyView : article.personalView}</p>
          </div>
          <a className="source-link" href={article.url} target="_blank" rel="noreferrer">
            出典を読む <Icon name="external" size={15} />
          </a>
        </div>
      )}
    </article>
  );
}

export default function RadarApp() {
  const [audience, setAudience] = useState<Audience>('company');
  const [region, setRegion] = useState<Region | 'ALL'>('ALL');
  const [topic, setTopic] = useState('すべて');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('router-migration');
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem('fde-radar-saved');
      if (stored) setSavedIds(JSON.parse(stored));
    } catch {
      // Private browsing or a blocked storage API should not block reading.
    }
  }, []);

  const filteredArticles = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return articles.filter((article) => {
      const matchesRegion = region === 'ALL' || article.region === region;
      const matchesTopic = topic === 'すべて' || article.topic === topic;
      const searchable = `${article.title} ${article.source} ${article.summary} ${article.topic}`.toLowerCase();
      return matchesRegion && matchesTopic && (!normalizedQuery || searchable.includes(normalizedQuery));
    });
  }, [query, region, topic]);

  const visibleArticles = showAll ? filteredArticles : filteredArticles.slice(0, 4);
  const audienceCopy = audience === 'company'
    ? { label: '会社の視点', title: '変化を知り、次の判断につなげる。', copy: 'サービス、働き方、採用。テクノロジーの変化が、組織にどう届くのかを整理します。' }
    : { label: '個人の視点', title: '変化を知り、自分の選択に活かす。', copy: '学び方、仕事、毎日のサービス。むずかしい話を、自分ごととして読めるように。' };

  function toggleSaved(id: string) {
    const next = savedIds.includes(id) ? savedIds.filter((savedId) => savedId !== id) : [...savedIds, id];
    setSavedIds(next);
    try { window.localStorage.setItem('fde-radar-saved', JSON.stringify(next)); } catch { /* no-op */ }
  }

  return (
    <div className="site-shell">
      <header className="site-header">
        <a className="brand" href="#top" aria-label="FDE RADAR ホーム"><span className="brand-mark">F</span><span>FDE <em>RADAR</em></span></a>
        <nav className="main-nav" aria-label="メインナビゲーション">
          <a className="active" href="#signals">今日の動き</a>
          <a href="#viewpoint">見方を選ぶ</a>
          <a href="#sources">情報源</a>
        </nav>
        <div className="header-actions">
          <span className="header-date">{formatDate()}</span>
          <a className="header-search" href="#search"><Icon name="search" size={17} /><span>検索</span><kbd>/</kbd></a>
        </div>
      </header>

      <main id="top">
        <section className="hero-section" aria-labelledby="hero-title">
          <div className="hero-copy">
            <div className="section-index">01 / FDE TECHNOLOGY RADAR</div>
            <h1 id="hero-title">変化を知り、<br /><span>判断材料</span>にする。</h1>
            <p className="hero-lead">日本を中心に、Webとデジタルの変化を集めています。専門家だけでなく、会社や個人の「次の一歩」の参考になるように。</p>
            <div className="hero-actions">
              <a className="primary-action" href="#signals">今日のシグナルを見る <Icon name="arrow" size={17} /></a>
              <a className="text-action" href="#viewpoint">このサイトの見方 <Icon name="chevron" size={15} /></a>
            </div>
          </div>
          <div className="hero-brief" aria-label="今日の概要">
            <div className="brief-header"><span>今日の見取り図</span><span>08.09 / SUN</span></div>
            <div className="brief-line"><span className="brief-number">01</span><span>日本の企業・メディア・コミュニティ</span><span className="brief-rule" /></div>
            <div className="brief-line"><span className="brief-number">02</span><span>世界の標準・ブラウザ・サービス</span><span className="brief-rule" /></div>
            <div className="brief-line"><span className="brief-number">03</span><span>会社と個人、それぞれの受け取り方</span><span className="brief-rule" /></div>
            <div className="brief-note"><Icon name="spark" size={18} /><span>ひとつのニュースを、複数の角度から。</span></div>
          </div>
        </section>

        <section className="viewpoint-section" id="viewpoint" aria-labelledby="viewpoint-title">
          <div className="viewpoint-copy">
            <div className="section-index">02 / YOUR VIEWPOINT</div>
            <h2 id="viewpoint-title">{audienceCopy.title}</h2>
            <p>{audienceCopy.copy}</p>
          </div>
          <div className="audience-switch" role="group" aria-label="表示する視点">
            <button type="button" className={audience === 'company' ? 'selected' : ''} onClick={() => setAudience('company')}>会社の視点</button>
            <button type="button" className={audience === 'personal' ? 'selected' : ''} onClick={() => setAudience('personal')}>個人の視点</button>
          </div>
        </section>

        <section className="signals-section" id="signals" aria-labelledby="signals-title">
          <div className="section-heading-row">
            <div>
              <div className="section-index">03 / TODAY'S SIGNALS</div>
              <h2 id="signals-title">今日のシグナル</h2>
            </div>
            <p className="section-aside">専門用語の前に、<br />「なぜ大事か」を。</p>
          </div>
          <div className="control-row" id="search">
            <div className="region-switch" role="group" aria-label="地域で絞り込む">
              <button type="button" className={region === 'ALL' ? 'selected' : ''} onClick={() => setRegion('ALL')}>すべて</button>
              <button type="button" className={region === 'JP' ? 'selected' : ''} onClick={() => setRegion('JP')}>日本優先</button>
              <button type="button" className={region === 'GLOBAL' ? 'selected' : ''} onClick={() => setRegion('GLOBAL')}>世界も見る</button>
            </div>
            <label className="search-field"><Icon name="search" size={17} /><span className="sr-only">記事を検索</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="キーワードで探す" /></label>
          </div>
          <div className="topic-rail" aria-label="テーマで絞り込む">
            {topics.map((item) => <button type="button" key={item} className={topic === item ? 'selected' : ''} onClick={() => setTopic(item)}>{item}</button>)}
          </div>
          <div className="signals-layout">
            <aside className="signals-aside">
              <div className="aside-marker">{audienceCopy.label}</div>
              <p>ニュースを集めるだけでなく、読んだ人が次に考えられるように編集しています。</p>
              <div className="saved-count"><span>保存した記事</span><strong>{savedIds.length.toString().padStart(2, '0')}</strong></div>
            </aside>
            <div className="article-list">
              {visibleArticles.length ? visibleArticles.map((article) => (
                <ArticleRow key={article.id} article={article} audience={audience} selected={selectedId === article.id} saved={savedIds.includes(article.id)} onSelect={() => setSelectedId(selectedId === article.id ? '' : article.id)} onSave={() => toggleSaved(article.id)} />
              )) : <div className="empty-state"><p>該当するシグナルはありません。</p><button type="button" onClick={() => { setQuery(''); setTopic('すべて'); setRegion('ALL'); }}>絞り込みをリセット</button></div>}
              {filteredArticles.length > 4 && <button className="load-more" type="button" onClick={() => setShowAll(!showAll)}>{showAll ? '表示を戻す' : 'すべてのシグナルを見る'} <Icon name="arrow" size={16} /></button>}
            </div>
          </div>
        </section>

        <section className="sources-section" id="sources" aria-labelledby="sources-title">
          <div className="sources-copy"><div className="section-index">04 / SOURCES</div><h2 id="sources-title">どこから来た情報か。</h2><p>日本の企業・メディア・コミュニティと、世界の標準・ブラウザ・上流の発表を、役割の違う情報源として組み合わせています。</p></div>
          <div className="source-list"><div><span>01</span><strong>日本の企業・メディア</strong><small>実際の仕事やサービスへの影響</small></div><div><span>02</span><strong>コミュニティ・イベント</strong><small>人が集まり、知恵が広がる場所</small></div><div><span>03</span><strong>世界の上流情報</strong><small>標準・ブラウザ・基盤の変化</small></div></div>
        </section>
      </main>

      <footer className="site-footer"><div><span className="brand-footer">FDE RADAR</span><span>変化を、判断材料に。</span></div><div><span>日本時間 08:00 更新</span><span>短い要約 + 出典リンク</span></div></footer>
    </div>
  );
}
