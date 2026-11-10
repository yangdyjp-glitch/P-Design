import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { build } from 'esbuild';
import { PGlite } from '@electric-sql/pglite';
import { createPgConfig } from '@electric-sql/pglite/node-postgres';
import pg from 'pg';
import { postgresOptions } from '../db/postgres-options.mjs';
import { applyPostgresMigrations } from '../db/migrate-postgres.mjs';
import { importLocalD1 } from '../db/import-local-d1.mjs';

async function bundle(options) {
  const { outputFiles } = await build({ ...options, bundle: true, write: false, platform: 'node', format: 'esm' });
  return import('data:text/javascript;base64,' + Buffer.from(outputFiles[0].text).toString('base64'));
}
const { PostgresDatabase, postgresParameters } = await bundle({ entryPoints: ['db/postgres.ts'] });

async function database() {
  const engine = new PGlite();
  const config = createPgConfig(engine);
  config.types = postgresOptions('postgresql://postgres:test-only@db.example.test/postgres').types;
  const client = new pg.Client(config);
  await client.connect();
  await client.query('BEGIN');
  await applyPostgresMigrations(client);
  await client.query('COMMIT');
  await client.query('SET search_path TO tuxu, pg_catalog');
  return { engine: { async close() { await client.end(); await engine.close(); } }, client, db: new PostgresDatabase(client) };
}

test('database URL validation keeps passwords out of errors and requires TLS', () => {
  const secret = 'a-test-password-with-@:#[]';
  const url = 'postgresql://postgres:' + encodeURIComponent(secret) + '@db.example.test:5432/postgres?sslmode=require';
  const config = postgresOptions(url);
  assert.equal(config.password, secret);
  assert.equal(config.ssl.rejectUnauthorized, false);
  assert.equal(postgresOptions(url, 'test-ca').ssl.rejectUnauthorized, true);
  assert.equal(postgresOptions(url.replace('require', 'verify-full')).ssl.rejectUnauthorized, true);
  assert.equal(config.types.getTypeParser(20)('1794144000000'), 1794144000000);
  assert.throws(() => config.types.getTypeParser(20)('9007199254740992'));
  for (const invalid of [url.replace('require', 'disable'), 'https://example.test', 'postgresql://postgres:[YOUR-PASSWORD]@example.test/postgres']) {
    assert.throws(() => postgresOptions(invalid), error => !error.message.includes(secret) && !error.message.includes(invalid));
  }
  assert.throws(() => postgresOptions('postgresql://postgres:test@aws-0-example.pooler.supabase.com:6543/postgres?sslmode=require'), { code:'USE_SESSION_POOLER' });
});

test('SQL parameters preserve literal question marks, comments and quoted strings', () => {
  const translated = postgresParameters("SELECT ?, '?', 'it''s ?', \"?\", $$?$$, $tag$?$tag$ /* ? /* ? */ */ -- ?\nWHERE id=?");
  assert.equal(translated.count, 2);
  assert.equal(translated.text, "SELECT $1, '?', 'it''s ?', \"?\", $$?$$, $tag$?$tag$ /* ? /* ? */ */ -- ?\nWHERE id=$2");
});

test('simultaneous request contexts cannot share their database connection', async () => {
  const {currentDatabase,withDatabaseContext,databaseProvider}=await bundle({entryPoints:['db/context.ts']});
  assert.equal(databaseProvider(),'d1');
  const first={database:{name:'first'},client:{}},second={database:{name:'second'},client:{}};
  await Promise.all([first,second].map(context=>withDatabaseContext(context,async()=>{
    await new Promise(resolve=>setTimeout(resolve,1));
    assert.equal(currentDatabase(),context);assert.equal(databaseProvider(),'postgresql');
  })));
  assert.equal(currentDatabase(),undefined);
});

test('real PostgreSQL engine applies migrations once and rolls a failed batch back', async () => {
  const { engine, client, db } = await database();
  try {
    await client.query('BEGIN');
    assert.deepEqual(await applyPostgresMigrations(client), []);
    await client.query('COMMIT');
    const now = Date.now();
    const policies=await client.query("SELECT relrowsecurity FROM pg_class JOIN pg_namespace ON pg_namespace.oid=pg_class.relnamespace WHERE nspname='tuxu' AND relname IN ('projects','assets','jobs','settings','webhook_inbox')");
    assert.equal(policies.rows.length,5);assert(policies.rows.every(row=>row.relrowsecurity));
    await db.prepare('INSERT INTO projects(user_id,id,name,data,created_at,updated_at) VALUES(?,?,?,?,?,?)').bind('owner', 'project', '中文 ? 项目', '{}', now, now).run();
    const row = await db.prepare('SELECT * FROM projects WHERE user_id=? AND id=?').bind('owner', 'project').first();
    assert.equal(Number(row.created_at), now);
    assert.equal(row.revision, 1);
    const updated = await db.prepare('UPDATE projects SET revision=revision+1 WHERE id=? AND revision=?').bind('project',1).run();
    assert.equal(updated.meta.changes, 1);
    assert.equal((await db.prepare('UPDATE projects SET revision=revision+1 WHERE id=? AND revision=?').bind('project',1).run()).meta.changes,0);
    await assert.rejects(db.batch([
      db.prepare('INSERT INTO settings(key,value) VALUES(?,?)').bind('atomic','first'),
      db.prepare('INSERT INTO settings(key,value) VALUES(?,?)').bind('atomic','duplicate'),
    ]));
    assert.equal(await db.prepare('SELECT * FROM settings WHERE key=?').bind('atomic').first(), null);
    await db.batch([db.prepare('INSERT INTO settings(key,value) VALUES(?,?)').bind('atomic','committed')]);
    assert.equal(await db.prepare('SELECT value FROM settings WHERE key=?').bind('atomic').first('value'),'committed');
    await assert.rejects(db.prepare('SELECT ?').all(), /parameter count/);
    await client.query("UPDATE tuxu.__migrations SET checksum='changed'");
    await client.query('BEGIN');
    await assert.rejects(applyPostgresMigrations(client), {code:'MIGRATION_CHECKSUM_CHANGED'});
    await client.query('ROLLBACK');
  } finally { await engine.close(); }
});

