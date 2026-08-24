type NotificationEnv = {
  DB: D1Database;
  CACHE: KVNamespace;
  RESEND_API_KEY?: string;
  RESEND_TO?: string;
};

export const INGEST_DISPATCH_CRON = '0 */6 * * *';
export const INGEST_HEALTH_CRON = '*/30 * * * *';
export const DAILY_DIGEST_CRON = '30 9 * * *';

const SITE_URL = 'https://fde-radar.kekincai.workers.dev';
const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const RESEND_FROM = 'FDE Radar <onboarding@resend.dev>';
const FAILURE_COOLDOWN_SECONDS = 6 * 60 * 60;
const DAY_SECONDS = 24 * 60 * 60;

export type SourceHealth = {
  id: string;
  name: string;
  homepage: string;
  poll_interval_minutes: number;
  last_success_at: string | null;
  last_error_at: string | null;
  consecutive_failures: number;
  backoff_until: string | null;
  created_at: string;
};

export type SourceIssue = SourceHealth & {
  reason: 'manual_review' | 'consecutive_failures' | 'stale';
  detail: string;
};

type DailyArticle = {
  title: string;
  canonical_url: string;
  source_name: string;
  core_pillar: string;
  priority_level: string;
  summary_ja: string;
  summary: string;
  why_it_matters: string;
  recommended_action: string;
  published_at: string;
};

type RunSummary = {
  runs: number;
  successful_runs: number;
  failed_runs: number;
  new_articles: number;
};

type ResendResult = { id?: string; message?: string; name?: string };

export function jstDayWindow(now: Date): { day: string; start: string; end: string } {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit'
  });
  const day = formatter.format(now);
  return {
    day,
    start: new Date(`${day}T00:00:00+09:00`).toISOString(),
    end: now.toISOString()
  };
}

export function sourceIssue(source: SourceHealth, now: Date): SourceIssue | null {
  const lastErrorTime = Date.parse(source.last_error_at ?? '');
  const lastSuccessTime = Date.parse(source.last_success_at ?? '');
  const backoffTime = Date.parse(source.backoff_until ?? '');
  if (source.consecutive_failures > 0 && Number.isFinite(lastErrorTime) && Number.isFinite(backoffTime)
    && (!Number.isFinite(lastSuccessTime) || lastErrorTime > lastSuccessTime)
    && backoffTime - lastErrorTime >= DAY_SECONDS * 1000) {
    return { ...source, reason: 'manual_review', detail: '長期 backoff に入り、手動確認が必要' };
  }
  if (source.consecutive_failures >= 3) {
    return { ...source, reason: 'consecutive_failures', detail: `${source.consecutive_failures}回連続で取得に失敗` };
  }
  const reference = source.last_success_at ?? source.created_at;
  const referenceTime = Date.parse(reference);
  if (!Number.isFinite(referenceTime)) return null;
  const allowedMinutes = Math.max(24 * 60, source.poll_interval_minutes * 3);
  if (now.getTime() - referenceTime > allowedMinutes * 60_000) {
    return {
      ...source,
      reason: 'stale',
      detail: source.last_success_at
        ? `最終成功から${Math.floor((now.getTime() - referenceTime) / 3_600_000)}時間経過`
        : '有効化後24時間以上、成功記録なし'
    };
  }
  return null;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character] ?? character);
}

function concise(value: string, length = 180): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > length ? `${normalized.slice(0, length - 1)}…` : normalized;
}

function formatJst(value: string | null): string {
  if (!value) return '記録なし';
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return value;
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).format(new Date(timestamp));
}

