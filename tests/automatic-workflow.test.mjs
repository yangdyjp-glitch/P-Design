import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {VISUAL_SKILLS,LEGACY_VISUAL_SKILLS,VISUAL_CHECKS,visualDesignPolicy,validateVisualPlan,validateVisualReview} from '../src/visual-design.js';
import {planFor,specialistPlanFor,reviewFor,responseFor,phonePNG} from './fixtures/visual-design.mjs';
import {canApplyAutomatic,hasAuditErrors,automaticMessage,designProposal,jobApplied} from '../src/ai-workflow.js';
import {parseManuscript} from '../src/engine.js';

const rawPlugin={name:'raw-source',setup(build){build.onResolve({filter:/\?raw$/},args=>({path:path.resolve(args.resolveDir,args.path.slice(0,-4)),namespace:'raw-source'}));build.onLoad({filter:/.*/,namespace:'raw-source'},async args=>({loader:'text',contents:await fs.readFile(args.path,'utf8')}));}};
async function bundle(entry,plugins=[]){const {outputFiles}=await build({entryPoints:[entry],bundle:true,write:false,platform:'node',format:'esm',plugins:[...plugins,rawPlugin]});return import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));}
const {validateDesignResult}=await bundle('server/design-result.ts');
const {skills,routeSkills}=await bundle('server/skills.ts');
const {imageAllowed,repairAllowed,renderAudit,automaticPages,automaticAssets}=await bundle('server/automatic-workflow.ts');
const blocks=[{id:'c1',text:'周末阅读'},{id:'c2',text:'给自己 10 分钟。'},{id:'c3',text:'翻开一本喜欢的书。'}];
const source={workflow:'automatic',pages:[{id:'source-page',copy:blocks}],assets:[]};
const job={kind:'design',snapshot:JSON.stringify(source),skill_ids:JSON.stringify(routeSkills('design',undefined,true))};
const markup=copy=>'<section class="xhs-card">'+copy.map(c=>'<p data-copy="'+c.id+'">'+c.text+'</p>').join('')+'</section>';
const validResult={summary:'已设计',report:'已检查',usedSkills:['xiaohongshu-design','xhs-design-polish'],pages:[{id:'reading-cover',html:markup(blocks),css:'.xhs-card > p {font:40px "TY Sans";}',photoAssetId:null}]};
const manifest={status:'passed',pages:[{id:'reading-cover'}],issues:[],warnings:[],networkFailures:[]};