test('local D1 import preserves ownership and timestamps, resumes safely, and refuses to merge data', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tuxu-postgres-test-'));
  const state = path.join(directory, 'state');
  const sourceDirectory = path.join(state, 'v3', 'd1', 'miniflare-D1DatabaseObject');
  await fs.mkdir(sourceDirectory, { recursive: true });
  const filename = path.join(sourceDirectory, 'test.sqlite');
  const sqlite = new DatabaseSync(filename);
  for (const migration of ['0000_peaceful_sleeper.sql','0001_clammy_moondragon.sql','0002_whole_pandemic.sql']) sqlite.exec(await fs.readFile('drizzle/'+migration,'utf8'));
  const now = Date.now();
  sqlite.prepare('INSERT INTO projects(user_id,id,name,data,revision,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('visitor-original','kept-project','保留的项目','{}',7,now,now);
  sqlite.close();
  const { engine, client } = await database();
  try {
    await client.query('BEGIN');
    const imported = await importLocalD1(client,state);
    await client.query('COMMIT');
    assert.equal(imported.imported.projects,1);
    const project = (await client.query('SELECT * FROM tuxu.projects')).rows[0];
    assert.equal(project.user_id,'visitor-original');
    assert.equal(project.revision,7);
    assert.equal(Number(project.created_at),now);
    assert.deepEqual(await importLocalD1(client,state),{skipped:true});
    await client.query("DELETE FROM tuxu.settings WHERE key='__railway_local_d1_import_v1'");
    await client.query('BEGIN');
    await assert.rejects(importLocalD1(client,state),/already contains application data/);
    await client.query('ROLLBACK');
    assert.equal((await client.query('SELECT id FROM tuxu.projects')).rows.length,1);
    const untouched = new DatabaseSync(filename,{readOnly:true});
    assert.equal(untouched.prepare('SELECT revision FROM projects').get().revision,7);
    untouched.close();
  } finally {
    await engine.close();
    await fs.rm(directory,{recursive:true,force:true});
  }
});

const fixturePlugin = { name:'postgres-api-fixture', setup(build) {
  build.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'fixture'}));
  build.onResolve({filter:/chatgpt-auth$|^test-auth$/},()=>({path:'auth',namespace:'fixture'}));
  build.onLoad({filter:/.*/,namespace:'fixture'},args=>({loader:'js',contents:args.path==='env'?'export const env={};':`import {AsyncLocalStorage} from 'node:async_hooks'; export const identities=new AsyncLocalStorage(); export async function getChatGPTUser(){return identities.getStore()||null;}`}));
  build.onResolve({filter:/\?raw$/},args=>({path:path.resolve(args.resolveDir,args.path.slice(0,-4)),namespace:'raw'}));
  build.onLoad({filter:/.*/,namespace:'raw'},async args=>({loader:'text',contents:await fs.readFile(args.path,'utf8')}));
} };

