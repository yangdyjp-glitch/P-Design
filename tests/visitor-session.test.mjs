import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const { outputFiles } = await build({ entryPoints: ['server/visitor-session.ts'], bundle: true, write: false, platform: 'node', format: 'esm' });
const { visitorContext, visitorResponse } = await import('data:text/javascript;base64,' + Buffer.from(outputFiles[0].text).toString('base64'));
const env = { ACCESS_MODE: 'visitor', VISITOR_SESSION_SECRET: 'test-only-session-secret-with-enough-entropy', APP_ORIGIN: 'https://example.test' };
const req = (pathname, options) => new Request('http://127.0.0.1:8787' + pathname, options);
const cookie = context => context.cookie.split(';')[0];

test('Sites requests retain their existing authentication path', async () => {
  assert.equal(await visitorContext(req('/api/session'), {}), null);
  const response = new Response('ok');
  assert.equal(visitorResponse(response, null), response);
});

test('visitor mode requires a signing secret and refuses forged identity headers', async () => {
  assert.equal((await visitorContext(req('/api/session'), { ACCESS_MODE: 'visitor' })).status, 503);
  const denied = await visitorContext(req('/api/projects', { headers: { 'oai-authenticated-user-id': 'owner', 'oai-authenticated-user-email': 'owner@example.test' } }), env);
  assert.equal(denied.status, 401);
});

test('new visitors receive independent, secure, HttpOnly cookies', async () => {
  const a = await visitorContext(req('/api/session'), env);
  const b = await visitorContext(req('/api/session'), env);
  assert.notEqual(a.request.headers.get('oai-authenticated-user-id'), b.request.headers.get('oai-authenticated-user-id'));
  assert.match(a.cookie, /^__Host-tuxu-visitor=/);
  assert.match(a.cookie, /; HttpOnly;/);
  assert.match(a.cookie, /; SameSite=Lax;/);
  assert.match(a.cookie, /; Secure$/);
  const response = visitorResponse(new Response('ok'), a);
  assert.equal(response.headers.get('set-cookie'), a.cookie);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(visitorResponse(new Response('ok',{headers:{Vary:'RSC'}}),a).headers.get('vary'),'RSC, Cookie');
});

test('valid cookies retain the visitor while replacing all supplied identity fields', async () => {
  const a = await visitorContext(req('/api/session'), env);
  const b = await visitorContext(req('/api/projects', { headers: { Cookie: cookie(a), 'oai-authenticated-user-id': 'owner', 'oai-authenticated-user-email': 'owner@example.test', 'oai-authenticated-user-admin': 'true' } }), env);
  assert.equal(b.request.headers.get('oai-authenticated-user-id'), a.request.headers.get('oai-authenticated-user-id'));
  assert.equal(b.request.headers.get('oai-authenticated-user-email'), 'visitor@workspace.invalid');
  assert.equal(b.request.headers.get('oai-authenticated-user-admin'), null);
  assert.equal(b.cookie, undefined);
});

test('tampered, duplicate, expired, and differently signed cookies cannot select a workspace', async () => {
  const a = await visitorContext(req('/api/session'), env);
  const c = cookie(a);
  for (const invalid of [c.slice(0, -1) + (c.endsWith('x') ? 'y' : 'x'), c + '; ' + c]) {
    assert.equal((await visitorContext(req('/api/projects', { headers: { Cookie: invalid } }), env)).status, 401);
  }
  assert.equal((await visitorContext(req('/api/projects', { headers: { Cookie: c } }), { ...env, VISITOR_SESSION_SECRET: 'a-different-server-secret-with-enough-entropy' })).status, 401);
  const payload = 'v1.' + crypto.randomUUID() + '.' + (Math.floor(Date.now() / 1000) - 1);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.VISITOR_SESSION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = Buffer.from(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))).toString('base64url');
  assert.equal((await visitorContext(req('/api/projects', { headers: { Cookie: '__Host-tuxu-visitor=' + payload + '.' + signature } }), env)).status, 401);
});

test('configured public origin survives Railway internal HTTP forwarding', async () => {
  const a = await visitorContext(req('/api/session'), env);
  const b = await visitorContext(req('/api/projects?id=one', { method: 'POST', headers: { Cookie: cookie(a), Origin: env.APP_ORIGIN }, body: '{}' }), env);
  assert.equal(b.request.url, 'https://example.test/api/projects?id=one');
  assert.equal(b.request.headers.get('host'), 'example.test');
  assert.equal(b.request.headers.get('origin'), new URL(b.request.url).origin);
  assert.equal(await b.request.text(), '{}');
});

test('loopback development can use a cookie without the Secure-only host prefix', async () => {
  const a = await visitorContext(req('/api/session'), { ...env, APP_ORIGIN: 'http://127.0.0.1:8787' });
  assert.match(a.cookie, /^tuxu-visitor=/);
  assert.doesNotMatch(a.cookie, /; Secure/);
});