function emailFrame(title: string, lead: string, content: string): string {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"></head>
  <body style="margin:0;padding:0;background:#f5f7fa;color:#10203d;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans JP',sans-serif;-webkit-text-size-adjust:100%">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f5f7fa">
      <tr><td align="center" style="padding:32px 16px">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:720px;background:#ffffff;border:1px solid #d8e0eb;border-collapse:collapse">
          <tr><td style="height:4px;background:#2059dc;font-size:0;line-height:0">&nbsp;</td></tr>
          <tr><td style="padding:24px 28px 20px;border-bottom:1px solid #d8e0eb">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
              <tr>
                <td style="font-size:16px;font-weight:800;letter-spacing:.08em;color:#10203d">FDE <span style="color:#2059dc">RADAR</span></td>
                <td align="right" style="font-size:11px;letter-spacing:.12em;color:#6f7e93">FIELD INTELLIGENCE</td>
              </tr>
            </table>
          </td></tr>
          <tr><td style="padding:30px 28px 10px">
            <h1 style="font-size:24px;line-height:1.45;font-weight:750;letter-spacing:-.015em;margin:0 0 10px;color:#10203d">${escapeHtml(title)}</h1>
            <p style="font-size:15px;line-height:1.8;margin:0;color:#627089">${escapeHtml(lead)}</p>
          </td></tr>
          <tr><td style="padding:18px 28px 32px">${content}
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:28px">
              <tr><td style="background:#2059dc"><a href="${SITE_URL}" style="display:inline-block;padding:12px 18px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700">FDE Radar を開く&nbsp;&nbsp;→</a></td></tr>
            </table>
          </td></tr>
        </table>
        <p style="font-size:12px;line-height:1.7;color:#6f7e93;text-align:center;margin:16px 0 0">AI Forward Deployed Engineering のための公開フィールドインテリジェンス</p>
      </td></tr>
    </table>
  </body></html>`;
}

export function renderFailureEmail(issues: SourceIssue[], checkedAt: Date): { subject: string; html: string; text: string } {
  const subject = `【FDE Radar】収集異常 ${issues.length}件`;
  const rows = issues.map((issue) => `<tr>
    <td style="padding:13px 12px;border-bottom:1px solid #d8e0eb;vertical-align:top"><a href="${escapeHtml(issue.homepage)}" style="color:#2059dc;font-weight:700;text-decoration:none">${escapeHtml(issue.name)}</a></td>
    <td style="padding:13px 12px;border-bottom:1px solid #d8e0eb;vertical-align:top;color:#b94332">${escapeHtml(issue.detail)}</td>
    <td style="padding:13px 12px;border-bottom:1px solid #d8e0eb;vertical-align:top;color:#627089">${escapeHtml(formatJst(issue.last_success_at))}</td>
  </tr>`).join('');
  const html = emailFrame(
    '収集パイプラインに確認が必要です',
    `${formatJst(checkedAt.toISOString())} 時点で ${issues.length} 件の異常を検出しました。`,
    `<div style="border-left:3px solid #e85d48;background:#fff0ed;padding:13px 15px;margin:0 0 20px;font-size:14px;line-height:1.7;color:#7f3025">取得停止や長期 backoff を確認し、必要に応じて Source 設定を見直してください。</div>
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;width:100%;font-size:13px;border:1px solid #d8e0eb"><thead><tr style="text-align:left;background:#f5f7fa;color:#627089"><th style="padding:11px 12px;border-bottom:1px solid #d8e0eb">SOURCE</th><th style="padding:11px 12px;border-bottom:1px solid #d8e0eb">状態</th><th style="padding:11px 12px;border-bottom:1px solid #d8e0eb">最終成功</th></tr></thead><tbody>${rows}</tbody></table>`
  );
  const text = [subject, `確認時刻: ${formatJst(checkedAt.toISOString())}`, '', ...issues.map((issue) =>
    `- ${issue.name}: ${issue.detail}（最終成功: ${formatJst(issue.last_success_at)}）\n  ${issue.homepage}`
  ), '', SITE_URL].join('\n');
  return { subject, html, text };
}

