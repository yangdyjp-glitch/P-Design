import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';
import {PGlite} from '@electric-sql/pglite';
import {createPgConfig} from '@electric-sql/pglite/node-postgres';
import pg from 'pg';
import {applyPostgresMigrations} from '../db/migrate-postgres.mjs';
import {postgresOptions} from '../db/postgres-options.mjs';
import {pbkdf2Sync,randomBytes} from 'node:crypto';
import os from 'node:os';
import {importLocalD1} from '../db/import-local-d1.mjs';
const salt=randomBytes(16),testBootstrap=['pbkdf2-sha256',600000,salt.toString('base64url'),pbkdf2Sync('test-admin-password',salt,600000,32,'sha256').toString('base64url')].join('$');

const plugin={name:'account-fixture',setup(build){
 build.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'fixture'}));
 build.onResolve({filter:/chatgpt-auth$|^test-auth$/},()=>({path:'auth',namespace:'fixture'}));
 build.onResolve({filter:/account-bootstrap$/},()=>({path:'bootstrap',namespace:'fixture'}));
 build.onLoad({filter:/.*/,namespace:'fixture'},args=>({loader:'js',contents:args.path==='env'?'export const env={};':args.path==='bootstrap'?'export const initialAdminHash='+JSON.stringify(testBootstrap)+';':`import {AsyncLocalStorage} from 'node:async_hooks';export const identities=new AsyncLocalStorage();export async function getChatGPTUser(){return identities.getStore()||null;}`}));
 build.onResolve({filter:/\?raw$/},args=>({path:path.resolve(args.resolveDir,args.path.slice(0,-4)),namespace:'raw'}));
 build.onLoad({filter:/.*/,namespace:'raw'},async args=>({loader:'text',contents:await fs.readFile(args.path,'utf8')}));
}};
const {outputFiles}=await build({stdin:{contents:`
 import {accountContext} from './server/accounts';import {handle} from './server/routes';
 import {withDatabaseContext} from './db/context';import {identities} from 'test-auth';
 export {env} from 'cloudflare:workers';export {skills} from './server/skills';
 export {PostgresDatabase} from './db/postgres';export {passwordHash,passwordMatches} from './server/accounts';
 export function request(req,db,postgres){return withDatabaseContext(postgres?{database:db,client:null}:undefined,async()=>{
   const {env}=await import('cloudflare:workers');env.DB=db;
   const context=await accountContext(req,{...env,DB:db});if(context instanceof Response)return context;
   const normalized=context?.request||req,id=normalized.headers.get('oai-authenticated-user-id');
   const user=id?{userId:id,email:normalized.headers.get('oai-authenticated-user-email'),displayName:decodeURIComponent(normalized.headers.get('oai-authenticated-user-full-name')||'')}:null;
   return identities.run(user,()=>handle(normalized));
 });}
`,resolveDir:process.cwd(),loader:'ts'},plugins:[plugin],bundle:true,write:false,platform:'node',format:'esm'});
const api=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));

