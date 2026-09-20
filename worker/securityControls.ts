export class BodyTooLargeError extends Error {
  constructor(maxBytes: number) {
    super(`Body exceeds ${maxBytes} bytes`);
    this.name = 'BodyTooLargeError';
  }
}

export function hasConfiguredBearerToken(header: string | null, token?: string): boolean {
  return Boolean(token && header === `Bearer ${token}`);
}

const PUBLIC_ANALYTICS_EVENTS = new Set(['page_view', 'section_view', 'article_open', 'source_click']);

export function isPublicAnalyticsEvent(value: unknown): value is string {
  return typeof value === 'string' && PUBLIC_ANALYTICS_EVENTS.has(value);
}

export async function readLimitedText(input: Request | Response, maxBytes: number): Promise<string> {
  const declaredLength = Number(input.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    await input.body?.cancel().catch(() => undefined);
    throw new BodyTooLargeError(maxBytes);
  }
  if (!input.body) return '';

  const reader = input.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new BodyTooLargeError(maxBytes);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

export async function consumeRequestLimit(
  db: D1Database,
  keyHash: string,
  limit: number,
  windowSeconds: number,
  nowSeconds = Math.floor(Date.now() / 1000)
): Promise<boolean> {
  const expiresAt = nowSeconds + windowSeconds;
  const row = await db.prepare(
    `INSERT INTO request_rate_limits (key_hash, count, expires_at) VALUES (?, 1, ?)
     ON CONFLICT(key_hash) DO UPDATE SET
       count = CASE WHEN request_rate_limits.expires_at <= ? THEN 1
                    ELSE request_rate_limits.count + 1 END,
       expires_at = CASE WHEN request_rate_limits.expires_at <= ? THEN ?
                         ELSE request_rate_limits.expires_at END
     WHERE request_rate_limits.expires_at <= ? OR request_rate_limits.count < ?
     RETURNING count`
  ).bind(keyHash, expiresAt, nowSeconds, nowSeconds, expiresAt, nowSeconds, limit).first<{ count: number }>();
  return Number(row?.count ?? limit + 1) <= limit;
}
