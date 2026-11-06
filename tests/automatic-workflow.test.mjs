import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';
import {canApplyAutomatic,hasAuditErrors,automaticMessage} from '../src/ai-workflow.js';
import {parseManuscript} from '../src/engine.js';

async function bundle(entry,plugins=[]){const {outputFiles}=await build({entryPoints:[entry],bundle:true,write:false,platform:'node',format:'esm',plugins});return import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));}
const {validateDesignResult}=await bundle('server/design-result.ts');
const {skills,routeSkills}=await bundle('server/skills.ts');
const {imageAllowed,repairAllowed,renderAudit}=await bundle('server/automatic-workflow.ts');
const blocks=[{id:'c1',text:'周末阅读'},{id:'c2',text:'给自己 10 分钟。'},{id:'c3',text:'翻开一本喜欢的书。'}];
const source={workflow:'automatic',pages:[{id:'source-page',copy:blocks}],assets:[]};
const job={kind:'design',snapshot:JSON.stringify(source),skill_ids:JSON.stringify(skills.map(s=>s.id))};
const markup=copy=>'<section class="xhs-card">'+copy.map(c=>'<p data-copy="'+c.id+'">'+c.text+'</p>').join('')+'</section>';
const validResult={summary:'已设计',report:'已检查',usedSkills:['xiaohongshu-design','xhs-design-polish'],pages:[{id:'reading-cover',html:markup(blocks),css:'.xhs-card > p {font:40px "TY Sans";}',photoAssetId:null}]};
const manifest={status:'passed',pages:[{id:'reading-cover'}],issues:[],warnings:[],networkFailures:[]};

test('automatic workflow makes every skill available and preserves legacy task routing',()=>{
 assert.equal(routeSkills('design',undefined,true).length,14);
 assert.equal(routeSkills('design').length,5);
 assert.deepEqual(routeSkills('write'),['xiaohongshu-design','xhs-writer']);
});
test('AI can repaginate while copy IDs, exact text and sequence remain locked',()=>{
 const raw={...validResult,pages:[{id:'new-cover',html:markup(blocks.slice(0,1)),css:''},{id:'new-body',html:markup(blocks.slice(1)),css:''}]};
 const accepted=validateDesignResult(raw,job);
 assert.equal(accepted.replacePages,true);assert.deepEqual(accepted.pages.flatMap(p=>p.copy),blocks);
 for(const badPages of [
  [...raw.pages].reverse(),
  [{id:'new-cover',html:markup(blocks.slice(0,2)),css:''}],
  [{id:'new-cover',html:markup([...blocks,blocks[2]]),css:''}],
  [{id:'new-cover',html:markup(blocks).replace('10 分钟','20 分钟'),css:''}],
 ])assert.throws(()=>validateDesignResult({...raw,pages:badPages},job));
});
test('automatic layout cannot borrow an image from another project',()=>{
 const image='<img data-asset-id="outside" src="/api/files/outside">';
 const raw={...validResult,pages:[{...validResult.pages[0],html:markup(blocks).replace('</section>',image+'</section>')}]};
 assert.throws(()=>validateDesignResult(raw,job),error=>error.code==='ASSET_SCOPE');
 assert.equal(validateDesignResult(raw,{...job,generatedAssetIds:['outside']}).pages.length,1);
});
test('corrections are bounded and cannot generate a second illustration in a correction job',()=>{
 assert.equal(imageAllowed(job),true);assert.equal(repairAllowed(job),true);
 assert.equal(repairAllowed({...job,result:JSON.stringify({repairAttempts:1})}),false);
 const child={...job,snapshot:JSON.stringify({...source,repairOf:'previous-job'})};
 assert.equal(imageAllowed(child),false);assert.equal(repairAllowed(child),false);
 assert.equal(imageAllowed({...job,kind:'write'}),false);
});
test('automatic completion requires a passed rendering record and correct page count',()=>{
 assert.equal(renderAudit(manifest,1).status,'passed');
 for(const invalid of [null,{...manifest,status:'failed'},{...manifest,issues:['overlap']},{...manifest,networkFailures:['photo']},{...manifest,pages:[]}])assert.throws(()=>renderAudit(invalid,1));
});
test('automatic application never overwrites changed content or another project',()=>{
 const task={projectId:'own-project',baseRevision:7};
 const project={id:'own-project',cloudRevision:7};assert.equal(canApplyAutomatic(task,project),true);
 for(const changed of [{...project,_cloudDirty:true},{...project,cloudRevision:8},{...project,_syncConflict:true},{...project,id:'another-project'}])assert.equal(canApplyAutomatic(task,changed),false);
 assert.equal(hasAuditErrors([{issues:[{severity:'error',message:'overlap'}]}]),true);
 assert.equal(hasAuditErrors([{issues:[{severity:'info',message:'copy edit'}]}]),false);
 assert.match(automaticMessage(undefined,project),/文案/);
});
test('automatic input keeps list punctuation and hashtags as supplied',()=>{
 const pages=parseManuscript('阅读清单\n- 带一本书\n#周末阅读',{preserveText:true});
 assert.deepEqual(pages[0].copy.map(c=>c.text),['阅读清单','- 带一本书','#周末阅读']);
});
test('a literal website address in locked copy is text rather than an external resource',()=>{
 const copy=[{id:'url',text:'资料地址：https://example.com/reading'}];
 const current={...job,snapshot:JSON.stringify({...source,pages:[{id:'source-page',copy}]})};
 const result={...validResult,pages:[{id:'one-page',html:markup(copy),css:''}]};
 assert.equal(validateDesignResult(result,current).pages[0].copy[0].text,copy[0].text);
});