test('project, asset, quota and webhook SQL work against PostgreSQL with visitor isolation', async () => {
  const api = await bundle({stdin:{contents:`
    import {handle} from './server/routes';
    import {withDatabaseContext} from './db/context';
    import {identities} from 'test-auth';
    export {env} from 'cloudflare:workers';
    export {skills} from './server/skills';
    export const request=(req,db,user)=>identities.run(user,()=>withDatabaseContext({database:db,client:null},()=>handle(req)));
  `,resolveDir:process.cwd(),loader:'ts'},plugins:[fixturePlugin]});
  const { engine, client, db } = await database();
  const files = new Map();
  Object.assign(api.env,{ACCESS_MODE:'visitor',STORAGE_PERSISTENT:'true',OPENAI_API_KEY:'test-only-not-a-real-api-key',SKILL_FILES_JSON:JSON.stringify(Object.fromEntries([...api.skills.map(s=>s.id),'_runtime'].map(id=>[id,{fileId:'test-file-'+id}]))),BUCKET:{async put(key,bytes){files.set(key,Uint8Array.from(bytes));},async get(key){const bytes=files.get(key);return bytes?{body:bytes,arrayBuffer:async()=>bytes.buffer}:null;},async delete(key){files.delete(key);}}});
  const user={userId:'visitor-test-owner',email:'visitor@example.invalid',displayName:'Test'},other={...user,userId:'visitor-test-other'};
  async function call(endpoint,method='GET',data,as=user,headers={}) {
    const response=await api.request(new Request('https://example.test/api/'+endpoint,{method,headers:{Origin:'https://example.test','Content-Type':'application/json',...headers},body:data===undefined?undefined:data instanceof Uint8Array?data:JSON.stringify(data)}),db,as);
    return {status:response.status,value:(response.headers.get('content-type')||'').includes('json')?await response.json():new Uint8Array(await response.arrayBuffer())};
  }
  try {
    const health=await call('health');
    assert.equal(health.status,200);assert.equal(health.value.databaseProvider,'postgresql');assert.equal(health.value.databaseConnected,true);
    const project={id:'postgres-project',name:'中文测试项目',pages:[{id:'page-1',copy:[{id:'title',text:'原文保持不变'}]}],assets:[]};
    assert.equal((await call('projects/'+project.id,'PUT',{project,revision:0})).status,200);
    assert.equal((await call('projects')).value.projects[0].name,project.name);
    assert.equal((await call('projects','GET',undefined,other)).value.projects.length,0);
    assert.equal((await call('projects/'+project.id,'PUT',{project,revision:0})).status,409);
    const png=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/m8AAAAASUVORK5CYII=','base64'));
    const asset=await call('assets?projectId='+project.id,'POST',png,user,{'Content-Type':'image/png'});
    assert.equal(asset.status,200);assert.deepEqual((await call('files/'+asset.value.id)).value,png);
    assert.equal((await call('files/'+asset.value.id,'GET',undefined,other)).status,404);
    const job={projectId:project.id,requestId:'postgres-job',kind:'write',prompt:'test',pageIds:['page-1'],revision:1};
    const queued=await call('jobs','POST',job);assert.equal(queued.status,201);
    assert.equal((await call('jobs','POST',job)).value.job.id,queued.value.job.id);
    assert.equal((await call('jobs','POST',{...job,requestId:'second-job'})).status,429);
    assert.equal((await call('jobs/'+queued.value.job.id+'/cancel','POST',{})).value.job.status,'cancelled');
    await client.query("UPDATE tuxu.jobs SET image_state=$1 WHERE id=$2",[JSON.stringify({responseId:'response-test'}),queued.value.job.id]);
    assert.equal((await db.prepare("SELECT id FROM jobs WHERE image_state::jsonb->>'responseId'=?").bind('response-test').first()).id,queued.value.job.id);
    const design=await call('jobs','POST',{...job,requestId:'visual-layout',kind:'design',workflow:'automatic',scope:'page',visualDesignPolicy:{version:99,requiredSkills:[]}});assert.equal(design.status,201);assert.equal(design.value.job.visualDesignRequired,true);assert.equal(design.value.job.tasteRequired,true);assert.equal(design.value.job.visualStage,'composing');
    const designRow=await db.prepare('SELECT snapshot FROM jobs WHERE id=?').bind(design.value.job.id).first(),snapshot=JSON.parse(designRow.snapshot);assert.equal(snapshot.visualDesignPolicy.version,1);assert.deepEqual(snapshot.visualDesignPolicy.requiredSkills,['xiaohongshu-design','victor-design','xhs-poster-composition','xhs-design-polish','taste-skill']);assert.equal(snapshot.scope,'page');assert.equal(snapshot.paginationMode,'fixed');
    snapshot._visualReview={responseId:'private-visual-review',phase:'pending'};await db.prepare('UPDATE jobs SET snapshot=? WHERE id=?').bind(JSON.stringify(snapshot),design.value.job.id).run();assert.equal((await db.prepare("SELECT id FROM jobs WHERE image_state::jsonb->>'responseId'=? OR snapshot::jsonb#>>'{_visualReview,responseId}'=?").bind('private-visual-review','private-visual-review').first()).id,design.value.job.id);assert(!JSON.stringify((await call('jobs/'+design.value.job.id)).value).includes('private-visual-review'));
    await db.prepare('UPDATE jobs SET snapshot=? WHERE id=?').bind(JSON.stringify({...snapshot,_visualReview:undefined}),design.value.job.id).run();assert.equal((await call('jobs/'+design.value.job.id+'/cancel','POST',{})).value.job.status,'cancelled');
    assert.equal((await call('projects/'+project.id,'DELETE',undefined,other)).status,404);
    assert.equal((await call('projects/'+project.id,'DELETE')).status,200);
    assert.equal((await call('projects')).value.projects.length,0);assert.equal(files.size,0);
  } finally { await engine.close(); }
});
