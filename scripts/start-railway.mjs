import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startPostgresTunnel } from './postgres-tunnel.mjs';
import './sites-env.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.PORT || 8787);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid port.');
const bindIP=process.env.TUXU_BIND_IP||'0.0.0.0';
if(!['0.0.0.0','127.0.0.1'].includes(bindIP))throw new Error('TUXU_BIND_IP must be 0.0.0.0 or 127.0.0.1.');
const logLevel=process.env.TUXU_VERBOSE==='true'?'info':'warn';
const dataDir = path.resolve(process.env.TUXU_DATA_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(root, '.wrangler/railway'));
const persistent = !!process.env.RAILWAY_VOLUME_MOUNT_PATH;
await fs.mkdir(dataDir, { recursive: true });
const origin = new URL(process.env.APP_ORIGIN || (process.env.RAILWAY_PUBLIC_DOMAIN ? 'https://' + process.env.RAILWAY_PUBLIC_DOMAIN : 'http://127.0.0.1:' + port));
if (origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash || !['http:', 'https:'].includes(origin.protocol)) throw new Error('APP_ORIGIN must contain only the website origin.');
if (origin.protocol !== 'https:' && !['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname)) throw new Error('A public APP_ORIGIN must use HTTPS.');
if (process.env.RAILWAY_ENVIRONMENT_ID && !process.env.APP_ORIGIN && !process.env.RAILWAY_PUBLIC_DOMAIN) throw new Error('Set APP_ORIGIN to the public website URL.');

const workerEnv = { ...process.env, CI: 'true', CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'true' };
// Visitor mode remains available only for explicitly isolated, loopback QA.
const accessMode=process.env.TUXU_LOCAL_VISITOR_QA==='true'&&['127.0.0.1','localhost','[::1]'].includes(origin.hostname)?'visitor':'accounts';
if (!workerEnv.VISITOR_SESSION_SECRET) {
  const secretPath = path.join(dataDir, 'visitor-session-secret');
  try { workerEnv.VISITOR_SESSION_SECRET = (await fs.readFile(secretPath, 'utf8')).trim(); }
  catch (e) {
    if (e.code !== 'ENOENT') throw e;
    const secret = crypto.randomBytes(32).toString('base64url');
    try { await fs.writeFile(secretPath, secret, { flag: 'wx', mode: 0o600 }); workerEnv.VISITOR_SESSION_SECRET = secret; }
    catch (e) { if (e.code !== 'EEXIST') throw e; workerEnv.VISITOR_SESSION_SECRET = (await fs.readFile(secretPath, 'utf8')).trim(); }
  }
}
if (workerEnv.VISITOR_SESSION_SECRET.length < 32) throw new Error('VISITOR_SESSION_SECRET must be at least 32 characters.');

async function run(script, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], { cwd: root, env: workerEnv, stdio: ['ignore', 'inherit', 'inherit'], ...options });
    child.once('error', reject);
    child.once('exit', (code, signal) => code === 0 ? resolve() : reject(new Error('Setup command failed (' + (signal || code) + ').')));
  });
}

// Validate and migrate the external database before any skill upload. Local data
// is read from the existing volume and copied only into an empty application schema.
if (workerEnv.DATABASE_URL) await run('scripts/migrate-postgres.mjs');

let configuredSkills;
try{configuredSkills=JSON.parse(workerEnv.SKILL_FILES_JSON||'{}');if(!configuredSkills||Array.isArray(configuredSkills)||typeof configuredSkills!=='object')throw Error();}
catch{throw new Error('SKILL_FILES_JSON must be a valid JSON object.');}
const resourcesReady=['_runtime','taste-skill','xhs-writer','copywriting','copy-editing','humanizer-zh','content-research-writer','content-strategy','social'].every(id=>configuredSkills[id]?.fileId);
if ((!workerEnv.SKILL_FILES_JSON||!resourcesReady) && workerEnv.OPENAI_API_KEY) {
  workerEnv.SKILL_RELEASE_DIR = path.join(dataDir, 'skill-release');
  if(workerEnv.SKILL_FILES_JSON){await fs.mkdir(workerEnv.SKILL_RELEASE_DIR,{recursive:true});let cached={};try{cached=JSON.parse(await fs.readFile(path.join(workerEnv.SKILL_RELEASE_DIR,'uploaded.json'),'utf8'));}catch{}await fs.writeFile(path.join(workerEnv.SKILL_RELEASE_DIR,'uploaded.json'),JSON.stringify({...configuredSkills,...cached}));}
  await run('scripts/pack-skills.mjs');
  await run('scripts/upload-skills.mjs');
  workerEnv.SKILL_FILES_JSON = await fs.readFile(path.join(workerEnv.SKILL_RELEASE_DIR, 'uploaded.json'), 'utf8');
}
workerEnv.SKILL_FILES_JSON ||= '{}';
let manifest;
try { manifest = JSON.parse(workerEnv.SKILL_FILES_JSON); }
catch { throw new Error('SKILL_FILES_JSON must be valid JSON.'); }
if (!manifest || Array.isArray(manifest) || typeof manifest !== 'object') throw new Error('SKILL_FILES_JSON must be an object.');

