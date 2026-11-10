import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';
import {COPY_CORE,COPY_CANDIDATES,COPY_SKILLS,COPY_CHECKS,copyHash,copyPolicy,normalizeCopyFlow,designCopyIssue,validateCopyPlan,validateCopyProposal,validateCopyReview} from '../src/copy-workflow.js';
import {parseManuscript,validateProject} from '../src/engine.js';
import {createCopyWizard} from '../src/copy-wizard.js';
import {jobProgress} from '../src/job-progress.js';

const original='（1P）周末阅读小组\n周六14:00至16:00共读。\n每组最多8人，每次30元。\n首次可旁听，需提前预约。不承诺任何学习成绩。';
const draft='周末共读，给阅读留出两小时\n周六14:00至16:00，参加阅读小组。\n每组最多8人，每次30元。首次可旁听，需提前预约。\n活动不承诺任何学习成绩。';
function planFor(optional=[]){const ids=[...COPY_CORE,...optional];return {version:1,intent:'整理本次阅读小组信息，保留时间、人数、费用与预约条件。',skills:ids.map(id=>({id,sources:['/workspace/skills/'+id+'/SKILL.md',...(id==='xhs-writer'?['/workspace/skills/xhs-writer/references/xiaohongshu-viral-methodology.md']:COPY_CANDIDATES.find(card=>card.id===id)?.reference==='SKILL.md'?[]:['/workspace/skills/'+id+'/'+COPY_CANDIDATES.find(card=>card.id===id).reference])]})),choices:COPY_CANDIDATES.map(card=>({skillId:card.id,status:ids.includes(card.id)?'use':'skip',reason:ids.includes(card.id)?'本次需要整理标题、条件和具体活动信息。':'原稿已提供完整活动资料，本次无需扩展这一能力。',action:ids.includes(card.id)?'将活动条件分开表达，保留全部数字、预约要求与限制。':''}))};}
async function snapshotFor(optional=[]){const plan=planFor(optional);return {workflow:'copy',scope:'project',pages:parseManuscript(original,{preserveText:true}),assets:[],imageMode:'none',sourceText:original,sourceHash:await copyHash(original),copyOptimizationPolicy:copyPolicy(original),loadedSkills:plan.skills.map(skill=>skill.id),copyDispatch:{version:1,turnId:'turn-1',skills:plan.skills.map(skill=>({id:skill.id,loaded:true})),plan}};}
const rawFor=(ids=COPY_CORE)=>({summary:'已优化活动文案',report:'实际保留时间、人数、费用、预约条件和成绩限制。',usedSkills:ids,pages:[],sources:[],copyOptimization:{version:1,pages:[{text:draft,sourcePages:[1]}],changes:['把活动条件分段，便于阅读。','保留数字、旁听条件与成绩限制。']}});
function reviewFor(revise=false){return {status:revise?'revise':'passed',summary:revise?'需要恢复条件。':'逐项对照原稿，活动条件和分页完整。',checks:COPY_CHECKS.map(topic=>({topic,judgment:revise&&topic==='coverage'?'revise':'pass',evidence:topic==='facts'?'时间、8人上限、30元与预约条件均保留。':'已对照原稿与提案，未发现本项内容遗漏或越界。',fix:revise&&topic==='coverage'?'恢复首次旁听仍需预约的条件。':''}))};}
const responseFor=value=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}]});

