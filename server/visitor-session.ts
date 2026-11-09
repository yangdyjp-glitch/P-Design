import { Buffer } from 'node:buffer';

const COOKIE = '__Host-tuxu-visitor';
const LOCAL_COOKIE = 'tuxu-visitor';
const TTL = 30 * 24 * 60 * 60;
type VisitorEnv = { ACCESS_MODE?: string; VISITOR_SESSION_SECRET?: string; APP_ORIGIN?: string };
type VisitorContext = { request: Request; cookie?: string };
let cachedSecret = '';
let cachedKey: CryptoKey | undefined;

// Consume small rejected request bodies before returning through Wrangler's
// HTTP proxy; abandoning them can break the next pooled upstream connection.
// Oversized or stalled bodies are cancelled with a strict byte/time bound.
export async function discardRequestBody(request: Request) {
  if (!request.body || request.bodyUsed || request.body.locked) return;
  const reader = request.body.getReader();
  const timer = setTimeout(() => { void reader.cancel().catch(() => {}); }, 1000);
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 65536) { await reader.cancel(); break; }
    }
  } catch {} finally { clearTimeout(timer); reader.releaseLock(); }
}

async function signingKey(secret: string) {
  if (!cachedKey || cachedSecret !== secret) {
    cachedKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
    cachedSecret = secret;
  }
  return cachedKey;
}

// The public Railway preview has no trusted Sites authentication proxy. Never
// accept its caller-supplied identity headers, even when a visitor cookie exists.
export async function visitorContext(request: Request, env: VisitorEnv): Promise<VisitorContext | Response | null> {
  if (env.ACCESS_MODE !== 'visitor') return null;
  if (!env.VISITOR_SESSION_SECRET || env.VISITOR_SESSION_SECRET.length < 32) {
    await discardRequestBody(request);
    return Response.json({ error: '访客空间尚未配置完成，请联系网站维护者。' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
  const url = new URL(request.url);
  if (env.APP_ORIGIN) {
    const external = new URL(env.APP_ORIGIN);
    url.protocol = external.protocol;
    url.host = external.host;
    url.port = external.port;
  }
  const normalized = new Request(url.toString(), request);
  normalized.headers.set('host', url.host);
  for (const name of [...normalized.headers.keys()]) {
    if (name.toLowerCase().startsWith('oai-authenticated-user-')) normalized.headers.delete(name);
  }
  const secure = url.protocol === 'https:';
  const cookieName = secure ? COOKIE : LOCAL_COOKIE;
  const tokens = (request.headers.get('cookie') || '').split(';').map(x => x.trim()).filter(x => x.startsWith(cookieName + '='));
  const token = tokens.length === 1 ? tokens[0].slice(cookieName.length + 1) : '';
  const match = /^v1\.([0-9a-f-]{36})\.(\d{10})\.([A-Za-z0-9_-]{43})$/.exec(token);
  const now = Math.floor(Date.now() / 1000);
  const key = await signingKey(env.VISITOR_SESSION_SECRET);
  let id = '';
  if (match && Number(match[2]) > now && Number(match[2]) <= now + TTL + 300) {
    const payload = `v1.${match[1]}.${match[2]}`;
    const valid = await crypto.subtle.verify('HMAC', key, Buffer.from(match[3], 'base64url'), new TextEncoder().encode(payload));
    if (valid) id = match[1];
  }
  let cookie: string | undefined;
  if (!id && request.method === 'GET' && ['/', '/api/session', '/api/workspace'].includes(url.pathname)) {
    id = crypto.randomUUID();
    const payload = `v1.${id}.${now + TTL}`;
    const signature = Buffer.from(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))).toString('base64url');
    cookie = `${cookieName}=${payload}.${signature}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${TTL}${secure ? '; Secure' : ''}`;
  }
  if (!id && url.pathname.startsWith('/api/') && url.pathname !== '/api/health') {
    await discardRequestBody(normalized);
    return Response.json({ error: '访客空间已过期，请刷新网页后重试。' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }
  if (id) {
    normalized.headers.set('oai-authenticated-user-id', 'visitor_' + id);
    normalized.headers.set('oai-authenticated-user-email', 'visitor@workspace.invalid');
    normalized.headers.set('oai-authenticated-user-full-name', encodeURIComponent('访客空间'));
    normalized.headers.set('oai-authenticated-user-full-name-encoding', 'percent-encoded-utf-8');
  }
  return { request: normalized, cookie };
}

export function visitorResponse(response: Response, context: VisitorContext | null) {
  if (!context) return response;
  const result = new Response(response.body, response);
  if (context.cookie) result.headers.append('Set-Cookie', context.cookie);
  result.headers.set('Cache-Control', 'private, no-store');
  const vary=result.headers.get('Vary');
  if(!vary?.split(',').some(value=>value.trim().toLowerCase()==='cookie'))result.headers.set('Vary',vary?vary+', Cookie':'Cookie');
  return result;
}