async function database(postgres){
 if(postgres){const engine=new PGlite(),config=createPgConfig(engine);config.types=postgresOptions('postgresql://postgres:test@db.example.test/postgres').types;const client=new pg.Client(config);await client.connect();await client.query('BEGIN');await applyPostgresMigrations(client);await client.query('COMMIT');await client.query('SET search_path TO tuxu, pg_catalog');return {client,db:new api.PostgresDatabase(client),close:async()=>{await client.end();await engine.close();}};}
 const sqlite=new DatabaseSync(':memory:');for(const name of (await fs.readdir('drizzle')).filter(n=>n.endsWith('.sql')).sort())sqlite.exec(await fs.readFile('drizzle/'+name,'utf8'));
 const db={prepare(sql){return {bind(...values){return {...this,values};},values:[],async all(){const results=sqlite.prepare(sql).all(...this.values);return {results,success:true,meta:{changes:sqlite.prepare('SELECT changes() AS n').get().n}};},async first(column){const row=(await this.all()).results[0]||null;return column&&row?row[column]:row;},async run(){return this.all();}};},async batch(statements){sqlite.exec('BEGIN');try{const result=[];for(const statement of statements)result.push(await statement.run());sqlite.exec('COMMIT');return result;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};return {db,close:()=>sqlite.close()};
}

test('password hashes use independent salts and reject incorrect and malformed input',async()=>{
 const one=await api.passwordHash('a-test-password'),two=await api.passwordHash('a-test-password');assert.notEqual(one,two);assert(!one.includes('a-test-password'));assert(await api.passwordMatches('a-test-password',one));assert(!await api.passwordMatches('wrong-password',one));assert(!await api.passwordMatches('a'.repeat(129),one));assert(!await api.passwordMatches('a-test-password','broken'));
});

test('moving a local D1 workspace to PostgreSQL retains account hashes and sessions',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'tuxu-account-import-')),state=path.join(directory,'state'),source=path.join(state,'v3','d1','miniflare-D1DatabaseObject');await fs.mkdir(source,{recursive:true});
 const sqlite=new DatabaseSync(path.join(source,'account-test.sqlite'));for(const name of (await fs.readdir('drizzle')).filter(n=>n.endsWith('.sql')).sort())sqlite.exec(await fs.readFile('drizzle/'+name,'utf8'));
 const hash=await api.passwordHash('migration-test-password'),now=Date.now();sqlite.prepare('INSERT INTO accounts(id,username,display_name,password_hash,role,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('account_migrated','migrated_user','迁移账户',hash,'user',now,now);sqlite.prepare('INSERT INTO account_sessions(token_hash,account_id,expires_at,created_at) VALUES(?,?,?,?)').run('0'.repeat(64),'account_migrated',now+10000,now);sqlite.close();
 const {client,db,close}=await database(true);
 try{await client.query('BEGIN');const result=await importLocalD1(client,state);await client.query('COMMIT');assert.equal(result.imported.accounts,1);assert.equal(result.imported.account_sessions,1);assert.equal((await db.prepare('SELECT password_hash FROM accounts WHERE id=?').bind('account_migrated').first()).password_hash,hash);assert.deepEqual(await importLocalD1(client,state),{skipped:true});}
 finally{await close();assert(path.resolve(directory).startsWith(path.resolve(os.tmpdir())+path.sep));await fs.rm(directory,{recursive:true,force:true});}
});