export function renderDailyDigest(
  day: string,
  articles: DailyArticle[],
  totalArticles: number,
  runs: RunSummary,
  healthySources: number,
  issueCount: number
): { subject: string; html: string; text: string } {
  const subject = `【FDE Radar 日報】${day}｜新着 ${totalArticles}件`;
  const successRate = runs.runs ? Math.round(runs.successful_runs / runs.runs * 1000) / 10 : 100;
  const metrics = `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;margin-bottom:26px;border:1px solid #d8e0eb">
    <tr>
      <td width="33.33%" style="padding:14px 12px;border-right:1px solid #d8e0eb;vertical-align:top"><div style="font-size:10px;letter-spacing:.1em;color:#6f7e93">NEW SIGNALS</div><div style="font-size:23px;font-weight:750;color:#10203d;margin-top:4px">${totalArticles}</div></td>
      <td width="33.33%" style="padding:14px 12px;border-right:1px solid #d8e0eb;vertical-align:top"><div style="font-size:10px;letter-spacing:.1em;color:#6f7e93">FETCH SUCCESS</div><div style="font-size:23px;font-weight:750;color:#10203d;margin-top:4px">${successRate}%</div></td>
      <td width="33.33%" style="padding:14px 12px;vertical-align:top;background:${issueCount ? '#fff0ed' : '#ffffff'}"><div style="font-size:10px;letter-spacing:.1em;color:#6f7e93">SOURCE HEALTH</div><div style="font-size:15px;font-weight:750;color:${issueCount ? '#b94332' : '#10203d'};margin-top:8px">正常 ${healthySources} / 異常 ${issueCount}</div></td>
    </tr>
  </table>`;
  const articleHtml = articles.length ? articles.map((article, index) => {
    const summary = concise(article.summary_ja || article.summary || article.why_it_matters || '要約は記事詳細をご確認ください。');
    const action = concise(article.recommended_action, 120);
    const priorityColor = article.priority_level === 'P0' ? '#b94332' : article.priority_level === 'P1' ? '#2059dc' : '#6f7e93';
    return `<div style="padding:20px 0;border-top:${index ? '1px solid #d8e0eb' : '0'}">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
        <td style="font-size:11px;line-height:1.5;color:#627089"><span style="font-weight:800;color:${priorityColor}">${escapeHtml(article.priority_level)}</span>&nbsp;&nbsp;${escapeHtml(article.core_pillar)}&nbsp;&nbsp;/&nbsp;&nbsp;${escapeHtml(article.source_name)}</td>
        <td width="28" align="right" style="font-size:11px;color:#6f7e93">${String(index + 1).padStart(2, '0')}</td>
      </tr></table>
      <h2 style="font-size:18px;line-height:1.55;margin:7px 0 8px;font-weight:720"><a href="${escapeHtml(article.canonical_url)}" style="color:#10203d;text-decoration:none">${escapeHtml(article.title)}</a></h2>
      <p style="font-size:14px;line-height:1.8;margin:0;color:#4e5d75">${escapeHtml(summary)}</p>
      ${action ? `<div style="font-size:13px;line-height:1.7;margin:12px 0 0;padding:10px 12px;border-left:3px solid #2059dc;background:#edf3ff;color:#314663"><b style="color:#2059dc">次の一手</b>&nbsp;&nbsp;${escapeHtml(action)}</div>` : ''}
    </div>`;
  }).join('') : '<div style="padding:18px 0;border-top:1px solid #d8e0eb;font-size:14px;line-height:1.8;color:#627089">本日の新着記事はありません。収集処理と Source の健康状態は継続して監視しています。</div>';
  const html = emailFrame(
    `${day} のフィールドインテリジェンス`,
    '今日追加された FDE 関連情報を、優先度と実務への接続点が分かる形でまとめました。',
    `${metrics}${articleHtml}${totalArticles > articles.length ? `<p style="margin:18px 0 0;padding-top:16px;border-top:1px solid #d8e0eb;font-size:13px;color:#627089">ほか ${totalArticles - articles.length} 件はサイトで確認できます。</p>` : ''}`
  );
  const text = [
    subject,
    `新着: ${totalArticles}件 / 取得成功率: ${successRate}% / 正常Source: ${healthySources} / 異常: ${issueCount}`,
    '',
    ...(articles.length ? articles.flatMap((article, index) => [
      `${index + 1}. [${article.priority_level} / ${article.core_pillar}] ${article.title}`,
      `   ${concise(article.summary_ja || article.summary || article.why_it_matters || '')}`,
      `   ${article.canonical_url}`
    ]) : ['本日の新着記事はありません。']),
    '', SITE_URL
  ].join('\n');
  return { subject, html, text };
}

async function sendEmail(
  env: NotificationEnv,
  message: { subject: string; html: string; text: string },
  idempotencyKey: string
): Promise<ResendResult> {
  if (!env.RESEND_API_KEY || !env.RESEND_TO) throw new Error('Resend notification secrets are not configured');
  const response = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey.slice(0, 256)
    },
    body: JSON.stringify({ from: RESEND_FROM, to: [env.RESEND_TO], ...message })
  });
  const result = await response.json().catch(() => ({})) as ResendResult;
  if (!response.ok) throw new Error(`Resend ${response.status}: ${result.message ?? result.name ?? 'send failed'}`);
  console.log({ event: 'notification_email_sent', subject: message.subject, resendId: result.id });
  return result;
}

async function readSourceHealth(env: NotificationEnv): Promise<SourceHealth[]> {
  const result = await env.DB.prepare(
    `SELECT id, name, homepage, poll_interval_minutes, last_success_at, last_error_at,
            consecutive_failures, backoff_until, created_at
     FROM sources WHERE allowed_fetch = 1 ORDER BY priority DESC, name`
  ).all<SourceHealth>();
  return result.results;
}

export async function monitorIngestionHealth(env: NotificationEnv, now = new Date()): Promise<{ sent: boolean; issues: number }> {
  const issues = (await readSourceHealth(env)).map((source) => sourceIssue(source, now)).filter((issue): issue is SourceIssue => Boolean(issue));
  if (!issues.length) return { sent: false, issues: 0 };
  const ready: SourceIssue[] = [];
  for (const issue of issues) {
    if (!await env.CACHE.get(`email:failure-cooldown:${issue.id}`)) ready.push(issue);
  }
  if (!ready.length) return { sent: false, issues: issues.length };
  const fingerprint = await digest(ready.map((issue) => `${issue.id}:${issue.consecutive_failures}:${issue.last_error_at ?? issue.last_success_at ?? ''}`).join('|'));
  await sendEmail(env, renderFailureEmail(ready, now), `fde-failure-${fingerprint}`);
  await Promise.all(ready.map((issue) => env.CACHE.put(`email:failure-cooldown:${issue.id}`, now.toISOString(), { expirationTtl: FAILURE_COOLDOWN_SECONDS })));
  return { sent: true, issues: issues.length };
}