test('writing policy distinguishes explicit pages and evaluates six candidates with three required skills',()=>{
 assert.equal(copyPolicy(original).paginationMode,'fixed');assert.equal(copyPolicy('周末共读\n两小时阅读').paginationMode,'auto');assert.equal(copyPolicy('（1P）封面\n说明\n（2P）安排\n内容').sourcePages,2);assert.deepEqual(copyPolicy(original).requiredSkills,COPY_CORE);assert.equal(COPY_SKILLS.length,7);assert.equal(COPY_CANDIDATES.length,6);
});
test('writing capability cards reference existing installed instructions and method files',async()=>{
 for(const card of COPY_CANDIDATES){assert((await fs.stat(new URL('../design-skills/'+card.id+'/SKILL.md',import.meta.url))).isFile());assert((await fs.stat(new URL('../design-skills/'+card.id+'/'+card.reference,import.meta.url))).isFile());}assert((await fs.stat(new URL('../design-skills/xhs-writer/references/xiaohongshu-viral-methodology.md',import.meta.url))).isFile());
});
test('copy progress names writing and review stages without calling them layout or design',()=>{
 const job={kind:'copy',status:'running'};assert.equal(jobProgress({...job,copyStage:'matching'}).shortAction,'选法');assert.equal(jobProgress({...job,copyStage:'drafting'}).shortAction,'优化');assert.equal(jobProgress({...job,copyStage:'reviewing'}).shortAction,'审校');assert.match(jobProgress({...job,status:'queued',startingRequest:true}).message,/文案/);assert.equal(jobProgress({...job,status:'completed'}),null);
});
test('skill registration requires actual loaded modules, real references and a decision for every candidate',async()=>{
 const snapshot=await snapshotFor();assert.deepEqual(validateCopyPlan(planFor(),snapshot),planFor());
 const invalid=[];let plan=planFor();plan.choices.pop();invalid.push(plan);plan=planFor();plan.choices[0].status='skip';invalid.push(plan);plan=planFor();plan.skills[0].sources.pop();invalid.push(plan);plan=planFor();plan.skills[1].sources[1]='/workspace/skills/copywriting/../outside.md';invalid.push(plan);plan=planFor();plan.choices[0].reason='用了';invalid.push(plan);plan=planFor(['humanizer-zh']);invalid.push(plan);
 for(const value of invalid)assert.throws(()=>validateCopyPlan(value,snapshot));
 assert.deepEqual(validateCopyPlan(planFor(['humanizer-zh']),await snapshotFor(['humanizer-zh'])),planFor(['humanizer-zh']));
});
test('fixed-page proposals cannot split, merge, move source ownership, fabricate skill use or claim approval',async()=>{
 const snapshot=await snapshotFor(),raw=rawFor(),result=validateCopyProposal({...raw,copyReview:{independent:true,status:'passed'}},snapshot,'turn-1');assert.equal(result.manuscript,draft);assert.equal(result.copyReview,undefined);
 for(const bad of [
  {...raw,usedSkills:[...COPY_CORE,'humanizer-zh']},
  {...raw,pages:[{id:'layout'}]},
  {...raw,copyOptimization:{...raw.copyOptimization,pages:[...raw.copyOptimization.pages,...raw.copyOptimization.pages]}},
  {...raw,copyOptimization:{...raw.copyOptimization,pages:[{text:draft,sourcePages:[2]}]}},
  {...raw,copyOptimization:{...raw.copyOptimization,pages:[{text:draft+'\n---\n多出来的一页',sourcePages:[1]}]}},
 ])assert.throws(()=>validateCopyProposal(bad,snapshot,'turn-1'));
 assert.throws(()=>validateCopyProposal(raw,snapshot,'old-turn'));assert.throws(()=>validateCopyProposal(raw,{...snapshot,copyDispatch:null},'turn-1'));
});
test('unpaginated source can gain a sensible sequence and research requires actual source records',async()=>{
 const snapshot=await snapshotFor(['content-research-writer']);snapshot.copyOptimizationPolicy.paginationMode='auto';const raw=rawFor(snapshot.loadedSkills);raw.copyOptimization.pages=[{text:'周末阅读小组',sourcePages:[1]},{text:draft,sourcePages:[1]}];assert.throws(()=>validateCopyProposal(raw,snapshot,'turn-1'),/来源/);raw.sources=[{title:'必要研究的测试来源',url:'https://example.test/primary'}];assert.equal(validateCopyProposal(raw,snapshot,'turn-1').copyOptimization.pages.length,2);raw.copyOptimization.pages[1].sourcePages=[];assert.throws(()=>validateCopyProposal(raw,snapshot,'turn-1'));
});
test('independent review must cover all five checks and cannot hide a rejection behind an overall pass',()=>{
 assert.equal(validateCopyReview(reviewFor()).status,'passed');assert.equal(validateCopyReview(reviewFor(true)).status,'revise');assert.throws(()=>validateCopyReview({...reviewFor(true),status:'passed'}));assert.throws(()=>validateCopyReview({...reviewFor(),checks:reviewFor().checks.slice(0,4)}));const bad=reviewFor(true);bad.checks.find(check=>check.judgment==='revise').fix='';assert.throws(()=>validateCopyReview(bad));
});
test('project saves cannot manufacture or delete confirmation and source changes reopen preparation',()=>{
 const flow={version:1,phase:'copy',sourceText:original,draftText:draft,confirmation:{fake:true}};const saved=normalizeCopyFlow(flow);assert.equal(saved.confirmation,null);assert.equal(normalizeCopyFlow({...flow,phase:'assets'},saved).phase,'copy');assert.throws(()=>normalizeCopyFlow({...flow,phase:'design'}));assert.throws(()=>normalizeCopyFlow(undefined,saved));assert(designCopyIssue({copyFlow:saved}));assert.equal(designCopyIssue({}),null);
 const approved={...saved,phase:'assets',confirmation:{jobId:'trusted-job'}};assert.deepEqual(normalizeCopyFlow({...approved,phase:'design',confirmation:{fake:true}},approved).confirmation,approved.confirmation);assert.equal(normalizeCopyFlow({...approved,sourceText:original+'\n新条件'},approved).confirmation,null);assert.equal(normalizeCopyFlow({...approved,phase:'copy'},approved).phase,'copy');
});
test('imported backups restore finished artwork without trusting an imported approval or job identity',()=>{
 const fixture={schema:'tuxu-project-v1',project:{id:'old',name:'备份',pages:parseManuscript(original,{preserveText:true}),assets:[],copyFlow:{version:1,phase:'design',sourceText:original,draftText:draft,jobId:'foreign',confirmation:{fake:true}}}};
 // This fixture has no HTML. Real DOM sanitization is exercised in native browser QA.
 const previous=globalThis.DOMParser;globalThis.DOMParser=class{parseFromString(html){return {body:{querySelectorAll:()=>[],innerHTML:html}};}};
 try{assert.equal(validateProject(structuredClone(fixture)).copyFlow,undefined);fixture.project.copyFlow.phase='copy';const imported=validateProject(structuredClone(fixture));assert.equal(imported.copyFlow.confirmation,null);assert.equal(imported.copyFlow.jobId,null);assert.equal(imported.copyFlow.sourceText,original);}finally{globalThis.DOMParser=previous;}
});