const coreMock={name:'isolated-provider',setup(build){
 build.onResolve({filter:/^\.\/core$/},()=>({path:'test-core',namespace:'test-core'}));
 build.onLoad({filter:/.*/,namespace:'test-core'},()=>({loader:'js',contents:`export const runtime=()=>globalThis.automaticHarness.env;
 export const api=(path,opts)=>globalThis.automaticHarness.api(path,opts);
 export class HttpError extends Error{constructor(status,message){super(message);this.status=status;}}
 export const fail=(status,message)=>{throw new HttpError(status,message)};
 export const cleanError=e=>e instanceof HttpError?e.message:'unexpected failure';
 export const uploadProviderFile=()=>{throw Error('unexpected upload')};`}));
}};
const {advanceJob,startJob}=await bundle('server/agent.ts',[coreMock]);
async function harness(){
 const db=new DatabaseSync(':memory:');db.exec(await fs.readFile('drizzle/0000_peaceful_sleeper.sql','utf8'));
 db.prepare("INSERT INTO jobs(id,user_id,project_id,request_id,kind,prompt,skill_ids,snapshot,base_revision,status,session_id,environment_id,provider_files,lease_until,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,'running','session-test','env-test','[]',0,?,?)").run('job-test','visitor_test','own-project','test-request','design','自动设计',job.skill_ids,job.snapshot,1,Date.now(),Date.now());
 const events=[],storedFiles=[],deleted=[],attachments=[],starts=[],state={turn:'turn-1',invalid:true,calls:[]};
 const files={
  'result-1':JSON.stringify({...validResult,pages:[{...validResult.pages[0],css:'.xhs-card{background:url(external.png)}'}]}),
  'result-2':JSON.stringify(validResult),'audit-1':JSON.stringify(manifest),'audit-2':JSON.stringify(manifest),'font-1':'test-font','png-2':'test-png',
 };
 const DB={prepare(sql){return {bind(...args){return {async run(){const result=db.prepare(sql).run(...args);return {meta:{changes:result.changes}};},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};}};}};}};
 const api=async(path,options={})=>{
  if(options.method==='DELETE'){deleted.push(path);return {};}
  if(path==='/agents/sessions'){starts.push(options.body);return {id:'session-test',environment:{id:'env-test'}};}
  if(path==='/agents/environments/env-test/files'){attachments.push(options.body);return {};}
  if(path.endsWith('/events')){events.push(options.body.events[0]);return {};}
  if(path==='/agents/sessions/session-test')return {status:'running',required_actions:state.calls};
  if(path.includes('/turns?'))return {data:[{id:state.turn,status:'completed'}]};
  if(path.includes('/artifacts?'))return {data:state.turn==='turn-1'?[
   {id:'result-1',path:'/workspace/outputs/result.json',turn_id:'turn-1',size_bytes:100},
   {id:'font-1',path:'/workspace/outputs/font.woff2',turn_id:'turn-1',size_bytes:9},
  ]:[
   {id:state.invalid?'result-1':'result-2',path:'/workspace/outputs/result.json',turn_id:'turn-2',size_bytes:100},
   {id:'audit-2',path:'/workspace/outputs/render-manifest.json',turn_id:'turn-2',size_bytes:100},
   {id:'png-2',path:'/workspace/outputs/cover.png',turn_id:'turn-2',size_bytes:8},
   {id:'font-1',path:'/workspace/outputs/font.woff2',turn_id:'turn-1',size_bytes:9},
  ],has_more:false};
  const id=path.match(/\/artifacts\/([^/]+)\/content$/)?.[1];if(id)return new Response(files[id]);
  throw Error('Unexpected provider request: '+path);
 };
 const skillFiles=Object.fromEntries([...skills.map(s=>[s.id,{fileId:'file-test-'+s.id,bytes:['xiaohongshu-design','xhs-design-polish'].includes(s.id)?20000:30*1024*1024}]),['_runtime',{fileId:'file-test-runtime',bytes:16*1024*1024}]]);
 globalThis.automaticHarness={env:{DB,SKILL_FILES_JSON:JSON.stringify(skillFiles),BUCKET:{async put(key,bytes){storedFiles.push({key,bytes});}}},api};
 return {db,events,storedFiles,deleted,attachments,starts,state,read:()=>db.prepare('SELECT * FROM jobs WHERE id=?').get('job-test')};
}
test('all skills remain available while startup stays small and optional resources load only on demand',async()=>{
 const h=await harness();try{
  h.db.exec("UPDATE jobs SET status='queued',session_id=NULL,environment_id=NULL");
  await startJob(h.read());assert.equal(h.starts.length,1);
  const body=h.starts[0],files=body.environment.files.filter(f=>f.type==='file_id');assert.equal(files.length,3);
  const loader=body.agent.tools.find(t=>t.name==='load_design_resource');assert.equal(loader.parameters.properties.resourceId.enum.length,14);
  const input=JSON.parse(Buffer.from(body.environment.files.find(f=>f.path==='/workspace/input/project.json').data,'base64').toString());
  assert.equal(input._resources,undefined);assert.deepEqual(input.loadedSkills,['xiaohongshu-design','xhs-design-polish']);
  h.state.calls=[{type:'function_call',name:'load_design_resource',turn_id:'turn-1',call_id:'load-1',arguments:JSON.stringify({resourceId:'skill/victor-design'})}];
  await advanceJob(h.read());assert.equal(h.attachments.length,1);assert(JSON.parse(h.read().snapshot).loadedSkills.includes('victor-design'));
  await advanceJob(h.read());assert.equal(h.attachments.length,1);
  h.state.calls=[{type:'function_call',name:'load_design_resource',turn_id:'turn-1',call_id:'load-foreign',arguments:JSON.stringify({resourceId:'image/other-users-file'})}];
  await advanceJob(h.read());assert.equal(h.attachments.length,1);assert.equal(h.events.at(-1).success,false);
 }finally{h.db.close();}
});
test('invalid AI output gets one correction; stale turns are ignored; actual success keeps prior font artifacts',async()=>{
 const h=await harness();try{
  await advanceJob(h.read());assert.equal(h.events.filter(e=>e.type==='agent.session.input.message').length,1);
  assert.equal(h.read().status,'running');assert.equal(h.read().turn_id,null);assert.equal(h.storedFiles.length,0);
  await advanceJob(h.read());assert.equal(h.events.length,1);assert.equal(h.deleted.length,0);
  h.state.turn='turn-2';h.state.invalid=false;await advanceJob(h.read());
  const stored=h.read(),result=JSON.parse(stored.result);assert.equal(stored.status,'completed');assert.equal(result.repairAttempts,1);assert.equal(result.audit.status,'passed');
  assert(result.artifacts.some(a=>a.name==='font.woff2'));assert(h.deleted.some(p=>p.endsWith('/session-test')));
 }finally{h.db.close();}
});
test('a second invalid output fails safely and cleans the hosted session without another correction',async()=>{
 const h=await harness();try{
  await advanceJob(h.read());h.state.turn='turn-2';await advanceJob(h.read());
  assert.equal(h.read().status,'failed');assert.equal(h.events.filter(e=>e.type==='agent.session.input.message').length,1);
  assert.equal(h.storedFiles.length,0);assert(h.deleted.some(p=>p.endsWith('/session-test')));
 }finally{h.db.close();}
});
