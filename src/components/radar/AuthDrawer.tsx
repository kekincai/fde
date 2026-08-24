import { useEffect, useState } from 'react';
import { startAuthentication, startRegistration } from '@simplewebauthn/browser';

import Icon from './Icon';
import { formatDate, type Session, type User } from './model';

type Props = {
  open: boolean;
  user: User | null;
  bookmarkCount: number;
  onClose: () => void;
  onAuthenticated: (user: User, bookmarkIds: string[]) => void;
  onLogout: () => void;
  onAdmin: () => void;
};

export default function AuthDrawer({ open, user, bookmarkCount, onClose, onAuthenticated, onLogout, onAdmin }: Props) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [displayName, setDisplayName] = useState('');
  const [message, setMessage] = useState('');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [showSessions, setShowSessions] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setMessage('');
      setShowSessions(false);
    }
  }, [open]);

  async function submit(event: { preventDefault(): void }) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const optionsResponse = await fetch(`/api/auth/passkey/${mode}/options`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName })
      });
      const setup = await optionsResponse.json() as {
        flowId?: string;
        options?: Parameters<typeof startRegistration>[0]['optionsJSON'];
        error?: string;
      };
      if (!optionsResponse.ok || !setup.flowId || !setup.options) throw new Error(setup.error || 'パスキーを準備できませんでした。');
      const credential = mode === 'register'
        ? await startRegistration({ optionsJSON: setup.options })
        : await startAuthentication({ optionsJSON: setup.options as Parameters<typeof startAuthentication>[0]['optionsJSON'] });
      const verifyResponse = await fetch(`/api/auth/passkey/${mode}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flowId: setup.flowId, response: credential })
      });
      const payload = await verifyResponse.json() as { user?: User; bookmarkIds?: string[]; error?: string };
      if (!verifyResponse.ok || !payload.user) throw new Error(payload.error || 'パスキーを確認できませんでした。');
      onAuthenticated(payload.user, payload.bookmarkIds ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '処理に失敗しました。');
    } finally {
      setBusy(false);
    }
  }

  async function loadSessions() {
    const response = await fetch('/api/auth/sessions');
    const payload = await response.json() as { sessions?: Session[] };
    setSessions(payload.sessions ?? []);
    setShowSessions(true);
  }

  async function revoke(id: string) {
    await fetch(`/api/auth/sessions/${id}`, { method: 'DELETE' });
    const target = sessions.find((item) => item.id === id);
    if (target?.is_current) onLogout();
    else setSessions((items) => items.filter((item) => item.id !== id));
  }

  return <>
    <button className={`drawer-scrim ${open ? 'is-visible' : ''}`} onClick={onClose} aria-label="閉じる" tabIndex={open ? 0 : -1} />
    <aside className={`account-drawer ${open ? 'is-open' : ''}`} aria-hidden={!open} inert={!open ? true : undefined}>
      <div className="drawer-head">
        <div className="drawer-title"><Icon name={user ? 'user' : 'key'} size={28} /><div><span>ACCOUNT</span><h2>{user ? 'アカウント' : 'FDE Radar に参加'}</h2></div></div>
        <button onClick={onClose} aria-label="閉じる"><Icon name="close" /></button>
      </div>
      {user ? <div className="account-body">
        <div className="profile-card"><div className="avatar">{user.displayName.slice(0, 1).toUpperCase()}</div><div><b>{user.displayName}</b><span>パスキーで保護されています</span></div></div>
        <div className="account-stat"><span><Icon name="bookmark" size={18} />保存した記事</span><strong>{String(bookmarkCount).padStart(2, '0')}</strong></div>
        {user.isAdmin && <button className="drawer-action admin-drawer-link" onClick={onAdmin}><Icon name="chart" />管理画面を開く<Icon name="chevron" /></button>}
        <button className="drawer-action" onClick={loadSessions}><Icon name="devices" />ログイン中の端末・セッションを管理<Icon name="chevron" /></button>
        {showSessions && <div className="session-list"><h3>ログイン中のセッション</h3>{sessions.map((session) => <div key={session.id}><div><b>{session.is_current ? 'この端末' : '別の端末'}</b><span>{session.user_agent || 'ブラウザ'} · {formatDate(session.last_seen_at)}</span></div><button onClick={() => revoke(session.id)}>終了</button></div>)}</div>}
        <button className="logout-button" onClick={async () => { await fetch('/api/auth/logout', { method: 'POST' }); onLogout(); }}><Icon name="logout" />ログアウト</button>
      </div> : <div className="auth-body">
        <div className="auth-intro"><Icon name="shield" size={26} /><p>メールアドレスもパスワードも不要です。端末の Face ID、Touch ID、Windows Hello などで安全に保存リストを利用できます。</p></div>
        <div className="auth-tabs"><button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}><Icon name="key" size={17} />ログイン</button><button className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}><Icon name="userPlus" size={17} />新規登録</button></div>
        <form onSubmit={submit}>{mode === 'register' && <label><span><Icon name="user" size={15} />表示名</span><input required maxLength={40} value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="表示名" /></label>}{message && <div className="form-error">{message}</div>}<button className="auth-submit" disabled={busy}><Icon name="key" size={18} />{busy ? '端末で確認中…' : mode === 'login' ? 'パスキーでログイン' : 'パスキーを作成'}</button></form>
        <small><Icon name="lock" size={16} />生体情報は端末の外へ送信されません。FDE Radar は公開鍵だけを保存します。同期型パスキーなら別の端末でも利用できます。</small>
      </div>}
    </aside>
  </>;
}
