import { useEffect, useRef, useState } from 'react';
import { startAuthentication, startRegistration } from '@simplewebauthn/browser';

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

  // A modal dialog: focus moves in on open, Tab stays inside, and focus returns on close.
  // The page behind is made inert by RadarApp.
  const drawerRef = useRef<HTMLElement>(null);
  // The parent passes a new onClose each render; read it through a ref so the dialog does not re-initialise.
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });
  useEffect(() => {
    if (!open) return;
    const returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusables = () => [...(drawerRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])') ?? [])];
    // The close button is first in the DOM; start on the dialog's main action instead.
    (focusables()[1] ?? focusables()[0])?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { onCloseRef.current(); return; }
      if (event.key !== 'Tab') return;
      const items = focusables();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const inside = drawerRef.current?.contains(document.activeElement);
      if (event.shiftKey && (document.activeElement === first || !inside)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !inside)) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      returnTo?.focus({ preventScroll: true });
    };
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
    setMessage('');
    try {
      const response = await fetch('/api/auth/sessions');
      if (response.status === 401) { onLogout(); return; }
      if (!response.ok) throw new Error(String(response.status));
      const payload = await response.json() as { sessions?: Session[] };
      setSessions(payload.sessions ?? []);
      setShowSessions(true);
    } catch {
      setMessage('セッション一覧を読み込めませんでした。');
    }
  }

  async function revoke(id: string) {
    setMessage('');
    try {
      const response = await fetch(`/api/auth/sessions/${id}`, { method: 'DELETE' });
      if (response.status === 401) { onLogout(); return; }
      if (!response.ok && response.status !== 404) throw new Error(String(response.status));
      const target = sessions.find((item) => item.id === id);
      if (target?.is_current) onLogout();
      else setSessions((items) => items.filter((item) => item.id !== id));
    } catch {
      setMessage('セッションを終了できませんでした。');
    }
  }

  async function logout() {
    // The local state is cleared even if the request fails; the server session then expires on its own.
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    onLogout();
  }

  return <>
    <button type="button" className={`au-scrim ${open ? 'is-visible' : ''}`} onClick={onClose} aria-label="閉じる" tabIndex={open ? 0 : -1} />
    <aside ref={drawerRef} className={`au-drawer ${open ? 'is-open' : ''}`} role="dialog" aria-modal="true" aria-labelledby="au-title" aria-hidden={!open} inert={!open ? true : undefined}>
      <header className="au-head">
        <h2 id="au-title">{user ? 'アカウント' : 'ＦＤＥレーダーに参加'}</h2>
        <button type="button" className="au-close" onClick={onClose}>閉じる</button>
      </header>
      {user ? <div className="au-body">
        <dl className="au-facts">
          <div><dt>表示名</dt><dd>{user.displayName}</dd></div>
          <div><dt>保護</dt><dd>パスキー</dd></div>
          <div><dt>保存した記事</dt><dd>{bookmarkCount.toLocaleString('ja-JP')}件</dd></div>
        </dl>
        <div className="au-actions">
          {user.isAdmin && <button type="button" className="btn btn-wide" onClick={onAdmin}>管理画面を開く</button>}
          <button type="button" className="btn btn-wide" onClick={loadSessions} aria-expanded={showSessions}>ログイン中の端末・セッションを管理</button>
        </div>
        {message && <p className="au-error" role="alert">{message}</p>}
        {showSessions && <section className="au-sessions" aria-labelledby="au-sessions-title">
          <h3 id="au-sessions-title" className="kuro-head">ログイン中のセッション</h3>
          <ul>{sessions.map((session) => <li key={session.id}>
            <div><b>{session.is_current ? 'この端末' : '別の端末'}</b><span>{session.user_agent || 'ブラウザ'} · {formatDate(session.last_seen_at)}</span></div>
            <button type="button" className="btn" onClick={() => revoke(session.id)}>終了</button>
          </li>)}</ul>
        </section>}
        <button type="button" className="btn btn-kuro btn-wide au-logout" onClick={logout}>ログアウト</button>
      </div> : <div className="au-body">
        <p className="au-intro">メールアドレスもパスワードも不要です。端末の Face ID、Touch ID、Windows Hello などで、保存リストを安全に利用できます。</p>
        <div className="au-tabs" role="group" aria-label="ログインまたは新規登録">
          <button type="button" aria-pressed={mode === 'login'} onClick={() => setMode('login')}>ログイン</button>
          <button type="button" aria-pressed={mode === 'register'} onClick={() => setMode('register')}>新規登録</button>
        </div>
        <form className="au-form" onSubmit={submit}>
          {mode === 'register' && <label className="au-label"><span>表示名</span><input className="field" required maxLength={40} value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="表示名" /></label>}
          {message && <p className="au-error" role="alert">{message}</p>}
          <button className="btn btn-kuro btn-wide" disabled={busy}>{busy ? '端末で確認中…' : mode === 'login' ? 'パスキーでログイン' : 'パスキーを作成'}</button>
        </form>
        <p className="au-note">生体情報は端末の外へ送信されません。ＦＤＥレーダーは公開鍵だけを保存します。同期型パスキーなら別の端末でも利用できます。</p>
      </div>}
    </aside>
  </>;
}