const configPath = path.join(root, 'dist/server/wrangler.railway.json');
const config = JSON.parse(await fs.readFile(path.join(root, 'dist/server/wrangler.json'), 'utf8'));
config.vars = {
  ACCESS_MODE: accessMode, APP_ORIGIN: origin.origin,
  AI_ENABLED: process.env.AI_ENABLED || 'true', STORAGE_PERSISTENT: String(persistent),
  AGENT_MODEL: process.env.AGENT_MODEL || 'gpt-6-astra', IMAGE_MODEL: process.env.IMAGE_MODEL || 'gpt-image-2.5-flare',
  APP_COMMIT: /^[a-f0-9]{40}$/i.test(process.env.RAILWAY_GIT_COMMIT_SHA || '') ? process.env.RAILWAY_GIT_COMMIT_SHA : '',
};
if(['127.0.0.1','localhost','[::1]'].includes(origin.hostname)&&process.env.DEV_OPENAI_BASE_URL)config.vars.DEV_OPENAI_BASE_URL=process.env.DEV_OPENAI_BASE_URL;
// Only names are written to disk. Wrangler reads these from the child process
// environment as secret_text bindings, so credentials remain masked in logs.
config.secrets = { required: ['VISITOR_SESSION_SECRET', 'SKILL_FILES_JSON', ...(['OPENAI_API_KEY', 'OPENAI_WEBHOOK_SECRET', 'DATABASE_URL', 'DATABASE_CA_CERT'].filter(name => !!workerEnv[name]))] };
let postgresTunnel;
if (workerEnv.DATABASE_URL) {
  postgresTunnel = await startPostgresTunnel(workerEnv.DATABASE_URL, workerEnv.DATABASE_CA_CERT);
  config.vars.TUXU_POSTGRES_LOCAL_PORT = String(postgresTunnel.port);
  config.d1_databases = [];
}
for (const db of config.d1_databases || []) db.migrations_dir = path.join(root, 'drizzle');
try { await fs.writeFile(configPath, JSON.stringify(config)); }
catch (error) { await postgresTunnel?.close(); throw error; }
const stateDir = path.join(dataDir, 'state');
const wrangler = 'node_modules/wrangler/bin/wrangler.js';
if (!workerEnv.DATABASE_URL) await run(wrangler, ['d1', 'migrations', 'apply', 'DB', '--local', '--config', configPath, '--persist-to', stateDir]);
console.log('TuXu database: ' + (workerEnv.DATABASE_URL ? 'PostgreSQL (tuxu)' : 'local D1') + '; file storage ' + (persistent ? 'persistent volume' : 'ephemeral') + '.');
console.log('TuXu '+accessMode+' workspace: ' + origin.origin + '; AI credential ' + (workerEnv.OPENAI_API_KEY ? 'configured' : 'missing') + '; skill resources ' + Object.keys(manifest).filter(x => x !== '_runtime').length + '/21.');
if (!persistent) console.warn('No persistent file volume is configured. Export projects and results before redeployment; PostgreSQL account and project records remain persistent.');

const child = spawn(process.execPath, [wrangler, 'dev', '--config', configPath, '--local', '--persist-to', stateDir, '--ip', bindIP, '--port', String(port), '--inspector-port', '0', '--log-level', logLevel], { cwd: root, env: workerEnv, stdio: ['ignore', 'inherit', 'inherit'] });
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { child.kill(signal); void postgresTunnel?.close(); });
child.once('error', () => { console.error('Website process could not start.'); process.exitCode = 1; void postgresTunnel?.close(); });
child.once('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); void postgresTunnel?.close(); });