for(const postgres of [false,true])test((postgres?'PostgreSQL':'SQLite')+': login, administration, isolation, revocation and bootstrap persistence',async()=>{
 const {db,close}=await database(postgres),objects=new Map();
 Object.assign(api.env,{ACCESS_MODE:'accounts',APP_ORIGIN:'https://example.test',OPENAI_API_KEY:'test-only-no-provider-calls',AI_ENABLED:'true',SKILL_FILES_JSON:JSON.stringify(Object.fromEntries([...api.skills.map(skill=>skill.id),'_runtime'].map(id=>[id,{fileId:'test-file-'+id}]))),BUCKET:{async put(key,value){objects.set(key,Uint8Array.from(value));},async get(key){return objects.has(key)?{body:objects.get(key)}:null;},async delete(key){objects.delete(key);}}});
 async function call(endpoint,{method='GET',body,user,headers={}}={}){const response=await api.request(new Request('http://127.0.0.1:8787/api/'+endpoint,{method,headers:{Origin:'https://example.test','Content-Type':'application/json',...(user?{Cookie:user.cookie,'X-Tuxu-Account':user.id}:{}),...headers},body:body===undefined?undefined:body instanceof Uint8Array?body:JSON.stringify(body)}),db,postgres);return {status:response.status,headers:response.headers,value:(response.headers.get('content-type')||'').includes('json')?await response.json():new Uint8Array(await response.arrayBuffer())};}
 async function login(username,password){const result=await call('auth/login',{method:'POST',body:{username,password}});assert.equal(result.status,200,JSON.stringify(result.value));return {id:result.value.user.id,cookie:result.headers.get('set-cookie').split(';')[0],result};}
 try{
  assert.equal((await call('health')).value.accessMode,'accounts');assert.equal((await call('session')).value.user,null);
  assert.equal((await call('projects',{headers:{'oai-authenticated-user-id':'account_admin','oai-authenticated-user-email':'admin@accounts.invalid'}})).status,401);
  assert.equal((await call('auth/login',{method:'POST',body:{username:'admin',password:'test-admin-password'},headers:{Origin:'https://attacker.test'}})).status,403);
  assert.equal((await call('auth/login',{method:'POST',body:{username:'admin',password:'incorrect'}})).status,401);
  const admin=await login(' ADMIN ','test-admin-password');assert.match(admin.result.headers.get('set-cookie'),/^__Host-tuxu-account=.+; Path=\/; HttpOnly; SameSite=Lax; Max-Age=604800; Secure$/);
  const session=await call('session',{user:admin});assert.equal(session.value.isAdmin,true);assert.equal(session.value.user.username,'admin');assert.equal(session.value.user.email,null);
  assert.equal((await call('accounts',{method:'POST',user:admin,body:{username:'wrong name',password:'valid-password'}})).status,400);
  assert.equal((await call('accounts',{method:'POST',user:admin,body:{username:'short',password:'short'}})).status,400);
  for(const name of ['designer_one','designer_two']){const created=await call('accounts',{method:'POST',user:admin,body:{username:name,name:'设计师 '+name,password:'test-password-123',role:'admin'}});assert.equal(created.status,201);assert.equal(created.value.account.role,'user');assert(!JSON.stringify(created.value).includes('password'));const stored=await db.prepare('SELECT password_hash FROM accounts WHERE username=?').bind(name).first();assert.notEqual(stored.password_hash,'test-password-123');}
  assert.equal((await call('accounts',{method:'POST',user:admin,body:{username:'DESIGNER_ONE',password:'test-password-123'}})).status,409);
  const a=await login('designer_one','test-password-123'),b=await login('designer_two','test-password-123');
  assert.equal((await call('accounts',{user:a})).status,403);assert.equal((await call('accounts',{method:'POST',user:a,body:{username:'forged',password:'test-password-123'}})).status,403);
  assert.equal((await call('session',{user:a,headers:{'oai-authenticated-user-id':admin.id,'oai-authenticated-user-email':'admin@accounts.invalid','oai-authenticated-user-admin':'true'}})).value.isAdmin,false);
  const project={id:'shared-project-id',name:'Only designer one',pages:[{id:'page-one',copy:[{id:'title',text:'账户一的私有文案'}]}],assets:[]};
  assert.equal((await call('projects/'+project.id,{method:'PUT',user:a,body:{project,revision:0}})).status,200);
  assert.equal((await call('projects',{user:b})).value.projects.length,0);assert.equal((await call('projects',{user:admin})).value.projects.length,0);
  assert.equal((await call('projects/'+project.id,{method:'PUT',user:b,body:{project:{...project,name:'Only designer two'},revision:0}})).status,200);
  assert.equal((await call('projects',{user:a})).value.projects[0].name,project.name);assert.equal((await call('projects',{user:b})).value.projects[0].name,'Only designer two');
  const stale=await call('projects/stale',{method:'PUT',user:b,headers:{'X-Tuxu-Account':a.id},body:{project:{...project,id:'stale'},revision:0}});assert.equal(stale.status,401);assert.equal(stale.value.code,'AUTH_CHANGED');
  assert.equal((await call('projects/missing-header',{method:'PUT',user:b,headers:{'X-Tuxu-Account':''},body:{project:{...project,id:'missing-header'},revision:0}})).status,401);
  const png=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/m8AAAAASUVORK5CYII=','base64'));
  const asset=await call('assets?projectId='+project.id+'&id=private-photo',{method:'POST',user:a,body:png,headers:{'Content-Type':'image/png'}});assert.equal(asset.status,200);assert.equal((await call('files/private-photo',{user:a})).status,200);assert.equal((await call('files/private-photo',{user:b})).status,404);assert.equal((await call('files/private-photo',{user:admin})).status,404);
  assert.equal((await call('assets?projectId='+project.id+'&id=private-photo',{method:'POST',user:b,body:png,headers:{'Content-Type':'image/png'}})).status,403);
  assert.equal((await call('projects/'+project.id,{method:'PUT',user:b,body:{project:{...project,assets:[asset.value]},revision:1}})).status,403);
  const queued=await call('jobs',{method:'POST',user:a,body:{projectId:project.id,revision:1,requestId:'test-own-job',kind:'write',prompt:'只测试归属，不调用外部 AI',pageIds:['page-one']}});assert.equal(queued.status,201);
  assert.equal((await call('jobs',{user:b})).value.jobs.length,0);assert.equal((await call('jobs/'+queued.value.job.id,{user:b})).status,404);assert.equal((await call('jobs/'+queued.value.job.id+'/cancel',{method:'POST',body:{},user:admin})).status,404);
  assert.equal((await call('jobs/'+queued.value.job.id+'/artifacts/fake',{user:b})).status,404);assert.equal((await call('jobs/'+queued.value.job.id+'/cancel',{method:'POST',body:{},user:a})).value.job.status,'cancelled');
  const disposable={...project,id:'delete-fixture',name:'Disposable deletion fixture'};
  await call('projects/'+disposable.id,{method:'PUT',user:a,body:{project:disposable,revision:0}});
  const doomed=await call('assets?projectId='+disposable.id+'&id=delete-photo',{method:'POST',user:a,body:png,headers:{'Content-Type':'image/png'}});assert.equal(doomed.status,200);
  const active=await call('jobs',{method:'POST',user:a,body:{projectId:disposable.id,revision:1,requestId:'delete-job',kind:'write',prompt:'Disposable queued job, no provider execution',pageIds:['page-one']}});assert.equal(active.status,201);
  for(const user of [b,admin])assert.equal((await call('projects/'+disposable.id,{method:'DELETE',user})).status,404);
  assert.equal((await call('projects/'+disposable.id,{method:'DELETE',user:a})).status,200);assert.equal((await call('files/delete-photo',{user:a})).status,404);assert.equal((await call('jobs/'+active.value.job.id,{user:a})).value.job.status,'cancelled');
  assert.equal((await call('projects',{user:a})).value.projects[0].id,project.id);assert.equal((await call('projects',{user:b})).value.projects[0].name,'Only designer two');
  assert.equal((await call('projects/'+disposable.id,{method:'PUT',user:a,body:{project:disposable,revision:1}})).status,409);
  await call('assets?projectId=unsaved-fixture&id=orphan-photo',{method:'POST',user:a,body:png,headers:{'Content-Type':'image/png'}});
  assert.equal((await call('projects/unsaved-fixture',{method:'DELETE',user:b})).status,404);assert.equal((await call('projects/unsaved-fixture',{method:'DELETE',user:a})).status,200);assert.equal((await call('files/orphan-photo',{user:a})).status,404);
  const extra=await login('designer_one','test-password-123');assert.equal((await call('accounts/'+a.id,{method:'PATCH',user:admin,body:{disabled:true}})).status,200);assert.equal((await call('projects',{user:a})).status,401);assert.equal((await call('projects',{user:extra})).status,401);
  assert.equal((await call('auth/login',{method:'POST',body:{username:'designer_one',password:'test-password-123'}})).status,401);
  assert.equal((await call('accounts/'+admin.id,{method:'PATCH',user:admin,body:{disabled:true}})).status,404);
  await call('accounts/'+a.id,{method:'PATCH',user:admin,body:{disabled:false}});const resumed=await login('designer_one','test-password-123');assert.equal((await call('projects',{user:resumed})).value.projects[0].name,project.name);
  assert.equal((await call('auth/password',{method:'POST',user:resumed,body:{currentPassword:'incorrect',password:'a-new-test-password'}})).status,400);
  assert.equal((await call('auth/password',{method:'POST',user:resumed,body:{currentPassword:'test-password-123',password:'a-new-test-password'}})).status,200);assert.equal((await call('projects',{user:resumed})).status,401);
  const changed=await login('designer_one','a-new-test-password');assert.equal(changed.id,a.id);
  const loggedOut=await call('auth/logout',{method:'POST',user:changed,body:{}});assert.equal(loggedOut.status,200);assert.match(loggedOut.headers.get('set-cookie'),/Max-Age=0/);assert.equal((await call('projects',{user:changed})).status,401);
  // Re-running the bootstrap via any login must not reset an updated admin password.
  await call('auth/password',{method:'POST',user:admin,body:{currentPassword:'test-admin-password',password:'changed-admin-password'}});await login('designer_two','test-password-123');assert.equal((await call('auth/login',{method:'POST',body:{username:'admin',password:'test-admin-password'}})).status,401);await login('admin','changed-admin-password');
  for(let index=0;index<10;index++)assert.equal((await call('auth/login',{method:'POST',body:{username:'missing-user',password:'no-match'}})).status,401);
  assert.equal((await call('auth/login',{method:'POST',body:{username:'missing-user',password:'no-match'}})).status,429);
  const expired=await login('designer_two','test-password-123');await db.prepare('UPDATE account_sessions SET expires_at=0 WHERE account_id=?').bind(b.id).run();assert.equal((await call('projects',{user:expired})).status,401);
  const malformed={...b,cookie:b.cookie+'; '+b.cookie};assert.equal((await call('projects',{user:malformed})).status,401);
  await db.prepare('UPDATE login_attempts SET attempts=180,window_start=? WHERE bucket=?').bind(Date.now(),'global').run();const before=(await db.prepare('SELECT count(*) AS n FROM login_attempts').first()).n;
  assert.equal((await call('auth/login',{method:'POST',body:{username:'never-persist-this-name',password:'no-match'}})).status,429);assert.equal((await db.prepare('SELECT count(*) AS n FROM login_attempts').first()).n,before);
 }finally{await close();}
});
