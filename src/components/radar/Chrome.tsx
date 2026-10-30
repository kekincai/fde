import type { ReactNode } from 'react';

import { priorityMeta, type Channel, type Priority } from '../../data/articles';
import Icon, { type IconName } from './Icon';
import { formatDate, type User } from './model';
import type { RadarView } from './useRadarState';

export function PriorityTag({ priority, label = false }: { priority: Priority; label?: boolean }) {
  return <span className={`ptag ${priority.toLowerCase()}`} title={priorityMeta[priority].description}>
    <i aria-hidden="true" />{priority}{label && <span>{priorityMeta[priority].label}</span>}
  </span>;
}

export function Brand({ onHome, compact = false }: { onHome: () => void; compact?: boolean }) {
  return <button className="brand" type="button" onClick={onHome} aria-label="FDE RADAR 収集情報の一覧へ">
    <span className="brand-mark" aria-hidden="true"><img src="/icon-192.png" alt="" /></span>
    <span className="brand-word"><b>FDE RADAR</b>{!compact && <small>AI導入の一次情報</small>}</span>
  </button>;
}

export function LiveStatus({ lastIngestedAt }: { lastIngestedAt?: string | null }) {
  return <p className="live"><i aria-hidden="true" />最終収集 <time className="mono">{formatDate(lastIngestedAt)}</time></p>;
}

type NavProps = {
  view: RadarView;
  channel: Channel;
  user: User | null;
  savedCount: number;
  onChannel: (channel: Channel) => void;
  onView: (view: RadarView) => void;
};

export function PrimaryNav({ view, channel, user, savedCount, onChannel, onView }: NavProps) {
  const items: Array<{ key: string; icon: IconName; label: string; short?: string; count?: number; active: boolean; onClick: () => void }> = [
    { key: 'signals', icon: 'radar', label: '収集情報', active: view === 'radar' && channel !== 'saved', onClick: () => onChannel('action') },
    { key: 'saved', icon: 'bookmark', label: '保存済み', short: '保存', count: savedCount || undefined, active: view === 'radar' && channel === 'saved', onClick: () => onChannel('saved') },
    { key: 'map', icon: 'map', label: '24の問い', short: '問い', active: view === 'knowledge', onClick: () => onView('knowledge') },
    { key: 'about', icon: 'info', label: 'About', active: view === 'about', onClick: () => onView('about') }
  ];
  if (user?.isAdmin) items.push({ key: 'admin', icon: 'chart', label: '管理', active: view === 'admin', onClick: () => onView('admin') });
  return <nav className="primary-nav" aria-label="メインナビゲーション">{items.map((item) => <button key={item.key} className={`${item.active ? 'active' : ''} nav-${item.key}`} aria-current={item.active ? 'page' : undefined} onClick={item.onClick}>
    <Icon name={item.icon} size={17} /><span className="nav-label">{item.label}</span>{item.short && <span className="nav-short">{item.short}</span>}{item.count !== undefined && <span className="nav-count mono">{item.count}</span>}
  </button>)}</nav>;
}

export function AccountButton({ user, onClick }: { user: User | null; onClick: () => void }) {
  return <button className="account-button" onClick={onClick} aria-label={user ? `${user.displayName}のアカウント` : 'ログイン・新規登録'}>
    {user ? <span className="avatar" aria-hidden="true">{user.displayName.slice(0, 1).toUpperCase()}</span> : <Icon name="user" size={16} />}
    <span className="account-label">{user ? user.displayName : 'ログイン'}</span>
  </button>;
}

export function Sheet({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  return <>
    <button className={`scrim ${open ? 'is-visible' : ''}`} onClick={onClose} aria-label="閉じる" tabIndex={open ? 0 : -1} />
    <div className={`sheet ${open ? 'is-open' : ''}`} role="dialog" aria-modal="true" aria-label={title} aria-hidden={!open} inert={!open ? true : undefined}>
      <header className="sheet-head"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="閉じる"><Icon name="close" size={18} /></button></header>
      <div className="sheet-body">{children}</div>
    </div>
  </>;
}
