import type { Channel } from '../../data/articles';
import Icon from './Icon';
import type { User } from './model';

export type RadarView = 'about' | 'radar' | 'knowledge' | 'admin';

type Props = {
  view: RadarView;
  channel: Channel;
  query: string;
  user: User | null;
  onHome: () => void;
  onAbout: () => void;
  onKnowledge: () => void;
  onChannel: (channel: Channel) => void;
  onAdmin: () => void;
  onQuery: (query: string) => void;
  onMobileSearch: () => void;
  onAccount: () => void;
};

export default function RadarHeader({ view, channel, query, user, onHome, onAbout, onKnowledge, onChannel, onAdmin, onQuery, onMobileSearch, onAccount }: Props) {
  return <>
    <header className="topbar">
      <button className="brand" type="button" onClick={onHome} aria-label="最初の画面へ戻る"><img src="/icon-192.png" alt="" /><span>FDE <b>RADAR</b></span></button>
      <nav aria-label="メインナビゲーション">
        <button className={view === 'about' ? 'active' : ''} onClick={onAbout}>FDEとは</button>
        <button className={view === 'knowledge' ? 'active' : ''} onClick={onKnowledge}><span className="desktop-label">ナレッジマップ</span><span className="mobile-label">知識マップ</span></button>
        <button className={view === 'radar' && channel !== 'saved' ? 'active' : ''} onClick={() => onChannel('action')}>収集情報</button>
        <button className={view === 'radar' && channel === 'saved' ? 'active' : ''} onClick={() => onChannel('saved')}>保存済み</button>
        {user?.isAdmin && <button className={`desktop-admin ${view === 'admin' ? 'active' : ''}`} onClick={onAdmin}>管理</button>}
      </nav>
      {view === 'radar' && <label className="header-search"><Icon name="search" size={17} /><input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="企業・技術・課題を検索" /></label>}
      {view === 'radar' && <button className="mobile-search-button" onClick={onMobileSearch} aria-label="検索を開く"><Icon name="search" size={18} /></button>}
      <button className="account-button" onClick={onAccount}><Icon name="user" size={18} /><span>{user ? user.displayName : 'ログイン'}</span></button>
    </header>
  </>;
}
