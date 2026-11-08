import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';
import path from 'node:path';
import {canApplyAutomatic,hasAuditErrors,automaticMessage,designProposal,jobApplied} from '../src/ai-workflow.js';
import {parseManuscript} from '../src/engine.js';

const rawPlugin={name:'raw-source',setup(build){build.onResolve({filter:/\?raw$/},args=>({path:path.resolve(args.resolveDir,args.path.slice(0,-4)),namespace:'raw-source'}));build.onLoad({filter:/.*/,namespace:'raw-source'},async args=>({loader:'text',contents:await fs.readFile(args.path,'utf8')}));}};
async function bundle(entry,plugins=[]){const {outputFiles}=await build({entryPoints:[entry],bundle:true,write:false,platform:'node',format:'esm',plugins:[...plugins,rawPlugin]});return import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));}
const {validateDesignResult}=await bundle('server/design-result.ts');
const {skills,routeSkills}=await bundle('server/skills.ts');
const {imageAllowed,repairAllowed,renderAudit,automaticPages,automaticAssets}=await bundle('server/automatic-workflow.ts');
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
const {advanceJob,startJob}=await bundle('server/agent.ts',[coreMock]);
const {publicPhotoURL,photoCandidates,webPhotosAllowed}=await bundle('server/photo-search.ts',[coreMock]);
async function harness(){
 const db=new DatabaseSync(':memory:');for(const name of (await fs.readdir('drizzle')).filter(name=>name.endsWith('.sql')).sort())db.exec(await fs.readFile('drizzle/'+name,'utf8'));
 db.prepare("INSERT INTO jobs(id,user_id,project_id,request_id,kind,prompt,skill_ids,snapshot,base_revision,status,session_id,environment_id,provider_files,lease_until,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,'running','session-test','env-test','[]',0,?,?)").run('job-test','visitor_test','own-project','test-request','design','自动设计',job.skill_ids,job.snapshot,1,Date.now(),Date.now());
 const events=[],storedFiles=[],deleted=[],attachments=[],starts=[],responses=[],state={turn:'turn-1',invalid:true,calls:[],searchResponse:{status:'completed',output:[]}};
 const files={
  'result-1':JSON.stringify({...validResult,pages:[{...validResult.pages[0],css:'.xhs-card{background:url(external.png)}'}]}),
  'result-2':JSON.stringify(validResult),'audit-1':JSON.stringify(manifest),'audit-2':JSON.stringify(manifest),'font-1':'test-font','png-2':'test-png',
 };
 const DB={prepare(sql){return {bind(...args){return {async run(){const result=db.prepare(sql).run(...args);return {meta:{changes:result.changes}};},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};}};}};}};
 const api=async(path,options={})=>{
  if(options.method==='DELETE'){deleted.push(path);return {};}
  if(path==='/responses'){responses.push(options.body);return {id:'response-photo-search'};}
  if(path==='/responses/response-photo-search')return state.searchResponse;
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
 globalThis.automaticHarness={env:{DB,SKILL_FILES_JSON:JSON.stringify(skillFiles),BUCKET:{async put(key,bytes){storedFiles.push({key,bytes});},async get(key){const file=storedFiles.find(file=>file.key===key);return file?{arrayBuffer:async()=>file.bytes}:null;}}},api,upload:async()=>'provider-photo-file'};
 return {db,events,storedFiles,deleted,attachments,starts,responses,state,files,read:()=>db.prepare('SELECT * FROM jobs WHERE id=?').get('job-test')};
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

test('uploaded-photo crop records require at least 80% retained area; actual web photos are exempt',()=>{
 const html=markup(blocks).replace('</section>','<img data-asset-id="photo" src="/api/files/photo"></section>'),pages=[{id:'reading-cover',html}],record=fraction=>({...manifest,pages:[{id:'reading-cover',imageChecks:[{assetId:'photo',source:'upload',visibleFraction:fraction,loaded:true,passed:true}]}]});
 assert.equal(renderAudit(record(.8),1,pages,[{id:'photo',source:'upload'}]).status,'passed');
 for(const value of [.799,NaN,1.01,-.1])assert.throws(()=>renderAudit(record(value),1,pages,[{id:'photo',source:'upload'}]));
 assert.throws(()=>renderAudit(manifest,1,pages,[{id:'photo'}]));
 const web={...record(.3),pages:[{id:'reading-cover',imageChecks:[{...record(.3).pages[0].imageChecks[0],source:'web'}]}]};
 assert.equal(renderAudit(web,1,pages,[{id:'photo',source:'web'}]).status,'passed');
 assert.throws(()=>renderAudit(web,1,pages,[{id:'photo',source:'upload'}]));
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
