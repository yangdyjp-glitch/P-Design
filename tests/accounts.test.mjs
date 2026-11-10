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
import {copyHash} from '../src/copy-workflow.js';
import {parseManuscript} from '../src/engine.js';
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

for(const postgres of [false,true])test((postgres?'PostgreSQL':'SQLite')+': copy confirmation gates images and design, preserves pages and cannot cross accounts',async()=>{
 const {db,close}=await database(postgres),objects=new Map();Object.assign(api.env,{ACCESS_MODE:'accounts',APP_ORIGIN:'https://example.test',OPENAI_API_KEY:'test-only-no-provider-calls',AI_ENABLED:'true',SKILL_FILES_JSON:JSON.stringify(Object.fromEntries([...api.skills.map(skill=>skill.id),'_runtime'].map(id=>[id,{fileId:'test-'+id}]))),BUCKET:{async put(key,value){objects.set(key,Uint8Array.from(value));},async get(key){return objects.has(key)?{body:objects.get(key)}:null;},async delete(key){objects.delete(key);}}});
 async function call(endpoint,{method='GET',body,user,headers={}}={}){const response=await api.request(new Request('http://127.0.0.1:8787/api/'+endpoint,{method,headers:{Origin:'https://example.test','Content-Type':'application/json',...(user?{Cookie:user.cookie,'X-Tuxu-Account':user.id}:{}),...headers},body:body===undefined?undefined:body instanceof Uint8Array?body:JSON.stringify(body)}),db,postgres);return {status:response.status,headers:response.headers,value:await response.json()};}
 async function login(username,password){const r=await call('auth/login',{method:'POST',body:{username,password}});assert.equal(r.status,200);return {id:r.value.user.id,cookie:r.headers.get('set-cookie').split(';')[0]};}
 const source='（1P）周末阅读小组\n周六14点至16点共读，每组最多8人。\n（2P）参与方式\n每次30元。首次可旁听，需预约。不承诺学习成绩。',text='周末共读两小时\n周六14点至16点，每组最多8人。\n\n---\n\n怎样参与\n每次30元。首次可旁听，需预约。不承诺学习成绩。',png=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/m8AAAAASUVORK5CYII=','base64'));
 try{
  const a=await login('admin','test-admin-password');await call('accounts',{method:'POST',user:a,body:{username:'copy_other',name:'另一个账户',password:'test-copy-password'}});const b=await login('copy_other','test-copy-password');
  const capabilities=(await call('session',{user:a})).value.capabilities;assert.equal(capabilities.skills.length,21);assert.equal(capabilities.copyOptimization.considered,6);
  let project={id:'copy-project',name:'文案准备',pages:parseManuscript(source,{preserveText:true}),assets:[],copyFlow:{version:1,phase:'copy',sourceText:source,draftText:'',jobId:null,proposalJobId:null,confirmation:null}},revision=0;
  async function save(next=project){const saved=await call('projects/'+project.id,{method:'PUT',user:a,body:{project:next,revision}});assert.equal(saved.status,200,JSON.stringify(saved.value));revision=saved.value.revision;project=(await call('projects',{user:a})).value.projects.find(p=>p.id===project.id);return saved;}
  await save();const forged={...project,copyFlow:{...project.copyFlow,phase:'design',confirmation:{jobId:'fake',confirmedAt:Date.now()}}};await save(forged);assert.equal(project.copyFlow.phase,'copy');assert.equal(project.copyFlow.confirmation,null);
  assert.equal((await call('projects/'+project.id,{method:'PUT',user:a,body:{project:{...project,copyFlow:undefined},revision}})).status,400);
  assert.equal((await call('assets?projectId='+project.id+'&id=too-early',{method:'POST',user:a,body:png,headers:{'Content-Type':'image/png'}})).status,409);
  const designBody=()=>({projectId:project.id,revision,requestId:'early-design',kind:'design',workflow:'automatic',prompt:'设计文案',pageIds:project.pages.map(p=>p.id)});assert.equal((await call('jobs',{method:'POST',user:a,body:designBody()})).status,409);
  assert.equal((await call('jobs',{method:'POST',user:b,body:{...designBody(),kind:'copy',requestId:'outside'}})).status,404);
  const created=await call('jobs',{method:'POST',user:a,body:{...designBody(),kind:'copy',requestId:'copy-request'}});assert.equal(created.status,201,JSON.stringify(created.value));const job=created.value.job;assert.equal(job.kind,'copy');assert.equal(job.copyOptimizationRequired,true);assert.equal(job.skillIds.length,7);const snapshot=JSON.parse((await db.prepare('SELECT snapshot FROM jobs WHERE id=?').bind(job.id).first()).snapshot);assert.equal(snapshot.copyOptimizationPolicy.paginationMode,'fixed');assert.equal(snapshot.copyOptimizationPolicy.sourcePages,2);assert.deepEqual(snapshot.assets,[]);
  assert.equal((await call('jobs',{method:'POST',user:a,body:{...designBody(),kind:'copy',requestId:'copy-request'}})).value.job.id,job.id);
  const confirm=(textValue=text,user=a)=>call('projects/'+project.id+'/confirm-copy',{method:'POST',user,body:{revision,jobId:job.id,text:textValue}});assert.equal((await confirm()).status,409);
  const result={summary:'优化稿',manuscript:text,usedSkills:['xhs-writer','copywriting','copy-editing'],pages:[],copyReview:{version:1,status:'passed',independent:true,jobId:job.id,sourceHash:await copyHash(source),manuscriptHash:await copyHash(text)}};await db.prepare("UPDATE jobs SET status='completed',result=? WHERE id=?").bind(JSON.stringify(result),job.id).run();
  assert.equal((await call('projects/'+project.id,{method:'PUT',user:b,body:{project:{...project,copyFlow:{...project.copyFlow,phase:'copy'}},revision:0}})).status,200);assert.equal((await confirm(text,b)).status,409);
  assert.equal((await confirm('把两页错误地合为一页')).status,400);
  await save({...project,copyFlow:{...project.copyFlow,sourceText:source+'\n新条件'}});assert.equal((await confirm()).status,409);await save({...project,copyFlow:{...project.copyFlow,sourceText:source}});
  const edited=text.replace('怎样参与','参与方式与预约');const confirmed=await confirm(edited);assert.equal(confirmed.status,200,JSON.stringify(confirmed.value));project=confirmed.value.project;revision=confirmed.value.revision;assert.equal(project.copyFlow.phase,'assets');assert.equal(project.copyFlow.confirmation.manuallyEdited,true);assert.equal(project.pages.length,2);assert.equal(project.paginationMode,'fixed');
  const asset=await call('assets?projectId='+project.id+'&id=after-confirm',{method:'POST',user:a,body:png,headers:{'Content-Type':'image/png'}});assert.equal(asset.status,200);await save({...project,assets:[asset.value],stylePresetId:'preset-1',copyFlow:{...project.copyFlow,phase:'copy',confirmation:null}});assert.equal(project.assets.length,1);assert.equal(project.stylePresetId,'preset-1');assert.equal(project.copyFlow.phase,'copy');
  const reconfirmed=await confirm(edited);assert.equal(reconfirmed.status,200);project=reconfirmed.value.project;revision=reconfirmed.value.revision;assert.equal(project.assets[0].id,'after-confirm');assert.equal(project.stylePresetId,'preset-1');
  await save({...project,copyFlow:{...project.copyFlow,phase:'design',confirmation:{fake:true}}});assert.equal(project.copyFlow.confirmation.jobId,job.id);const design=await call('jobs',{method:'POST',user:a,body:{...designBody(),requestId:'confirmed-design'}});assert.equal(design.status,201,JSON.stringify(design.value));const designSnapshot=JSON.parse((await db.prepare('SELECT snapshot FROM jobs WHERE id=?').bind(design.value.job.id).first()).snapshot);assert.equal(designSnapshot.paginationMode,'fixed');assert.equal(designSnapshot.pages.length,2);assert.equal(designSnapshot.imageMode,'upload');assert.equal(designSnapshot.visualDesignPolicy.specialistRouting.catalog.length,10);assert.equal(design.value.job.skillIds.length,15);await call('jobs/'+design.value.job.id+'/cancel',{method:'POST',user:a,body:{}});
  const legacy={id:'existing-work',name:'既有项目',pages:parseManuscript('既有项目\n无需重新优化',{preserveText:true}),assets:[]};assert.equal((await call('projects/'+legacy.id,{method:'PUT',user:a,body:{project:legacy,revision:0}})).status,200);const old=await call('jobs',{method:'POST',user:a,body:{projectId:legacy.id,revision:1,requestId:'existing-job',kind:'design',prompt:'继续既有设计',pageIds:[legacy.pages[0].id]}});assert.equal(old.status,201);await call('jobs/'+old.value.job.id+'/cancel',{method:'POST',user:a,body:{}});
 }finally{await close();}
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
  const guest=await call('workspace',{headers:{'oai-authenticated-user-id':'account_admin','oai-authenticated-user-email':'admin@accounts.invalid'}});assert.equal(guest.status,200);assert.equal(guest.value.session.user,null);assert.deepEqual(guest.value.projects,[]);assert.deepEqual(guest.value.jobs,[]);
  assert.equal((await call('projects',{headers:{'oai-authenticated-user-id':'account_admin','oai-authenticated-user-email':'admin@accounts.invalid'}})).status,401);
  assert.equal((await call('auth/login',{method:'POST',body:{username:'admin',password:'test-admin-password'},headers:{Origin:'https://attacker.test'}})).status,403);
  assert.equal((await call('auth/login',{method:'POST',body:{username:'admin',password:'incorrect'}})).status,401);
  const admin=await login(' ADMIN ','test-admin-password');assert.match(admin.result.headers.get('set-cookie'),/^__Host-tuxu-account=.+; Path=\/; HttpOnly; SameSite=Lax; Max-Age=604800; Secure$/);
  const session=await call('session',{user:admin});assert.equal(session.value.isAdmin,true);assert.equal(session.value.user.username,'admin');assert.equal(session.value.user.email,null);assert.deepEqual(session.value.capabilities.visualDesign.specialistRouting,{version:1,considered:10,maxLoaded:9});
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
  const workspaceA=await call('workspace',{user:a}),workspaceB=await call('workspace',{user:b});assert.equal(workspaceA.value.session.user.id,a.id);assert.equal(workspaceA.value.session.isAdmin,false);assert.equal(workspaceA.value.projects[0].name,project.name);assert.equal(workspaceB.value.projects[0].name,'Only designer two');assert.deepEqual((await call('workspace?user_id='+a.id,{user:admin})).value.projects,[]);
  const stale=await call('projects/stale',{method:'PUT',user:b,headers:{'X-Tuxu-Account':a.id},body:{project:{...project,id:'stale'},revision:0}});assert.equal(stale.status,401);assert.equal(stale.value.code,'AUTH_CHANGED');
  assert.equal((await call('projects/missing-header',{method:'PUT',user:b,headers:{'X-Tuxu-Account':''},body:{project:{...project,id:'missing-header'},revision:0}})).status,401);
  const png=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/m8AAAAASUVORK5CYII=','base64'));
  const asset=await call('assets?projectId='+project.id+'&id=private-photo',{method:'POST',user:a,body:png,headers:{'Content-Type':'image/png'}});assert.equal(asset.status,200);assert.equal((await call('files/private-photo',{user:a})).status,200);assert.equal((await call('files/private-photo',{user:b})).status,404);assert.equal((await call('files/private-photo',{user:admin})).status,404);
  assert.equal((await call('assets?projectId='+project.id+'&id=private-photo',{method:'POST',user:b,body:png,headers:{'Content-Type':'image/png'}})).status,403);
  assert.equal((await call('projects/'+project.id,{method:'PUT',user:b,body:{project:{...project,assets:[asset.value]},revision:1}})).status,403);
  const queued=await call('jobs',{method:'POST',user:a,body:{projectId:project.id,revision:1,requestId:'test-own-job',kind:'write',prompt:'只测试归属，不调用外部 AI',pageIds:['page-one']}});assert.equal(queued.status,201);
  assert.equal((await call('jobs',{user:b})).value.jobs.length,0);assert.equal((await call('jobs/'+queued.value.job.id,{user:b})).status,404);assert.equal((await call('jobs/'+queued.value.job.id+'/cancel',{method:'POST',body:{},user:admin})).status,404);
  assert.equal((await call('jobs/'+queued.value.job.id+'/artifacts/fake',{user:b})).status,404);assert.equal((await call('jobs/'+queued.value.job.id+'/cancel',{method:'POST',body:{},user:a})).value.job.status,'cancelled');
  const historical={summary:'历史设计',report:'实际设计说明'.repeat(2000),usedSkills:[],pages:[{id:'page-one',html:'旧设计内容'.repeat(2000),css:'.xhs-card{}'}],artifacts:[]};await db.prepare("UPDATE jobs SET status='completed',result=? WHERE id=?").bind(JSON.stringify(historical),queued.value.job.id).run();const compact=(await call('workspace',{user:a})).value.jobs[0];assert.equal(compact.detailsLoaded,false);assert.equal(compact.result.summary,historical.summary);assert.equal(compact.result.pages,undefined);assert.equal(compact.result.report,undefined);assert.equal((await call('jobs/'+compact.id,{user:a})).value.job.result.report,historical.report);assert.deepEqual((await call('workspace',{user:b})).value.jobs,[]);assert.deepEqual((await call('workspace',{user:admin})).value.jobs,[]);
  const design=await call('jobs',{method:'POST',user:a,body:{projectId:project.id,revision:1,requestId:'trusted-specialist-policy',kind:'design',workflow:'automatic',scope:'page',pageIds:['page-one'],prompt:'让文字更容易阅读',visualDesignPolicy:{version:0,specialistRouting:{version:0,maxLoaded:99}},snapshot:{visualDesignPolicy:null}}});assert.equal(design.status,201);assert.equal(design.value.job.specialistRoutingRequired,true);const saved=JSON.parse((await db.prepare('SELECT snapshot FROM jobs WHERE id=?').bind(design.value.job.id).first()).snapshot);assert.equal(saved.visualDesignPolicy.specialistRouting.version,1);assert.equal(saved.visualDesignPolicy.specialistRouting.maxLoaded,9);assert.equal(saved.visualDesignPolicy.specialistRouting.catalog.length,10);assert.equal((await call('jobs/'+design.value.job.id+'/cancel',{method:'POST',body:{},user:a})).value.job.status,'cancelled');
  const manualDesign=await call('jobs',{method:'POST',user:a,body:{projectId:project.id,revision:1,requestId:'manual-specialist-policy',kind:'polish',pageIds:['page-one'],prompt:'改善文字排版'}});assert.equal(manualDesign.status,201);assert.equal(manualDesign.value.job.automatic,false);assert.equal(manualDesign.value.job.specialistRoutingRequired,true);assert.equal(manualDesign.value.job.skillIds.length,15);assert.equal((await call('jobs/'+manualDesign.value.job.id+'/cancel',{method:'POST',body:{},user:a})).value.job.status,'cancelled');
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
