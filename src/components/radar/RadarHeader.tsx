import type { Channel } from '../../data/articles';
import Icon from './Icon';
import type { User } from './model';

export type RadarView = 'radar' | 'knowledge' | 'admin';

type Props = {
  view: RadarView;
  channel: Channel;
  japanOnly: boolean;
  query: string;
  user: User | null;
  onHome: () => void;
  onAbout: () => void;
  onKnowledge: () => void;
  onChannel: (channel: Channel, japanOnly?: boolean) => void;
  onAdmin: () => void;
  onQuery: (query: string) => void;
  onMobileSearch: () => void;
  onAccount: () => void;
};

export default function RadarHeader({ view, channel, japanOnly, query, user, onHome, onAbout, onKnowledge, onChannel, onAdmin, onQuery, onMobileSearch, onAccount }: Props) {
  return <>
    <header className="topbar">
      <button className="brand" type="button" onClick={onHome} aria-label="最初の画面へ戻る"><img src="/icon-192.png" alt="" /><span>FDE <b>RADAR</b></span></button>
      <nav aria-label="メインナビゲーション">
        <button className="desktop-secondary" onClick={onAbout}>FDEとは</button>
        <button className={view === 'radar' && channel === 'action' && !japanOnly ? 'active' : ''} onClick={() => onChannel('action')}>アクション</button>
        <button className={view === 'radar' && channel === 'action' && japanOnly ? 'active' : ''} onClick={() => onChannel('action', true)}>日本</button>
        <button className={`desktop-secondary ${view === 'radar' && channel === 'research' ? 'active' : ''}`} onClick={() => onChannel('research')}>リサーチ</button>
        <button className={view === 'radar' && channel === 'saved' ? 'active' : ''} onClick={() => onChannel('saved')}>保存済み</button>
        <button className="mobile-only" onClick={onMobileSearch}>検索</button>
        <button className={`desktop-secondary ${view === 'knowledge' ? 'active' : ''}`} onClick={onKnowledge}>ナレッジマップ</button>
        {user?.isAdmin && <button className={`desktop-admin ${view === 'admin' ? 'active' : ''}`} onClick={onAdmin}>管理</button>}
      </nav>
      {view === 'radar' && <label className="header-search"><Icon name="search" size={17} /><input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="企業・技術・課題を検索" /></label>}
      <button className="account-button" onClick={onAccount}><Icon name="user" size={18} /><span>{user ? user.displayName : 'ログイン'}</span></button>
    </header>
  </>;
}