test('automatic workflow makes every skill available and preserves legacy task routing',()=>{
 assert.equal(routeSkills('design',undefined,true).length,15);
 assert.equal(routeSkills('design').length,7);
 assert.deepEqual(routeSkills('write'),['xiaohongshu-design','xhs-writer']);
});
test('server rejects image-source violations and empty photographic sets before application',()=>{
 const assets=[{id:'upload',source:'upload'},{id:'web',source:'web'},{id:'generated',source:'generated',generated:true}];
 const withImage=id=>({...validResult,pages:[{...validResult.pages[0],html:markup(blocks).replace('</section>','<img data-asset-id="'+id+'" src="/api/files/'+id+'"></section>')} ]});
 for(const imageMode of ['upload','web','none']){
  const current={...job,snapshot:JSON.stringify({...source,imageMode,assets})};
  if(imageMode==='none')assert.equal(validateDesignResult(validResult,current).pages.length,1);
  else {assert.equal(validateDesignResult(withImage(imageMode),current).pages.length,1);assert.throws(()=>validateDesignResult(validResult,current),error=>error.code==='IMAGE_MODE');}
  for(const id of ['upload','web','generated'].filter(id=>id!==imageMode))assert.throws(()=>validateDesignResult(withImage(id),current),error=>error.code==='IMAGE_MODE');
 }
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
test('single-image requests and their corrections cannot widen or switch the selected page',()=>{
 const pages=[{id:'page-a'},{id:'page-b'}],parent={scope:'page',pages:[pages[1]]};
 assert.deepEqual(automaticPages(pages,['page-b'],'page'),[pages[1]]);
 assert.deepEqual(automaticPages(pages,['page-b'],'page',parent),[pages[1]]);
 assert.deepEqual(automaticPages(pages,['page-a'],'project'),pages);
 for(const args of [[pages,['page-a','page-b'],'page'],[pages,['unknown'],'page'],[pages,['page-a'],'page',parent],[pages,['page-b'],'project',parent],[pages,['page-b'],'other']])assert.throws(()=>automaticPages(...args));
});
test('single-image results preserve one page ID, all original copy, and cannot repaginate',()=>{
 const scoped={...job,kind:'revise',snapshot:JSON.stringify({...source,scope:'page'})};
 const raw={...validResult,pages:[{...validResult.pages[0],id:'source-page'}]};
 const result=validateDesignResult(raw,scoped);assert.equal(result.replacePages,false);assert.deepEqual(result.pages[0].copy,blocks);
 for(const bad of [validResult,{...raw,pages:[raw.pages[0],{...raw.pages[0],id:'another-page'}]},{...raw,pages:[{...raw.pages[0],html:markup(blocks).replace('10 分钟','20 分钟')}]}])assert.throws(()=>validateDesignResult(bad,scoped));
});
test('applying a single-image proposal preserves every other image and each image requirement',()=>{
 const pages=[{id:'page-a',copy:blocks,requirements:'第一张要求',html:markup(blocks),css:'.xhs-card{color:#123456}',layout:'original',settings:{fontScale:1}},{id:'page-b',copy:blocks,requirements:'图片完整显示，不要裁切',html:markup(blocks),css:'',layout:'editorial',settings:{fontScale:1}}];
 const project={id:'project',pages:structuredClone(pages),assets:[]};
 const task={id:'change-b',projectId:project.id,scope:'page',pageIds:['page-b'],result:{pages:[{id:'page-b',html:markup(blocks),css:'.xhs-card{color:#345448}',photoAssetId:null}],replacePages:false}};
 const changed=designProposal(task,project);assert.deepEqual(changed.pages[0],pages[0]);assert.equal(changed.pages[1].requirements,pages[1].requirements);assert.deepEqual(changed.pages[1].copy,pages[1].copy);assert.notEqual(changed.pages[1].css,pages[1].css);assert.deepEqual(project.pages,pages);
 assert.throws(()=>designProposal({...task,result:{...task.result,replacePages:true}},project));
 assert.throws(()=>designProposal({...task,result:{...task.result,pages:[{...task.result.pages[0],id:'page-a'}]}},project));
});
test('a referenced older photograph is retained instead of being displaced by recent uploads',()=>{
 const assets=Array.from({length:12},(_,i)=>({id:'photo-'+i}));
 const selected=automaticAssets(assets,[{photoAssetId:'photo-0',html:'<img data-asset-id="photo-1">'}]);
 assert.equal(selected.length,8);assert(selected.some(a=>a.id==='photo-0'));assert(selected.some(a=>a.id==='photo-1'));assert(selected.some(a=>a.id==='photo-11'));
 assert.throws(()=>automaticAssets(assets,assets.slice(0,9).map(asset=>({photoAssetId:asset.id}))));
});
test('whole-set upload jobs never silently select a subset of the submitted uploads',()=>{
 const assets=Array.from({length:8},(_,i)=>({id:'photo-'+i,source:'upload'})),policy={imageMode:'upload',scope:'project'};
 assert.deepEqual(automaticAssets(assets,[],policy),assets);
 assert.throws(()=>automaticAssets([...assets,{id:'ninth',source:'upload'}],[],policy),/最多使用8张/);
 assert.equal(automaticAssets([...assets,{id:'ninth',source:'upload'}],[],{...policy,scope:'page'}).length,8);
});
test('single-image completion remains recognized after another page has been updated',()=>{
 const task={id:'change-a',scope:'page',pageIds:['page-a']},project={lastAIJobId:'change-b',pages:[{id:'page-a',lastAIJobId:'change-a'},{id:'page-b',lastAIJobId:'change-b'}]};
 assert.equal(jobApplied(task,project),true);assert.match(automaticMessage({...task,status:'completed'},project),/本图已更新/);
 assert.equal(jobApplied({...task,pageIds:['page-b']},project),false);
});

const coreMock={name:'isolated-provider',setup(build){
 build.onResolve({filter:/^\.\/core$/},()=>({path:'test-core',namespace:'test-core'}));
 build.onLoad({filter:/.*/,namespace:'test-core'},()=>({loader:'js',contents:`export const runtime=()=>globalThis.automaticHarness.env;
 export const api=(path,opts)=>globalThis.automaticHarness.api(path,opts);
 export class HttpError extends Error{constructor(status,message){super(message);this.status=status;}}
 export const fail=(status,message)=>{throw new HttpError(status,message)};
 export const cleanError=e=>e instanceof HttpError?e.message:'unexpected failure';
 export const imageMime=b=>b[0]===137?'image/png':null;
 export const uploadProviderFile=async()=>{if(!globalThis.automaticHarness.upload)throw Error('unexpected upload');return globalThis.automaticHarness.upload();};`}));
}};
const {advanceJob,startJob,cancelJob}=await bundle('server/agent.ts',[coreMock]);
const {publicPhotoURL,photoCandidates,webPhotosAllowed}=await bundle('server/photo-search.ts',[coreMock]);
test('source presets disable generation and do not allow upload or text-only jobs to search photos',()=>{
 for(const imageMode of ['upload','web','none'])assert.equal(imageAllowed({...job,snapshot:JSON.stringify({...source,imageMode})}),false);
 for(const imageMode of ['upload','none'])assert.equal(webPhotosAllowed({...job,snapshot:JSON.stringify({...source,imageMode,allowWebImages:true})}),false);
 assert.equal(webPhotosAllowed({...job,snapshot:JSON.stringify({...source,imageMode:'web',allowWebImages:true})}),true);
});
async function harness(){
 const db=new DatabaseSync(':memory:');for(const name of (await fs.readdir('drizzle')).filter(name=>name.endsWith('.sql')).sort())db.exec(await fs.readFile('drizzle/'+name,'utf8'));
 db.prepare("INSERT INTO jobs(id,user_id,project_id,request_id,kind,prompt,skill_ids,snapshot,base_revision,status,session_id,environment_id,provider_files,lease_until,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,'running','session-test','env-test','[]',0,?,?)").run('job-test','visitor_test','own-project','test-request','design','自动设计',job.skill_ids,job.snapshot,1,Date.now(),Date.now());
 const events=[],storedFiles=[],deleted=[],attachments=[],starts=[],responses=[],reviews=[],state={turn:'turn-1',invalid:true,calls:[],searchResponse:{status:'completed',output:[]},visualResponse:{status:'in_progress'},extraArtifacts:[]};
 const files={
  'result-1':JSON.stringify({...validResult,pages:[{...validResult.pages[0],css:'.xhs-card{background:url(external.png)}'}]}),
  'result-2':JSON.stringify(validResult),'audit-1':JSON.stringify(manifest),'audit-2':JSON.stringify(manifest),'font-1':'test-font','png-2':'test-png',
 };
 const DB={prepare(sql){return {bind(...args){return {async run(){const result=db.prepare(sql).run(...args);return {meta:{changes:result.changes}};},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};}};}};}};
 const api=async(path,options={})=>{
  if(options.method==='DELETE'){deleted.push(path);return {};}
  if(path==='/responses'&&options.body.text?.format?.name==='independent_visual_review'){reviews.push(options.body);return {id:'response-visual-'+reviews.length};}
  if(path.startsWith('/responses/response-visual-'))return state.visualResponse;
  if(path==='/responses'){responses.push(options.body);return {id:'response-photo-search'};}
  if(path==='/responses/response-photo-search')return state.searchResponse;
  if(path==='/agents/sessions'){starts.push(options.body);return {id:'session-test',environment:{id:'env-test'}};}
  if(path==='/agents/environments/env-test/files'){attachments.push(options.body);return {};}
  if(path.endsWith('/events')){events.push(options.body.events[0]);return {};}
  if(path==='/agents/sessions/session-test')return {status:'running',required_actions:state.calls};
  if(path.includes('/turns?'))return {data:[{id:state.turn,status:'completed'}]};
  if(path.includes('/artifacts?'))return {data:state.turn==='turn-1'?[
   {id:'result-1',path:'/workspace/outputs/result.json',turn_id:'turn-1',size_bytes:100},
   {id:'font-1',path:'/workspace/outputs/font.woff2',turn_id:'turn-1',size_bytes:9},...state.extraArtifacts,
  ]:[
   {id:state.invalid?'result-1':'result-2',path:'/workspace/outputs/result.json',turn_id:state.turn,size_bytes:100},
   {id:'audit-2',path:'/workspace/outputs/render-manifest.json',turn_id:state.turn,size_bytes:100},
   {id:'png-2',path:'/workspace/outputs/cover.png',turn_id:state.turn,size_bytes:8},
   {id:'font-1',path:'/workspace/outputs/font.woff2',turn_id:'turn-1',size_bytes:9},...state.extraArtifacts,
  ],has_more:false};
  const id=path.match(/\/artifacts\/([^/]+)\/content$/)?.[1];if(id)return new Response(files[id]);
  throw Error('Unexpected provider request: '+path);
 };
 const skillFiles=Object.fromEntries([...skills.map(s=>[s.id,{fileId:'file-test-'+s.id,bytes:['xiaohongshu-design','xhs-design-polish'].includes(s.id)?20000:30*1024*1024}]),['_runtime',{fileId:'file-test-runtime',bytes:16*1024*1024}]]);
 globalThis.automaticHarness={env:{DB,SKILL_FILES_JSON:JSON.stringify(skillFiles),BUCKET:{async put(key,bytes){storedFiles.push({key,bytes});},async delete(key){const index=storedFiles.findIndex(file=>file.key===key);if(index>=0)storedFiles.splice(index,1);},async get(key){const file=storedFiles.find(file=>file.key===key);return file?{arrayBuffer:async()=>file.bytes}:null;}}},api,upload:async()=>'provider-photo-file'};
 return {db,events,storedFiles,deleted,attachments,starts,responses,reviews,state,files,read:()=>db.prepare('SELECT * FROM jobs WHERE id=?').get('job-test')};
}
test('all skills remain available while startup stays small and optional resources load only on demand',async()=>{
 const h=await harness();try{
  h.db.exec("UPDATE jobs SET status='queued',session_id=NULL,environment_id=NULL");
  await startJob(h.read());assert.equal(h.starts.length,1);
  const body=h.starts[0],files=body.environment.files.filter(f=>f.type==='file_id');assert.equal(files.length,3);
  const loader=body.agent.tools.find(t=>t.name==='load_design_resource');assert.equal(loader.parameters.properties.resourceId.enum.length,15);
  const input=JSON.parse(Buffer.from(body.environment.files.find(f=>f.path==='/workspace/input/project.json').data,'base64').toString());
  assert.equal(input._resources,undefined);assert.deepEqual(input.loadedSkills,['xiaohongshu-design','xhs-design-polish']);
  const setup=body.environment.setup_commands.map(step=>step.command).join('\n');assert.equal((setup.match(/playwright install/g)||[]).length,1);assert.match(setup,/playwright install --with-deps chromium/);assert.doesNotMatch(setup,/python -m playwright install/);
  h.state.calls=[{type:'function_call',name:'load_design_resource',turn_id:'turn-1',call_id:'load-1',arguments:JSON.stringify({resourceId:'skill/victor-design'})}];
  await advanceJob(h.read());assert.equal(h.attachments.length,1);assert(JSON.parse(h.read().snapshot).loadedSkills.includes('victor-design'));
  await advanceJob(h.read());assert.equal(h.attachments.length,1);
  h.state.calls=[{type:'function_call',name:'load_design_resource',turn_id:'turn-1',call_id:'load-foreign',arguments:JSON.stringify({resourceId:'image/other-users-file'})}];
  await advanceJob(h.read());assert.equal(h.attachments.length,1);assert.equal(h.events.at(-1).success,false);
 }finally{h.db.close();}
});
test('new manual visual jobs also expose all candidates while preloading five required visual modules',async()=>{
 const h=await harness();try{
  const manifest=JSON.parse(globalThis.automaticHarness.env.SKILL_FILES_JSON);for(const id of skills.map(skill=>skill.id))manifest[id].bytes=10000;globalThis.automaticHarness.env.SKILL_FILES_JSON=JSON.stringify(manifest);
  const current={...source,visualDesignPolicy:visualDesignPolicy('polish')};delete current.workflow;h.db.prepare("UPDATE jobs SET status='queued',session_id=NULL,environment_id=NULL,kind='polish',snapshot=?").run(JSON.stringify(current));
  await startJob(h.read());const body=h.starts[0],input=JSON.parse(Buffer.from(body.environment.files.find(file=>file.path==='/workspace/input/project.json').data,'base64').toString());assert.deepEqual([...input.loadedSkills].sort(),[...VISUAL_SKILLS].sort());assert.equal(body.environment.files.filter(file=>file.type==='file_id').length,6);assert.equal(body.agent.tools.find(tool=>tool.name==='load_design_resource').parameters.properties.resourceId.enum.length,15);
  h.state.calls=[{type:'function_call',name:'load_design_resource',turn_id:'turn-1',call_id:'manual-specialist',arguments:JSON.stringify({resourceId:'skill/blcaptain-style-skill'})}];await advanceJob(h.read());assert.equal(h.attachments.length,1);assert(JSON.parse(h.read().snapshot).loadedSkills.includes('blcaptain-style-skill'));
 }finally{h.db.close();}
});
test('the hosted job receives the saved style recipe without weakening image or page policies',async()=>{
 const h=await harness();try{
  const stylePreset={id:'preset-1',name:'测试预案',version:3,direction:'仅用于隔离检查的风格规则。'};
  h.db.prepare("UPDATE jobs SET status='queued',session_id=NULL,environment_id=NULL,snapshot=?").run(JSON.stringify({...source,stylePreset,scope:'page',paginationMode:'fixed',imagePolicy:{minUploadedVisible:.8}}));
  await startJob(h.read());
  const body=h.starts[0],input=JSON.parse(Buffer.from(body.environment.files.find(file=>file.path==='/workspace/input/project.json').data,'base64').toString());
  assert.deepEqual(input.stylePreset,stylePreset);assert.equal(input.scope,'page');assert.equal(input.imagePolicy.minUploadedVisible,.8);
  assert.equal(input.paginationMode,'fixed');assert(body.environment.files.some(file=>file.path==='/workspace/runtime/pagination-policy.mjs'));assert.match(body.agent.instructions,/MANDATORY PAGINATION RULE/);
  assert.match(body.agent.instructions,/mandatory image policy and authorized page scope take precedence/);
 }finally{h.db.close();}
});
test('single-page hosted work receives a frozen request and rejects an unmet request through one correction',async()=>{
 const h=await harness();try{
  const pageRevision={version:1,pageId:'source-page',request:'正文分段更清楚'};
  h.db.prepare("UPDATE jobs SET status='queued',session_id=NULL,environment_id=NULL,kind='revise',snapshot=?").run(JSON.stringify({...source,scope:'page',pageRevision}));
  await startJob(h.read());const body=h.starts[0],input=JSON.parse(Buffer.from(body.environment.files.find(f=>f.path==='/workspace/input/project.json').data,'base64').toString());
  assert.deepEqual(input.pageRevision,{...pageRevision,baselineCopyCurrent:false});assert.match(body.agent.instructions,/SINGLE-PAGE REVISION/);assert(body.environment.files.some(f=>f.path==='/workspace/runtime/page-revision.mjs'));
  h.files['result-1']=JSON.stringify({...validResult,pages:[{...validResult.pages[0],id:'source-page'}],revisionReview:{pageId:'source-page',request:pageRevision.request,outcome:'updated',checks:[{requirement:pageRevision.request,status:'unmet',change:'尚未完成分组',evidence:'预览仍然难以分辨段落'}]}});
  await advanceJob(h.read());assert.equal(h.read().status,'running');assert.equal(h.events.filter(e=>e.type==='agent.session.input.message').length,2);assert.match(h.events.at(-1).input[0].content[0].text,/要求未落实/);
  h.state.turn='turn-2';h.state.invalid=true;await advanceJob(h.read());assert.equal(h.read().status,'failed');assert.equal(h.events.filter(e=>e.type==='agent.session.input.message').length,2);
  assert(h.deleted.includes('/agents/sessions/session-test'));
 }finally{h.db.close();}
});
test('both uploaded image files reach the hosted job, including on-demand resources',async()=>{
 const h=await harness();try{
  const assets=[{id:'one',name:'环境照.jpg',source:'upload'},{id:'two',name:'交流照.jpg',source:'upload'}];
  // A large existing runtime makes the second image lazy; it must still be available in the catalog.
  const files=JSON.parse(globalThis.automaticHarness.env.SKILL_FILES_JSON);files._runtime.bytes=30*1024*1024;globalThis.automaticHarness.env.SKILL_FILES_JSON=JSON.stringify(files);
  for(const [index,asset]of assets.entries()){h.db.prepare('INSERT INTO assets(id,user_id,project_id,object_key,name,mime,size,generated,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(asset.id,'visitor_test','own-project','upload-'+asset.id,asset.name,'image/jpeg',8*1024*1024,0,Date.now());h.storedFiles.push({key:'upload-'+asset.id,bytes:new Uint8Array([index+1])});}
  let uploaded=0;globalThis.automaticHarness.upload=async()=>'provider-photo-'+(++uploaded);
  h.db.prepare("UPDATE jobs SET status='queued',session_id=NULL,environment_id=NULL,snapshot=?").run(JSON.stringify({...source,scope:'project',imageMode:'upload',assets,imagePolicy:{requiredUploadIds:['one','two']}}));
  await startJob(h.read());assert.equal(uploaded,2);assert.equal(h.starts.length,1);
  const body=h.starts[0],input=JSON.parse(Buffer.from(body.environment.files.find(file=>file.path==='/workspace/input/project.json').data,'base64').toString());
  assert.deepEqual(input.imagePolicy.requiredUploadIds,['one','two']);assert.equal(input.assets.length,2);assert(input.assets.every(asset=>asset.localPath&&asset.resourceId));assert.equal(input.assets[1].loaded,false);
  assert(body.agent.tools.find(tool=>tool.name==='load_design_resource').parameters.properties.resourceId.enum.includes('image/two'));
  h.state.calls=[{type:'function_call',name:'load_design_resource',turn_id:'turn-1',call_id:'load-image',arguments:JSON.stringify({resourceId:'image/two'})}];await advanceJob(h.read());assert(h.attachments.some(file=>file.path==='/workspace/input/two.jpg'));
 }finally{h.db.close();}
});
test('a missing upload fails before launching AI instead of silently omitting that picture',async()=>{
 const h=await harness();try{
  h.db.prepare('INSERT INTO assets(id,user_id,project_id,object_key,name,mime,size,generated,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run('missing','visitor_test','own-project','missing-object','图片.jpg','image/jpeg',8,0,Date.now());
  h.db.prepare("UPDATE jobs SET status='queued',session_id=NULL,environment_id=NULL,snapshot=?").run(JSON.stringify({...source,assets:[{id:'missing',source:'upload'}]}));
  await startJob(h.read());assert.equal(h.starts.length,0);assert.equal(h.read().status,'failed');assert.match(h.read().error,/图片文件不存在/);
 }finally{h.db.close();}
});
test('single-page work eagerly loads images used in HTML and uploads other photos only if requested',async()=>{
 const h=await harness();try{
  const assets=[{id:'used',source:'upload'},{id:'optional',source:'upload'}];
  for(const asset of assets){h.db.prepare('INSERT INTO assets(id,user_id,project_id,object_key,name,mime,size,generated,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(asset.id,'visitor_test','own-project','upload-'+asset.id,asset.id+'.jpg','image/jpeg',16,0,Date.now());h.storedFiles.push({key:'upload-'+asset.id,bytes:new Uint8Array([1,2,3])});}
  let uploaded=0;globalThis.automaticHarness.upload=async()=>'private-'+(++uploaded);
  h.db.prepare("UPDATE jobs SET status='queued',session_id=NULL,environment_id=NULL,snapshot=?").run(JSON.stringify({...source,scope:'page',assets,pages:[{...source.pages[0],html:'<img data-asset-id="used">'}]}));
  await startJob(h.read());assert.equal(uploaded,1);const snapshot=JSON.parse(h.read().snapshot);assert.equal(snapshot._resources['image/optional'].pendingUpload,true);assert.equal(snapshot._resources['image/used'].loaded,true);
  h.state.calls=[{type:'function_call',name:'load_design_resource',turn_id:'turn-1',call_id:'load-optional',arguments:JSON.stringify({resourceId:'image/optional'})}];
  await advanceJob(h.read());assert.equal(uploaded,2);assert.equal(h.attachments.length,1);assert.equal(h.attachments[0].path,'/workspace/input/optional.jpg');assert(JSON.parse(h.read().snapshot).assets.find(a=>a.id==='optional').loaded);assert.deepEqual(JSON.parse(h.read().provider_files),['private-1','private-2']);
  await advanceJob(h.read());assert.equal(uploaded,2);assert.equal(h.attachments.length,1);
 }finally{h.db.close();}
});
test('cancelling while a lazy photo upload finishes deletes private inputs and never attaches or resumes it',async()=>{
 const h=await harness();try{
  h.db.prepare('INSERT INTO assets(id,user_id,project_id,object_key,name,mime,size,generated,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run('optional','visitor_test','own-project','upload-optional','photo.jpg','image/jpeg',16,0,Date.now());h.storedFiles.push({key:'upload-optional',bytes:new Uint8Array([1])});
  h.db.prepare("UPDATE jobs SET status='queued',session_id=NULL,environment_id=NULL,snapshot=?").run(JSON.stringify({...source,scope:'page',assets:[{id:'optional',source:'upload'}]}));
  await startJob(h.read());globalThis.automaticHarness.upload=async()=>{h.db.exec("UPDATE jobs SET status='cancelled'");return 'private-late';};
  h.state.calls=[{type:'function_call',name:'load_design_resource',turn_id:'turn-1',call_id:'cancel-photo',arguments:JSON.stringify({resourceId:'image/optional'})}];await advanceJob(h.read());assert.equal(h.read().status,'cancelled');assert.deepEqual(JSON.parse(h.read().provider_files),[]);assert(h.deleted.includes('/files/private-late'));assert.equal(h.attachments.length,0);assert(!h.events.some(e=>e.call_id==='cancel-photo'));
 }finally{h.db.close();}
});
test('shared-font jobs keep editable HTML and audits while avoiding redundant font downloads',async()=>{
 const h=await harness();try{
  h.db.prepare('UPDATE jobs SET snapshot=?').run(JSON.stringify({...source,renderRuntime:{version:2,fontsBaseURL:'https://example.test/assets/fonts/'}}));h.state.turn='turn-2';h.state.invalid=false;
  await advanceJob(h.read());assert.equal(h.read().status,'completed');const result=JSON.parse(h.read().result);assert(!result.artifacts.some(a=>a.name.endsWith('.woff2')));assert(result.artifacts.some(a=>a.name==='cover.png'));assert.equal(result.timings.deliveredBytes,108);assert(result.timings.totalMs>=result.timings.deliveryMs);
 }finally{h.db.close();}
});
test('omitting one of two required uploads triggers one correction and only a complete result can finish',async()=>{
 const h=await harness();try{
  const assets=[{id:'one',name:'环境照.jpg',source:'upload'},{id:'two',name:'交流照.jpg',source:'upload'}],image=id=>'<img data-asset-id="'+id+'" src="/api/files/'+id+'">';
  h.db.prepare('UPDATE jobs SET snapshot=?').run(JSON.stringify({...source,scope:'project',imageMode:'upload',assets,imagePolicy:{requiredUploadIds:['one','two']}}));
  const result=ids=>({...validResult,pages:[{...validResult.pages[0],html:markup(blocks).replace('</section>',ids.map(image).join('')+'</section>')}]});
  h.files['result-1']=JSON.stringify(result(['one']));await advanceJob(h.read());assert.equal(h.read().status,'running');assert.match(h.events.at(-1).input[0].content[0].text,/交流照/);
  h.state.turn='turn-2';h.state.invalid=false;h.files['result-2']=JSON.stringify(result(['one','two']));h.files['audit-2']=JSON.stringify({...manifest,pages:[{id:'reading-cover',imageChecks:assets.map(a=>({assetId:a.id,source:'upload',visibleFraction:1,loaded:true,passed:true}))}]});
  await advanceJob(h.read());assert.equal(h.read().status,'completed');assert.equal(JSON.parse(h.read().result).repairAttempts,1);assert.equal(h.events.filter(event=>event.type==='agent.session.input.message').length,1);
 }finally{h.db.close();}
});
test('splitting a fixed page triggers one correction and only the restored page boundary can finish',async()=>{
 const h=await harness();try{
  h.db.prepare('UPDATE jobs SET snapshot=?').run(JSON.stringify({...source,scope:'project',paginationMode:'fixed'}));
  h.files['result-1']=JSON.stringify({...validResult,pages:[{id:'source-page',html:markup(blocks.slice(0,1)),css:''},{id:'extra-photo-page',html:markup(blocks.slice(1)),css:''}]});
  await advanceJob(h.read());assert.equal(h.read().status,'running');assert.match(h.events.at(-1).input[0].content[0].text,/保持原页数/);
  h.state.turn='turn-2';h.state.invalid=false;h.files['result-2']=JSON.stringify({...validResult,pages:[{...validResult.pages[0],id:'source-page'}]});h.files['audit-2']=JSON.stringify({...manifest,pages:[{id:'source-page'}]});
  await advanceJob(h.read());assert.equal(h.read().status,'completed');assert.equal(JSON.parse(h.read().snapshot).paginationMode,'fixed');
  const result=JSON.parse(h.read().result);assert.equal(result.repairAttempts,1);assert.equal(result.pages.length,1);assert.deepEqual(result.pages[0].copy,blocks);assert.equal(h.events.filter(event=>event.type==='agent.session.input.message').length,1);
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

test('uploaded-photo crop records require at least 80% retained area; actual web photos are exempt',()=>{
 const html=markup(blocks).replace('</section>','<img data-asset-id="photo" src="/api/files/photo"></section>'),pages=[{id:'reading-cover',html}],record=fraction=>({...manifest,pages:[{id:'reading-cover',imageChecks:[{assetId:'photo',source:'upload',visibleFraction:fraction,loaded:true,passed:true}]}]});
 assert.equal(renderAudit(record(.8),1,pages,[{id:'photo',source:'upload'}]).status,'passed');
 for(const value of [.799,NaN,1.01,-.1])assert.throws(()=>renderAudit(record(value),1,pages,[{id:'photo',source:'upload'}]));
 assert.throws(()=>renderAudit(manifest,1,pages,[{id:'photo'}]));
 const web={...record(.3),pages:[{id:'reading-cover',imageChecks:[{...record(.3).pages[0].imageChecks[0],source:'web'}]}]};
 assert.equal(renderAudit(web,1,pages,[{id:'photo',source:'web'}]).status,'passed');
 assert.throws(()=>renderAudit(web,1,pages,[{id:'photo',source:'upload'}]));
});
test('a required searched photograph must be visible in an actual returned page',()=>{
 const pages=[{id:'reading-cover',html:'<img data-asset-id="web" src="/api/files/web">'}],assets=[{id:'web',source:'web'}];
 const record=fraction=>({...manifest,pages:[{id:'reading-cover',imageChecks:[{assetId:'web',source:'web',visibleFraction:fraction,loaded:true,passed:true}]}]});
 const policy={imageMode:'web',requirePhoto:true};
 assert.throws(()=>renderAudit(record(0),1,pages,assets,policy));
 assert.equal(renderAudit(record(.25),1,pages,assets,policy).status,'passed');
 assert.throws(()=>renderAudit(record(1),1,[{id:'reading-cover',html:'<p>no image</p>'}],assets,policy));
});
test('coverage must also be witnessed by actual loaded and visible upload render records',()=>{
 const assets=[{id:'one',name:'环境照.jpg',source:'upload'},{id:'two',name:'交流照.jpg',source:'upload'}],pages=assets.map(a=>({id:'page-'+a.id,html:'<img data-asset-id="'+a.id+'" src="/api/files/'+a.id+'">'}));
 const records={...manifest,pages:assets.map(a=>({id:'page-'+a.id,imageChecks:[{assetId:a.id,source:'upload',visibleFraction:1,loaded:true,passed:true}]}))},policy={imageMode:'upload',requiredUploadIds:['one','two']};
 assert.equal(renderAudit(records,2,pages,assets,policy).status,'passed');
 assert.throws(()=>renderAudit({...records,pages:records.pages.slice(0,1)},1,pages.slice(0,1),assets,policy),/交流照/);
 const hidden=structuredClone(records);hidden.pages[1].imageChecks[0].visibleFraction=0;assert.throws(()=>renderAudit(hidden,2,pages,assets,policy));
 const unloaded=structuredClone(records);unloaded.pages[1].imageChecks[0].loaded=false;assert.throws(()=>renderAudit(unloaded,2,pages,assets,policy));
});
test('new searched photos cannot expand a design beyond the eight-image limit used by follow-up revisions',()=>{
 const assets=Array.from({length:8},(_,index)=>({id:'photo-'+index})),images=Array.from({length:9},(_,index)=>'<img data-asset-id="photo-'+index+'" src="/api/files/photo-'+index+'">');
 const current={...job,snapshot:JSON.stringify({...source,assets}),generatedAssetIds:['photo-8']};
 const raw=count=>({...validResult,pages:[{...validResult.pages[0],html:markup(blocks).replace('</section>',images.slice(0,count).join('')+'</section>')}]});
 assert.equal(validateDesignResult(raw(8),current).pages.length,1);assert.throws(()=>validateDesignResult(raw(9),current),error=>error.code==='ASSET_COUNT');
});
test('photo search is opt-in, excluded from repairs, and rejects arbitrary/internal image URLs',()=>{
 assert.equal(webPhotosAllowed(job),false);assert.equal(webPhotosAllowed({...job,snapshot:JSON.stringify({...source,allowWebImages:true})}),true);
 assert.equal(webPhotosAllowed({...job,snapshot:JSON.stringify({...source,allowWebImages:true,repairOf:'parent'})}),false);
 for(const url of ['http://images.unsplash.com/a.jpg','https://127.0.0.1/a','https://images.unsplash.com.evil.test/a','https://user:password@images.unsplash.com/a','https://images.unsplash.com:8443/a','file:///etc/passwd','https://169.254.169.254/a'])assert.equal(publicPhotoURL(url,true),null);
 const result={output:[{type:'web_search_call',status:'completed',results:[{type:'image_result',image_url:'https://images.unsplash.com/photo-real',source_website_url:'https://unsplash.com/photos/source',caption:'真实场景'},{type:'image_result',image_url:'https://internal.test/secret',source_website_url:'https://unsplash.com/photos/source'}]}]};
 assert.equal(photoCandidates(result).length,1);assert.equal(photoCandidates(result)[0].name,'真实场景');
 const image='https://images.pexels.com/photos/123/example.jpeg',sourceURL='https://www.pexels.com/photo/park-123/';
 const cited={output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({photos:[{image_url:image,source_website_url:sourceURL,caption:'公园实景'}]}),annotations:[{type:'url_citation',url:image},{type:'url_citation',url:sourceURL}]}]}]};
 assert.equal(photoCandidates(cited).length,1);cited.output[0].content[0].annotations.pop();assert.equal(photoCandidates(cited).length,0);
});
test('photo search downloads actual bytes, persists web provenance, attaches files, and resumes without a duplicate search',async()=>{
 const h=await harness(),originalFetch=globalThis.fetch;
 try{
  const input={...source,allowWebImages:true};h.db.prepare('UPDATE jobs SET snapshot=?').run(JSON.stringify(input));
  h.state.searchResponse={status:'in_progress',output:[]};
  h.state.calls=[{type:'function_call',name:'search_project_photos',call_id:'photos-1',turn_id:'turn-1',arguments:JSON.stringify({query:'真实公园风景',count:1})}];
  await advanceJob(h.read());await advanceJob(h.read());assert.equal(h.responses.length,1);
  h.state.searchResponse={status:'completed',output:[{type:'web_search_call',status:'completed',results:[{type:'image_result',image_url:'https://images.unsplash.com/photo-real',source_website_url:'https://unsplash.com/photos/source',caption:'公园实景'}]}]};
  await advanceJob(h.read());
  globalThis.fetch=async(url,options)=>{assert.equal(url,'https://images.unsplash.com/photo-real');assert.equal(options.redirect,'manual');assert.equal(options.headers.Authorization,undefined);return new Response(new Uint8Array([137,80,78,71]),{headers:{'Content-Type':'image/png'}});};
  for(let index=0;index<5;index++)await advanceJob(h.read());
  assert.equal(h.responses.length,1);assert.equal(h.read().status,'running');
  const row=h.db.prepare('SELECT * FROM assets').get();assert.equal(row.source,'web');assert.equal(row.generated,0);assert.equal(row.source_url,'https://unsplash.com/photos/source');assert.equal(h.storedFiles.length,1);
  assert(h.attachments.some(file=>file.type==='file_id'));assert(h.attachments.some(file=>file.path==='/workspace/input/web-photos.json'));
  const event=h.events.find(event=>event.type==='agent.session.input.tool_result'&&event.call_id==='photos-1');assert.equal(event.success,true);assert.equal(JSON.parse(event.output).photos[0].source,'web');assert.equal(JSON.parse(h.read().snapshot).assets[0].source,'web');
 }finally{globalThis.fetch=originalFetch;h.db.close();}
});
test('completed designs always retain the server-verified source of every used web photograph',async()=>{
 const h=await harness();try{
  h.db.prepare("INSERT INTO assets(id,user_id,project_id,object_key,name,mime,size,generated,source,source_url,image_url,created_at) VALUES('web-photo','visitor_test','own-project','test-web','公园实景','image/jpeg',100,0,'web','https://www.pexels.com/photo/park-123/','https://images.pexels.com/photos/123/image.jpeg',?)").run(Date.now());
  h.state.turn='turn-2';h.state.invalid=false;
  h.files['result-2']=JSON.stringify({...validResult,pages:[{...validResult.pages[0],html:markup(blocks).replace('</section>','<img data-asset-id="web-photo" src="/api/files/web-photo"></section>')}]});
  h.files['audit-2']=JSON.stringify({...manifest,pages:[{id:'reading-cover',imageChecks:[{assetId:'web-photo',source:'web',visibleFraction:.4,loaded:true,passed:true}]}]});
  await advanceJob(h.read());assert.equal(h.read().status,'completed');const result=JSON.parse(h.read().result);
  assert.equal(result.sources[0].url,'https://www.pexels.com/photo/park-123/');assert.equal(result.assets[0].source,'web');assert.equal(result.assets[0].generated,false);
 }finally{h.db.close();}
});
test('cancelling during a provider request is not overwritten by a later provider failure',async()=>{
 const h=await harness(),previous=globalThis.automaticHarness.api;try{
  globalThis.automaticHarness.api=async(path,options)=>{if(path==='/agents/sessions/session-test'&&!options?.method){h.db.exec("UPDATE jobs SET status='cancelled'");throw Error('provider session was cancelled');}return previous(path,options);};
  await advanceJob(h.read());assert.equal(h.read().status,'cancelled');assert.equal(h.read().error,null);
 }finally{h.db.close();}
});
test('an invalid additional photo request cannot overwrite prior search state or lose its cleanup handle',async()=>{
 const h=await harness();try{
  h.db.prepare('UPDATE jobs SET snapshot=?,search_state=?').run(JSON.stringify({...source,allowWebImages:true}),JSON.stringify({phase:'done',responseId:'previous-search',callId:'earlier',assets:[]}));
  h.state.calls=[{type:'function_call',name:'search_project_photos',call_id:'invalid-second',turn_id:'turn-1',arguments:JSON.stringify({query:'公园',count:5})}];
  await advanceJob(h.read());assert.equal(h.responses.length,0);assert.equal(JSON.parse(h.read().search_state).responseId,'previous-search');assert.equal(h.events.at(-1).success,false);
 }finally{h.db.close();}
});

async function visualFixture(h,{scope='project',turn='turn-2',proactive=false}={}){
 const id=scope==='page'?'source-page':'reading-cover',snapshot={...source,scope,loadedSkills:VISUAL_SKILLS,visualDesignPolicy:visualDesignPolicy(scope==='page'?'revise':'design'),renderRuntime:{version:2}},raw={...validResult,usedSkills:VISUAL_SKILLS,pages:[{...validResult.pages[0],id}]};
 if(!proactive)delete snapshot.visualDesignPolicy.specialistRouting;
 else{snapshot._resources={'skill/xhs-note-creator':{kind:'skill',id:'xhs-note-creator',loaded:false,file_id:'shared-note-file',path:'/workspace/bundles/xhs-note-creator.zip'}};raw.usedSkills=[...VISUAL_SKILLS,'xhs-note-creator'];}
 h.db.prepare('UPDATE jobs SET snapshot=?').run(JSON.stringify(snapshot));h.state.turn=turn;h.state.invalid=false;
 if(proactive){h.state.calls=[{type:'function_call',name:'load_design_resource',turn_id:turn,call_id:'load-note-'+turn,arguments:JSON.stringify({resourceId:'skill/xhs-note-creator'})}];await advanceJob(h.read());assert.equal(h.events.at(-1).success,true);}
 h.state.calls=[{type:'function_call',name:'submit_visual_plan',turn_id:turn,call_id:'plan-'+turn,arguments:JSON.stringify(proactive?specialistPlanFor(id):planFor(id))}];await advanceJob(h.read());assert.equal(h.events.at(-1).success,true);h.state.calls=[];
 const sourceSHA256=createHash('sha256').update(JSON.stringify({html:raw.pages[0].html,css:raw.pages[0].css,settings:{}})).digest('hex');
 h.files['result-2']=JSON.stringify(raw);h.files['audit-2']=JSON.stringify({...manifest,pages:[{id,files:{phone:'phone.png'},visualSourceSHA256:sourceSHA256}]});h.files['phone']=phonePNG();h.state.extraArtifacts=[{id:'phone',path:'/workspace/outputs/phone.png',turn_id:turn,size_bytes:h.files.phone.length}];return {id,raw,snapshot};
}
test('new design and single-page startup always preload five required visual modules while the remaining catalog stays on demand',async()=>{
 for(const scope of ['project','page']){const h=await harness();try{
  const manifest=JSON.parse(globalThis.automaticHarness.env.SKILL_FILES_JSON);for(const id of VISUAL_SKILLS)manifest[id].bytes=20000;globalThis.automaticHarness.env.SKILL_FILES_JSON=JSON.stringify(manifest);
  h.db.prepare("UPDATE jobs SET status='queued',session_id=NULL,environment_id=NULL,snapshot=?").run(JSON.stringify({...source,scope,visualDesignPolicy:visualDesignPolicy('design')}));await startJob(h.read());assert.equal(h.starts.length,1);
  const input=JSON.parse(Buffer.from(h.starts[0].environment.files.find(f=>f.path==='/workspace/input/project.json').data,'base64'));assert.deepEqual([...input.loadedSkills].sort(),[...VISUAL_SKILLS].sort());assert(h.starts[0].agent.tools.some(t=>t.name==='submit_visual_plan'));assert.equal(h.starts[0].environment.files.filter(f=>f.type==='file_id').length,6);
 }finally{h.db.close();}}
});
test('new first and single-page jobs demand actual Taste references while old jobs retain their four-module contract',async()=>{
 for(const modern of [true,false])for(const scope of ['project','page']){const h=await harness();try{
  const policy=visualDesignPolicy('design');if(!modern){delete policy.taste;policy.requiredSkills=LEGACY_VISUAL_SKILLS;policy.specialistRouting.maxLoaded=8;}
  const manifest=JSON.parse(globalThis.automaticHarness.env.SKILL_FILES_JSON);for(const id of VISUAL_SKILLS)manifest[id].bytes=20000;globalThis.automaticHarness.env.SKILL_FILES_JSON=JSON.stringify(manifest);
  h.db.prepare("UPDATE jobs SET status='queued',session_id=NULL,environment_id=NULL,snapshot=?").run(JSON.stringify({...source,scope,visualDesignPolicy:policy}));await startJob(h.read());assert.equal(h.starts.length,1);
  const body=h.starts[0],input=JSON.parse(Buffer.from(body.environment.files.find(f=>f.path==='/workspace/input/project.json').data,'base64'));assert.deepEqual([...input.loadedSkills].sort(),[...(modern?VISUAL_SKILLS:LEGACY_VISUAL_SKILLS)].sort());assert.equal(body.agent.instructions.includes('DEFAULT TASTE PARTICIPATION'),modern);assert(body.agent.instructions.includes('at most '+(modern?9:8)+' modules'));if(modern){assert.match(body.agent.instructions,/references\/xhs-static-adapter\.md/);assert.match(body.agent.instructions,/METHODS MODE for static editable/);}
 }finally{h.db.close();}}
});
test('on-demand loading allows a ninth module only under the new frozen budget and never a tenth',async()=>{
 for(const modern of [true,false]){const h=await harness();try{
  const policy=visualDesignPolicy('design');if(!modern){delete policy.taste;policy.requiredSkills=LEGACY_VISUAL_SKILLS;policy.specialistRouting.maxLoaded=8;}
  const candidates=skills.filter(skill=>skill.group!=='文案优化').map(skill=>skill.id),loaded=candidates.slice(0,8),remaining=candidates.slice(8,10),resources=Object.fromEntries(remaining.map(id=>['skill/'+id,{kind:'skill',id,loaded:false,file_id:'shared-'+id,path:'/workspace/bundles/'+id+'.zip'}]));h.db.prepare('UPDATE jobs SET snapshot=?').run(JSON.stringify({...source,loadedSkills:loaded,visualDesignPolicy:policy,_resources:resources}));
  for(const [index,id]of remaining.entries()){h.state.calls=[{type:'function_call',name:'load_design_resource',turn_id:'turn-1',call_id:'budget-'+index,arguments:JSON.stringify({resourceId:'skill/'+id})}];await advanceJob(h.read());assert.equal(h.events.at(-1).success,modern&&index===0);}
  assert.equal(h.attachments.length,modern?1:0);assert.equal(JSON.parse(h.read().snapshot).loadedSkills.length,modern?9:8);
 }finally{h.db.close();}}
});
test('proactive routing loads a real optional resource, binds its method to the page and reaches independent review',async()=>{
 for(const scope of ['project','page']){const h=await harness();try{const {id}=await visualFixture(h,{scope,proactive:true});assert.equal(h.attachments.length,1);const snapshot=JSON.parse(h.read().snapshot);assert(snapshot.loadedSkills.includes('xhs-note-creator'));assert.equal(snapshot.visualDispatch.plan.specialists.length,10);assert(snapshot.visualDispatch.skills.some(skill=>skill.id==='xhs-note-creator'&&skill.loaded));await advanceJob(h.read());assert.equal(h.reviews.length,1);h.state.visualResponse=responseFor(reviewFor([id]));await advanceJob(h.read());assert.equal(h.read().status,'completed');const result=JSON.parse(h.read().result);assert.equal(result.usedSkills.length,6);assert.equal(result.visualDesign.plan.specialists.filter(item=>item.status==='use').length,1);assert(!h.deleted.includes('/files/shared-note-file'));}finally{h.db.close();}}
});
test('a selected specialist cannot disappear from the final used-skills report after composition acceptance',async()=>{
 const h=await harness();try{const {raw}=await visualFixture(h,{proactive:true});h.files['result-2']=JSON.stringify({...raw,usedSkills:VISUAL_SKILLS});await advanceJob(h.read());assert.equal(h.reviews.length,0);assert.equal(h.read().status,'running');assert(JSON.parse(h.read().result).repairing);assert.match(h.events.at(-1).input[0].content[0].text,/专长未实际载入|专长/);}finally{h.db.close();}
});
test('missing composition registration cannot be replaced by five required visual modules or a fabricated reviewer pass',async()=>{
 const h=await harness();try{
  h.db.prepare('UPDATE jobs SET snapshot=?').run(JSON.stringify({...source,loadedSkills:VISUAL_SKILLS,visualDesignPolicy:visualDesignPolicy('design')}));h.files['result-1']=JSON.stringify({...validResult,usedSkills:VISUAL_SKILLS,visualReview:{status:'passed',independent:true}});await advanceJob(h.read());assert.equal(h.read().status,'running');assert.equal(h.reviews.length,0);assert(JSON.parse(h.read().result).repairing);assert.match(h.events.at(-1).input[0].content[0].text,/构图调度/);
 }finally{h.db.close();}
});
test('the reviewer receives actual images and constraints in a separate call, without designer self-approval or tools',async()=>{
 const h=await harness();try{
  const {id,raw}=await visualFixture(h);h.files['result-2']=JSON.stringify({...raw,report:'DESIGNER_SELF_APPROVAL_TOKEN',visualReview:{status:'passed'}});await advanceJob(h.read());assert.equal(h.read().status,'running');assert.equal(h.storedFiles.length,0);assert.equal(h.reviews.length,1);const request=h.reviews[0];assert(request.background);assert.equal(request.tools,undefined);assert.equal(request.text.format.type,'json_schema');assert(request.input[0].content.some(c=>c.type==='input_image'&&c.image_url.startsWith('data:image/png;base64,')));assert(!JSON.stringify(request.input).includes('DESIGNER_SELF_APPROVAL_TOKEN'));assert.match(request.instructions,/<Taste-static-methods>/);assert.match(request.instructions,/静态/);
  await advanceJob(h.read());assert.equal(h.reviews.length,1);assert.equal(h.read().status,'running');h.state.visualResponse=responseFor(reviewFor([id]));await advanceJob(h.read());const result=JSON.parse(h.read().result);assert.equal(h.read().status,'completed');assert.equal(result.visualReview.status,'passed');assert.equal(result.visualReview.independent,true);assert.equal(result.visualReview.jobId,'job-test');assert.deepEqual(result.visualReview.taste,{version:1,mode:'methods'});assert.equal(result.visualDesign.skills.length,5);assert.equal(result.visualReview.images.length,1);assert.equal(result.visualReview.images[0].sha256.length,64);assert(h.deleted.includes('/responses/response-visual-1'));assert(h.deleted.includes('/agents/sessions/session-test'));
 }finally{h.db.close();}
});
test('scoped review schema limits page identifiers without restricting prose or suppressing page-level rejection',async()=>{
 for(const scope of ['project','page']){const h=await harness();try{
  const {id}=await visualFixture(h,{scope});await advanceJob(h.read());const schema=h.reviews[0].text.format.schema;
  assert.deepEqual(schema.properties.pages.items.properties.pageId.enum,[id]);assert.equal(schema.properties.summary.enum,undefined);
  const finding=schema.properties.pages.items.properties.checks.items.properties;assert.equal(finding.observation.enum,undefined);assert.equal(finding.fix.enum,undefined);assert(finding.judgment.enum.includes('revise'));assert.deepEqual(schema.properties.series.properties.judgment.enum,['pass','advisory']);
 }finally{h.db.close();}}
});
test('independent review retains a source page requirement when automatic pagination assigns a new output ID',async()=>{
 const h=await harness();try{
  const {id}=await visualFixture(h),snapshot=JSON.parse(h.read().snapshot);snapshot.pages[0].requirements='标题放在一行';h.db.prepare('UPDATE jobs SET snapshot=?').run(JSON.stringify(snapshot));await advanceJob(h.read());const context=JSON.parse(h.reviews[0].input[0].content[0].text);assert.equal(context.pages[0].id,id);assert.notEqual(id,snapshot.pages[0].id);assert.deepEqual(context.pages[0].requirements,[{sourcePageId:snapshot.pages[0].id,text:'标题放在一行'}]);
 }finally{h.db.close();}
});
for(const recovers of [true,false])test(recovers?'a transient artifact read preserves the approved design and resumes without repeating AI review':'repeated transport reads stop after two retained attempts without a redesign loop',async()=>{
 const h=await harness(),original=globalThis.automaticHarness.api;try{
  const {id}=await visualFixture(h);await advanceJob(h.read());h.state.visualResponse=responseFor(reviewFor([id]));let attempts=0;
  globalThis.automaticHarness.api=async(path,options)=>{if(path.endsWith('/artifacts/png-2/content')&&(!recovers||attempts===0)){attempts++;throw Object.assign(new Error('temporary read timeout'),{retryableRead:true});}return original(path,options);};
  await advanceJob(h.read());assert.equal(h.read().status,'running');assert.equal(h.reviews.length,1);assert.equal(JSON.parse(h.read().snapshot)._visualReview.phase,'passed');assert.equal(JSON.parse(h.read().snapshot).transientReadFailures,1);assert(!h.deleted.includes('/agents/sessions/session-test'));assert.equal(h.storedFiles.length,0);
  await advanceJob(h.read());if(!recovers){assert.equal(h.read().status,'running');await advanceJob(h.read());assert.equal(h.read().status,'failed');assert.equal(attempts,3);assert(h.deleted.includes('/agents/sessions/session-test'));}else assert.equal(h.read().status,'completed');assert.equal(h.reviews.length,1);assert.equal(h.events.filter(e=>e.type==='agent.session.input.message').length,0);
 }finally{globalThis.automaticHarness.api=original;h.db.close();}
});
for(const finalPass of [true,false])test(finalPass?'a visual rejection gets one scoped redesign and a fresh image review before completion':'a second visual rejection stops safely without another paid review or correction loop',async()=>{
 const h=await harness();try{
  const {id}=await visualFixture(h,{scope:'page'});await advanceJob(h.read());h.state.visualResponse=responseFor(reviewFor([id],true));await advanceJob(h.read());assert.equal(h.read().status,'running');assert(JSON.parse(h.read().result).repairing);assert.equal(h.events.filter(e=>e.type==='agent.session.input.message').length,1);assert.match(h.events.at(-1).input[0].content[0].text,/独立看图/);
  // Preserve the original scoped snapshot while registering the corrected turn.
  const snapshot=JSON.parse(h.read().snapshot);h.state.turn='turn-3';h.state.calls=[{type:'function_call',name:'submit_visual_plan',turn_id:'turn-3',call_id:'plan-corrected',arguments:JSON.stringify(planFor(id))}];await advanceJob(h.read());h.state.calls=[];h.state.extraArtifacts[0].turn_id='turn-3';h.files.phone=phonePNG(240);h.state.visualResponse={status:'in_progress'};await advanceJob(h.read());assert.equal(h.reviews.length,2);h.state.visualResponse=responseFor(reviewFor([id],!finalPass));await advanceJob(h.read());assert.equal(h.read().status,finalPass?'completed':'failed');assert.equal(h.events.filter(e=>e.type==='agent.session.input.message').length,1);assert.equal(h.reviews.length,2);assert.equal(JSON.parse(h.read().snapshot).scope,snapshot.scope);if(finalPass){const result=JSON.parse(h.read().result);assert.equal(result.repairAttempts,1);assert.deepEqual(result.visualReviewHistory.map(review=>review.status),['revise','passed']);}else assert.equal(h.storedFiles.length,0);
 }finally{h.db.close();}
});
test('missing or stale actual render evidence and changed approved image bytes never reach application',async()=>{
 const h=await harness();try{
  const {id}=await visualFixture(h);await advanceJob(h.read());h.state.visualResponse=responseFor(reviewFor([id]));h.files.phone=phonePNG(200);await advanceJob(h.read());assert.equal(h.read().status,'running');assert(JSON.parse(h.read().result).repairing);assert.equal(h.storedFiles.length,0);assert.equal(h.reviews.length,1);assert.match(h.events.at(-1).input[0].content[0].text,/成图发生改变/);
 }finally{h.db.close();}
});
test('an unchanged predecessor phone image remains available during both correction review and final delivery',async()=>{
 const h=await harness();try{
  const {id}=await visualFixture(h);await advanceJob(h.read());h.state.visualResponse=responseFor(reviewFor([id],true));await advanceJob(h.read());h.state.turn='turn-3';h.state.calls=[{type:'function_call',name:'submit_visual_plan',turn_id:'turn-3',call_id:'plan-retained',arguments:JSON.stringify(planFor(id))}];await advanceJob(h.read());h.state.calls=[];
  // An immutable hosted artifact is not republished when its bytes are unchanged.
  assert.equal(h.state.extraArtifacts[0].turn_id,'turn-2');h.state.visualResponse={status:'in_progress'};await advanceJob(h.read());assert.equal(h.reviews.length,2);assert.equal(JSON.parse(h.read().result).previousTurn,'turn-2');h.state.visualResponse=responseFor(reviewFor([id]));await advanceJob(h.read());assert.equal(h.read().status,'completed');const result=JSON.parse(h.read().result);assert.equal(result.visualReview.turnId,'turn-3');assert.equal(result.visualReview.images[0].artifactTurnId,'turn-2');assert(result.artifacts.some(artifact=>artifact.name==='phone.png'));
 }finally{h.db.close();}
});
test('a reviewer failure cannot fall back to designer approval',async()=>{
 const h=await harness();try{await visualFixture(h);await advanceJob(h.read());h.state.visualResponse={status:'failed'};await advanceJob(h.read());assert.equal(h.read().status,'failed');assert.match(h.read().error,/独立视觉复核/);assert.equal(h.storedFiles.length,0);assert(h.deleted.includes('/responses/response-visual-1'));}finally{h.db.close();}
});
test('cancelling while an independent review is created cleans its response and preserves cancellation',async()=>{
 const h=await harness(),previous=globalThis.automaticHarness.api;try{await visualFixture(h);globalThis.automaticHarness.api=async(path,options)=>{const value=await previous(path,options);if(path==='/responses'&&options.method==='POST')h.db.exec("UPDATE jobs SET status='cancelled'");return value;};await advanceJob(h.read());assert.equal(h.read().status,'cancelled');assert(h.deleted.includes('/responses/response-visual-1'));assert.equal(h.storedFiles.length,0);}finally{h.db.close();}
});
test('cancellation is durable before provider cleanup so a concurrent new review can observe the stop',async()=>{
 const h=await harness(),previous=globalThis.automaticHarness.api;try{await visualFixture(h);let observed=false;globalThis.automaticHarness.api=async(path,options)=>{if(path.endsWith('/events')&&options.body.events.some(event=>event.type==='agent.session.input.cancel')){observed=true;assert.equal(h.read().status,'cancelled');}return previous(path,options);};await cancelJob(h.read());assert(observed);assert.equal(h.read().status,'cancelled');assert(h.deleted.includes('/agents/sessions/session-test'));}finally{globalThis.automaticHarness.api=previous;h.db.close();}
});
test('a session deletion failure cannot skip private inputs, and unsuccessful file deletions retain their handles',async()=>{
 const h=await harness(),previous=globalThis.automaticHarness.api,attempted=[];try{h.db.prepare('UPDATE jobs SET provider_files=?').run(JSON.stringify(['private-a','private-b']));globalThis.automaticHarness.api=async(path,options)=>{if(options.method==='DELETE'){attempted.push(path);if(path==='/agents/sessions/session-test'||path==='/files/private-b')throw Error('cleanup transport failure');}return previous(path,options);};await cancelJob(h.read());assert.equal(h.read().status,'cancelled');assert(attempted.includes('/files/private-a'));assert(attempted.includes('/files/private-b'));assert.deepEqual(JSON.parse(h.read().provider_files),['private-b']);}finally{globalThis.automaticHarness.api=previous;h.db.close();}
});
test('SQLite callback lookup finds a pending independent review without confusing it with image generation',async()=>{
 const h=await harness();try{const snapshot={...source,_visualReview:{responseId:'visual-response',phase:'pending'}};h.db.prepare('UPDATE jobs SET snapshot=?').run(JSON.stringify(snapshot));const lookup=h.db.prepare("SELECT id FROM jobs WHERE json_extract(image_state,'$.responseId')=? OR json_extract(snapshot,'$._visualReview.responseId')=?");assert.equal(lookup.get('visual-response','visual-response').id,'job-test');assert.equal(lookup.get('outside','outside'),undefined);}finally{h.db.close();}
});