const coreMock={name:'copy-provider',setup(build){build.onResolve({filter:/^(?:\.\/core|\.\/server\/core)$/},()=>({path:'fixture',namespace:'copy-provider'}));build.onLoad({filter:/.*/,namespace:'copy-provider'},()=>({loader:'js',contents:`export const runtime=()=>globalThis.copyHarness.env;export const api=(path,opts)=>globalThis.copyHarness.api(path,opts);export class HttpError extends Error{retryableRead=false;constructor(status,message){super(message);this.status=status;}}export const fail=(status,message)=>{throw new HttpError(status,message)};export const cleanError=e=>e instanceof HttpError?e.message:'unexpected failure';`}));}};
const {outputFiles}=await build({stdin:{contents:"export * from './server/copy-agent';export {HttpError as CopyTransportError} from './server/core';",resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,platform:'node',format:'esm',plugins:[coreMock]});
const {startCopyJob,advanceCopyJob,cancelCopyJob,CopyTransportError}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
async function harness(){
 const db=new DatabaseSync(':memory:');for(const name of (await fs.readdir('drizzle')).filter(name=>name.endsWith('.sql')).sort())db.exec(await fs.readFile('drizzle/'+name,'utf8'));
 db.prepare("INSERT INTO jobs(id,user_id,project_id,request_id,kind,prompt,skill_ids,snapshot,base_revision,status,session_id,environment_id,provider_files,lease_until,created_at,updated_at) VALUES('copy-job','owner','own-project','request','copy','优化',?,?,1,'running','copy-session','copy-env','[]',0,?,?)").run(JSON.stringify(COPY_SKILLS),JSON.stringify(await snapshotFor()),Date.now(),Date.now());
 const DB={prepare(sql){return {bind(...values){return {async run(){return {meta:{changes:db.prepare(sql).run(...values).changes}};},async first(){return db.prepare(sql).get(...values)||null;}};}};}};
 const state={turn:'turn-1',calls:[],raw:rawFor(),review:{status:'in_progress'},turnStatus:'completed'},starts=[],events=[],deleted=[],attachments=[],reviews=[];
 const api=async(path,options={})=>{
  if(options.method==='DELETE'){deleted.push(path);return {};}
  if(path==='/agents/sessions'){starts.push(options.body);return {id:'copy-session',environment:{id:'copy-env'}};}
  if(path==='/agents/environments/copy-env/files'){attachments.push(options.body);return {};}
  if(path.endsWith('/events')){events.push(options.body.events[0]);return {};}
  if(path==='/agents/sessions/copy-session')return {status:'running',required_actions:state.calls};
  if(path.includes('/turns?'))return {data:[{id:state.turn,status:state.turnStatus}]};
  if(path.includes('/artifacts?'))return {data:[{id:'result',path:'/workspace/outputs/result.json',turn_id:state.turn,size_bytes:300}],has_more:false};
  if(path.endsWith('/artifacts/result/content'))return Response.json(state.raw);
  if(path==='/responses'){reviews.push(options.body);return {id:'copy-review-'+reviews.length};}
  if(path.endsWith('/cancel'))return {};
  if(path.startsWith('/responses/copy-review-'))return state.review;
  throw Error('Unexpected provider request '+path);
 };
 globalThis.copyHarness={env:{DB,SKILL_FILES_JSON:JSON.stringify(Object.fromEntries(COPY_SKILLS.map(id=>[id,{fileId:'shared-'+id,sha256:'test-sha'}]))),AGENT_MODEL:'test-configured-model'},api};
 return {db,state,starts,events,deleted,attachments,reviews,read:()=>db.prepare("SELECT * FROM jobs WHERE id='copy-job'").get()};
}
test('copy startup loads only core writing bundles with no browser, fonts, pictures or package installation',async()=>{
 const h=await harness();try{h.db.exec("UPDATE jobs SET status='queued',session_id=NULL,environment_id=NULL");await startCopyJob(h.read());assert.equal(h.starts.length,1);const body=h.starts[0];assert.equal(body.environment.files.filter(file=>file.type==='file_id').length,3);assert.deepEqual(body.environment.packages,{python:[],npm:[],system:[]});assert.doesNotMatch(JSON.stringify(body.environment),/playwright|chromium|font|_runtime/);assert.equal(body.agent.tools.find(tool=>tool.name==='load_design_resource').parameters.properties.resourceId.enum.length,7);assert.match(body.agent.instructions,/Actively evaluate ALL SIX/);assert.match(body.agent.instructions,/SAME COUNT/);assert.equal(body.agent.model,'test-configured-model');assert.equal(h.read().status,'running');assert.equal(JSON.parse(h.read().snapshot).loadedSkills.length,3);}finally{h.db.close();}
});
test('a helpful optional writing module loads once and registration binds it to this turn',async()=>{
 const h=await harness();try{
  const snapshot=JSON.parse(h.read().snapshot);snapshot._copyResources={'skill/humanizer-zh':{id:'humanizer-zh',file_id:'shared-humanizer',path:'/workspace/bundles/humanizer-zh.zip',loaded:false}};h.db.prepare('UPDATE jobs SET snapshot=?').run(JSON.stringify(snapshot));
  h.state.calls=[{type:'function_call',name:'load_design_resource',turn_id:'turn-1',call_id:'load',arguments:JSON.stringify({resourceId:'skill/humanizer-zh'})}];await advanceCopyJob(h.read());await advanceCopyJob(h.read());assert.equal(h.attachments.length,1);
  h.state.calls=[{type:'function_call',name:'submit_copy_plan',turn_id:'turn-1',call_id:'plan',arguments:JSON.stringify(planFor(['humanizer-zh']))}];await advanceCopyJob(h.read());assert.equal(h.events.at(-1).success,true);const dispatch=JSON.parse(h.read().snapshot).copyDispatch;assert.equal(dispatch.plan.choices.length,6);assert(dispatch.skills.some(skill=>skill.id==='humanizer-zh'&&skill.loaded));
  h.state.calls=[{type:'function_call',name:'load_design_resource',turn_id:'turn-1',call_id:'outside',arguments:JSON.stringify({resourceId:'image/foreign-project'})}];await advanceCopyJob(h.read());assert.equal(h.events.at(-1).success,false);assert.equal(h.attachments.length,1);
 }finally{h.db.close();}
});
test('a separate reviewer compares source and proposal without the drafter plan, self-report or tools',async()=>{
 const h=await harness();try{h.state.raw.report='DRAFTER_SELF_APPROVAL';h.state.raw.copyReview={status:'passed',independent:true};await advanceCopyJob(h.read());assert.equal(h.read().status,'running');assert.equal(h.reviews.length,1);const request=h.reviews[0];assert.equal(request.model,'test-configured-model');assert.equal(request.tools,undefined);assert.equal(request.background,true);assert(!JSON.stringify(request.input).includes('DRAFTER_SELF_APPROVAL'));assert(!JSON.stringify(request.input).includes('copyDispatch'));assert.equal(JSON.parse(request.input[0].content[0].text).source,original);await advanceCopyJob(h.read());assert.equal(h.reviews.length,1);
  h.state.review=responseFor(reviewFor());await advanceCopyJob(h.read());const result=JSON.parse(h.read().result);assert.equal(h.read().status,'completed');assert.equal(result.copyReview.independent,true);assert.equal(result.copyReview.jobId,'copy-job');assert.equal(result.copyReview.manuscriptHash,await copyHash(result.manuscript));assert(h.deleted.includes('/responses/copy-review-1'));assert(h.deleted.includes('/agents/sessions/copy-session'));assert(!h.deleted.some(path=>path.startsWith('/files/')));
 }finally{h.db.close();}
});
for(const passes of [true,false])test(passes?'a rejected draft receives one correction and a fresh independent review':'a second text rejection stops without another correction loop',async()=>{
 const h=await harness();try{await advanceCopyJob(h.read());h.state.review=responseFor(reviewFor(true));await advanceCopyJob(h.read());assert(JSON.parse(h.read().result).repairing);assert.equal(h.events.filter(event=>event.type==='agent.session.input.message').length,1);await advanceCopyJob(h.read());assert.equal(h.reviews.length,1);
  h.state.turn='turn-2';h.state.calls=[{type:'function_call',name:'submit_copy_plan',turn_id:'turn-2',call_id:'corrected-plan',arguments:JSON.stringify(planFor())}];await advanceCopyJob(h.read());h.state.calls=[];h.state.review={status:'in_progress'};await advanceCopyJob(h.read());assert.equal(h.reviews.length,2);h.state.review=responseFor(reviewFor(!passes));await advanceCopyJob(h.read());assert.equal(h.read().status,passes?'completed':'failed');assert.equal(h.events.filter(event=>event.type==='agent.session.input.message').length,1);if(passes)assert.equal(JSON.parse(h.read().result).repairAttempts,1);assert(h.deleted.includes('/agents/sessions/copy-session'));
 }finally{h.db.close();}
});
test('a fixed-pagination violation is corrected once; reviewer failure cannot fall back to self-approval',async()=>{
 const h=await harness();try{h.state.raw.copyOptimization.pages.push({text:'多出一页',sourcePages:[1]});await advanceCopyJob(h.read());assert(JSON.parse(h.read().result).repairing);assert.equal(h.reviews.length,0);assert.match(h.events.at(-1).input[0].content[0].text,/拆页/);h.state.turn='turn-2';h.state.raw=rawFor();h.state.calls=[{type:'function_call',name:'submit_copy_plan',turn_id:'turn-2',call_id:'replan',arguments:JSON.stringify(planFor())}];await advanceCopyJob(h.read());h.state.calls=[];await advanceCopyJob(h.read());h.state.review={status:'failed'};await advanceCopyJob(h.read());assert.equal(h.read().status,'failed');assert.match(h.read().error,/独立文案审校/);assert(h.deleted.includes('/responses/copy-review-1'));}finally{h.db.close();}
});
for(const point of ['session','attachment','review'])test('cancellation during '+point+' creation remains durable and cleans late handles',async()=>{
 const h=await harness(),previous=globalThis.copyHarness.api;try{
  if(point==='session')h.db.exec("UPDATE jobs SET status='queued',session_id=NULL,environment_id=NULL");
  if(point==='attachment'){const snapshot=JSON.parse(h.read().snapshot);snapshot._copyResources={'skill/humanizer-zh':{id:'humanizer-zh',file_id:'shared-humanizer',path:'/workspace/bundles/humanizer-zh.zip',loaded:false}};h.db.prepare('UPDATE jobs SET snapshot=?').run(JSON.stringify(snapshot));h.state.calls=[{type:'function_call',name:'load_design_resource',turn_id:'turn-1',call_id:'late-load',arguments:JSON.stringify({resourceId:'skill/humanizer-zh'})}];}
  globalThis.copyHarness.api=async(path,options)=>{const result=await previous(path,options);if(path===(point==='session'?'/agents/sessions':point==='attachment'?'/agents/environments/copy-env/files':'/responses'))h.db.exec("UPDATE jobs SET status='cancelled'");return result;};
  if(point==='session')await startCopyJob(h.read());else await advanceCopyJob(h.read());assert.equal(h.read().status,'cancelled');assert.equal(h.read().error,null);if(point==='review')assert(h.deleted.includes('/responses/copy-review-1'));if(point==='attachment')assert(!h.events.some(event=>event.call_id==='late-load'));else assert(h.deleted.includes('/agents/sessions/copy-session'));
 }finally{h.db.close();}
});
test('cancel is persisted before calling the provider and shared skill files are never deleted',async()=>{
 const h=await harness(),previous=globalThis.copyHarness.api;try{globalThis.copyHarness.api=async(path,options)=>{if(path.endsWith('/events'))assert.equal(h.read().status,'cancelled');return previous(path,options);};await cancelCopyJob(h.read());assert.equal(h.read().status,'cancelled');assert(!h.deleted.some(path=>path.startsWith('/files/')));}finally{h.db.close();}
});
test('transient reads retain the current review and stop after two bounded retries',async()=>{
 const h=await harness(),previous=globalThis.copyHarness.api;try{await advanceCopyJob(h.read());
  globalThis.copyHarness.api=async(path,options)=>{if(path.startsWith('/responses/copy-review-')&&!options?.method)throw Object.assign(new CopyTransportError(502,'read timeout'),{retryableRead:true});return previous(path,options);};
  await advanceCopyJob(h.read());assert.equal(h.read().status,'running');assert.equal(JSON.parse(h.read().snapshot)._copyReview.responseId,'copy-review-1');await advanceCopyJob(h.read());assert.equal(h.read().status,'running');await advanceCopyJob(h.read());assert.equal(h.read().status,'failed');assert.equal(h.reviews.length,1);assert(h.deleted.includes('/responses/copy-review-1'));
 }finally{h.db.close();}
});

async function wizardFixture(){
 const result=validateCopyProposal(rawFor(),await snapshotFor(),'turn-1');result.copyReview={...reviewFor(),independent:true,jobId:'copy-job',sourceHash:await copyHash(original)};
 const p={id:'own-project',assets:[{id:'retained-photo',source:'upload'}],stylePresetId:'preset-1',pages:parseManuscript(original,{preserveText:true}),copyFlow:{version:1,phase:'copy',sourceText:original,draftText:'',jobId:'copy-job',proposalJobId:null,confirmation:null}},job={id:'copy-job',projectId:p.id,kind:'copy',status:'completed',copySourceHash:await copyHash(original),result};
 const S={projects:[p],jobs:[job],session:{capabilities:{ai:true}}};const saves=[],toasts=[];globalThis.document={querySelector:()=>null,querySelectorAll:()=>[]};
 const wizard=createCopyWizard({S,project:()=>p,render:()=>{},scheduleSave:()=>{},persist:async()=>{},toast:text=>toasts.push(text),closeModal:()=>{},button:()=>'',stylePresetChoices:()=>'',showSelectedPreset:()=>{},readImageFiles:async()=>[],cloud:()=>({save:async p=>{saves.push(structuredClone(p));},request:async()=>({job}),updateBadge:()=>{}})});return {p,job,wizard,saves,toasts};
}
test('copy delivery cannot overwrite text changed during hashing, an older job or a user-edited ready draft',async()=>{
 const h=await wizardFixture();let pending=h.wizard.receive(h.job);h.p.copyFlow.sourceText+='\n新条件';await pending;assert.equal(h.p.copyFlow.draftText,'');assert.equal(h.saves.length,0);
 h.p.copyFlow.sourceText=original;h.p.copyFlow.jobId='newer-copy-job';await h.wizard.receive(h.job);assert.equal(h.p.copyFlow.draftText,'');h.p.copyFlow.jobId=h.job.id;delete h.job.clientState;await h.wizard.receive(h.job);assert.equal(h.p.copyFlow.draftText,draft);h.p.copyFlow.draftText='用户手动编辑后的确认稿';await h.wizard.receive(h.job);assert.equal(h.p.copyFlow.draftText,'用户手动编辑后的确认稿');assert.equal(h.saves.length,1);
});
test('returning to text preserves uploaded pictures, selected recipe and editable proposal',async()=>{
 const h=await wizardFixture();h.p.copyFlow.phase='assets';h.p.copyFlow.draftText=draft;h.p.copyFlow.proposalJobId=h.job.id;h.p.copyFlow.confirmation={jobId:h.job.id};await h.wizard.actions['copy-back']();assert.equal(h.p.copyFlow.phase,'copy');assert.equal(h.p.copyFlow.confirmation,null);assert.equal(h.p.assets[0].id,'retained-photo');assert.equal(h.p.stylePresetId,'preset-1');assert.equal(h.p.copyFlow.draftText,draft);assert.equal(h.p.copyFlow.proposalJobId,h.job.id);
});
test('switching projects during preparation cannot save the job onto or start designing the other project',async()=>{
 const first={id:'first',assets:[],pages:parseManuscript(original,{preserveText:true}),copyFlow:{version:1,phase:'copy',sourceText:original,draftText:'',confirmation:null}},other={id:'other',pages:parseManuscript('另一项目\n不修改',{preserveText:true}),assets:[]};let selected=first;const S={projects:[first,other],jobs:[],session:{capabilities:{ai:true}}},saved=[],errors=[];let designCalls=0,switchOnSave=false;
 globalThis.document={querySelector:()=>null,querySelectorAll:()=>[]};
 const cloud={save:async p=>{saved.push({id:p.id,jobId:p.copyFlow?.jobId});p._cloudDirty=false;if(switchOnSave)selected=other;},request:async()=>{selected=other;return {job:{id:'captured-copy',projectId:first.id,kind:'copy',status:'queued'}};},startPolling(){},updateBadge(){},startDesign:async()=>{designCalls++;}};
 const wizard=createCopyWizard({S,project:()=>selected,render(){},scheduleSave(){first._cloudDirty=true;},persist:async()=>{},toast:text=>errors.push(text),closeModal(){},button:()=>'',stylePresetChoices:()=>'',showSelectedPreset(){},readImageFiles:async()=>[],cloud:()=>cloud});
 await wizard.submit({preventDefault(){},target:{id:'copy-source-form'}});assert.equal(first.copyFlow.jobId,'captured-copy');assert(saved.some(item=>item.id==='first'&&item.jobId==='captured-copy'));assert(!saved.some(item=>item.id==='other'));
 S.jobs=[];selected=first;first.copyFlow.phase='assets';first.copyFlow.confirmation={jobId:'captured-copy'};switchOnSave=true;await wizard.submit({preventDefault(){},target:{id:'copy-assets-form'}});assert.equal(designCalls,0);assert.equal(first.copyFlow.phase,'assets');assert(errors.some(text=>text.includes('项目已切换')));assert(!saved.some(item=>item.id==='other'));
});