export async function sendDailyDigest(env: NotificationEnv, now = new Date(), force = false): Promise<{ sent: boolean; articles: number }> {
  const window = jstDayWindow(now);
  const sentKey = `email:daily:${window.day}`;
  if (!force && await env.CACHE.get(sentKey)) return { sent: false, articles: 0 };
  const [articleRows, articleCount, runRow, sources] = await Promise.all([
    env.DB.prepare(
      `SELECT a.title, a.canonical_url, s.name AS source_name, a.core_pillar, a.priority_level,
              a.summary_ja, a.summary, a.why_it_matters, a.recommended_action, a.published_at
       FROM articles a JOIN sources s ON s.id = a.source_id
       WHERE a.status = 'published'
         AND datetime(COALESCE(NULLIF(a.first_seen_at, ''), a.discovered_at, a.created_at)) >= datetime(?)
         AND datetime(COALESCE(NULLIF(a.first_seen_at, ''), a.discovered_at, a.created_at)) < datetime(?)
       ORDER BY CASE a.priority_level WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 ELSE 2 END,
                a.priority_score DESC, a.published_at DESC LIMIT 30`
    ).bind(window.start, window.end).all<DailyArticle>(),
    env.DB.prepare(
      `SELECT COUNT(*) AS total FROM articles
       WHERE status = 'published'
         AND datetime(COALESCE(NULLIF(first_seen_at, ''), discovered_at, created_at)) >= datetime(?)
         AND datetime(COALESCE(NULLIF(first_seen_at, ''), discovered_at, created_at)) < datetime(?)`
    ).bind(window.start, window.end).first<{ total: number }>(),
    env.DB.prepare(
      `SELECT COUNT(*) AS runs,
              SUM(CASE WHEN status IN ('success', 'not_modified') THEN 1 ELSE 0 END) AS successful_runs,
              SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS failed_runs,
              COALESCE(SUM(unique_count), 0) AS new_articles
       FROM fetch_runs WHERE datetime(started_at) >= datetime(?) AND datetime(started_at) < datetime(?)`
    ).bind(window.start, window.end).first<RunSummary>(),
    readSourceHealth(env)
  ]);
  const issues = sources.map((source) => sourceIssue(source, now)).filter(Boolean).length;
  const total = Number(articleCount?.total ?? 0);
  const runSummary: RunSummary = {
    runs: Number(runRow?.runs ?? 0), successful_runs: Number(runRow?.successful_runs ?? 0),
    failed_runs: Number(runRow?.failed_runs ?? 0), new_articles: Number(runRow?.new_articles ?? 0)
  };
  await sendEmail(
    env,
    renderDailyDigest(window.day, articleRows.results, total, runSummary, sources.length - issues, issues),
    force ? `fde-daily-test-${window.day}-${now.getTime()}` : `fde-daily-${window.day}`
  );
  if (!force) await env.CACHE.put(sentKey, now.toISOString(), { expirationTtl: 3 * DAY_SECONDS });
  return { sent: true, articles: total };
}

export async function sendConfigurationTest(env: NotificationEnv, now = new Date()): Promise<ResendResult> {
  return sendEmail(env, renderConfigurationTest(now), `fde-config-test-${now.getTime()}`);
}

export function renderConfigurationTest(now: Date): { subject: string; html: string; text: string } {
  return {
    subject: '【FDE Radar】メール通知テスト',
    html: emailFrame(
      'メール通知の接続に成功しました',
      `${formatJst(now.toISOString())} に Cloudflare Workers から Resend へ接続しました。`,
      `<div style="border:1px solid #d8e0eb;background:#ffffff">
        <div style="padding:13px 15px;border-bottom:1px solid #d8e0eb;font-size:12px;font-weight:750;color:#10203d">通知設定</div>
        <div style="padding:14px 15px;border-bottom:1px solid #d8e0eb;font-size:14px;line-height:1.7;color:#4e5d75"><b style="color:#e85d48">収集失敗アラート</b><br>連続失敗・長期停止・手動確認が必要な Source を検出したとき</div>
        <div style="padding:14px 15px;font-size:14px;line-height:1.7;color:#4e5d75"><b style="color:#2059dc">毎日のフィールドインテリジェンス</b><br>毎日18:30（日本時間）に新着記事と収集状況を集約</div>
      </div>`
    ),
    text: `FDE Radar メール通知テスト\n${formatJst(now.toISOString())} に接続成功。\n失敗アラートと毎日18:30の日報を送信します。\n${SITE_URL}`
  };
}

async function digest(value: string): Promise<string> {
  const result = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(result)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
