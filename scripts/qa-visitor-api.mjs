import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const base = process.env.QA_BASE_URL || 'http://127.0.0.1:5177';
const browserOrigin=process.env.QA_BROWSER_ORIGIN||base;
const checks = [];
const mark = name => { checks.push(name); console.log('PASS ' + name); };
async function api(path, options = {}, cookie) {
  const r = await fetch(base + '/api/' + path, { ...options, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(process.env.QA_BROWSER_ORIGIN?{Host:new URL(browserOrigin).host}:{}), ...(options.method ? { Origin: browserOrigin, 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) } });
  const value = (r.headers.get('content-type') || '').includes('json') ? await r.json() : await r.arrayBuffer();
  return { response: r, value };
}
async function visitor() {
  const x = await api('session');
  assert.equal(x.response.status, 200);
  assert.equal(x.value.accessMode, 'visitor');
  assert(x.value.user.id.startsWith('visitor_'));
  assert.equal(x.value.isAdmin, false);
  return { cookie: x.response.headers.get('set-cookie').split(';')[0], session: x.value };
}

try {
  const health = await api('health');
  assert.equal(health.response.status, 200);
  assert.equal(health.value.status, 'ok');
  mark('数据库迁移完成，服务健康检查通过');
  const a = await visitor(), b = await visitor();
  assert.notEqual(a.session.user.id, b.session.user.id);
  const again = await api('session', {}, a.cookie);
  assert.equal(again.value.user.id, a.session.user.id);
  mark('无需登录创建独立访客空间，同一浏览器会话稳定');
  assert.equal((await api('projects', { headers: { 'oai-authenticated-user-id': a.session.user.id, 'oai-authenticated-user-email': 'owner@workspace.invalid' } })).response.status, 401);
  mark('没有有效访客凭证时不能伪造平台身份');
  const projectId = 'qa-' + crypto.randomUUID();
  const project = { id: projectId, name: '访客 AI 验证', pages: [{ id: 'page-1', label: '第一页', copy: [{ id: 'title-1', text: '保留中文与数字 2026' }], settings: { accent: '#456439', fontScale: 1, photoZoom: 1, photoX: 50, photoY: 50 }, layout: 'editorial' }], assets: [] };
  const put = await api('projects/' + projectId, { method: 'PUT', body: JSON.stringify({ project, revision: 0 }) }, a.cookie);
  assert.equal(put.response.status, 200);
  const own = await api('projects', {}, a.cookie);
  assert(own.value.projects.some(p => p.id === projectId));
  const other = await api('projects', { headers: { 'oai-authenticated-user-id': a.session.user.id, 'oai-authenticated-user-email': 'owner@workspace.invalid' } }, b.cookie);
  assert(!other.value.projects.some(p => p.id === projectId));
  assert.equal((await api('projects/' + projectId, { method: 'DELETE' }, b.cookie)).response.status, 404);
  mark('访客项目保存、隔离与越权删除拦截');
  assert.equal((await api('projects/' + projectId, { method: 'PUT', headers: { Origin: 'https://untrusted.test' }, body: JSON.stringify({ project, revision: 1 }) }, a.cookie)).response.status, 403);
  const conflict=await api('projects/' + projectId, { method: 'PUT', body: JSON.stringify({ project, revision: 0 }) }, a.cookie);
  assert.equal(conflict.response.status, 409, conflict.value instanceof ArrayBuffer ? new TextDecoder().decode(conflict.value).slice(0,800) : JSON.stringify(conflict.value));
  mark('跨站写入及旧版本覆盖均被拦截');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/m8AAAAASUVORK5CYII=','base64');
  const upload = await api('assets?projectId=' + projectId + '&name=qa.png', { method: 'POST', body: png, headers: { 'Content-Type': 'image/png' } }, a.cookie);
  assert.equal(upload.response.status, 200);
  const asset = await api('files/' + upload.value.id, {}, a.cookie);
  assert.equal(asset.response.status, 200);
  assert.deepEqual(Buffer.from(asset.value), png);
  assert.equal((await api('files/' + upload.value.id, {}, b.cookie)).response.status, 404);
  mark('访客图片上传、下载与跨空间隔离');
  assert.equal((await api('admin', {}, a.cookie)).response.status, 403);
  mark('访客不能访问管理功能');
  if (a.session.capabilities.ai && a.session.capabilities.skills.every(s => s.ready)) {
    const request = { projectId, requestId: crypto.randomUUID(), kind: 'write', prompt: '只为当前提供的素材制作简短测试稿。', pageIds: ['page-1'], revision: 1 };
    const first = await api('jobs', { method: 'POST', body: JSON.stringify(request) }, a.cookie);
    assert.equal(first.response.status, 201);
    const repeat = await api('jobs', { method: 'POST', body: JSON.stringify(request) }, a.cookie);
    assert.equal(repeat.value.job.id, first.value.job.id);
    assert.equal((await api('jobs/' + first.value.job.id, {}, b.cookie)).response.status, 404);
    const limited = await api('jobs', { method: 'POST', body: JSON.stringify({ ...request, requestId: crypto.randomUUID() }) }, a.cookie);
    assert.equal(limited.response.status, 429);
    assert.equal((await api('jobs/' + first.value.job.id + '/cancel', { method: 'POST', body: '{}' }, a.cookie)).value.job.status, 'cancelled');
    mark('完整技能就绪，任务创建、幂等、并发限制及取消通过（未调用付费 AI）');
  }
  await api('projects/' + projectId, { method: 'DELETE' }, a.cookie);
  const result = { checks, transportBase:base, browserOrigin, completedAt: new Date().toISOString(), liveAIExecuted: false };
  await fs.mkdir('qa/railway', { recursive: true });
  await fs.writeFile('qa/railway/visitor-api.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ passed: checks.length }));
} catch (e) { console.error(e.message); process.exitCode = 1; }
