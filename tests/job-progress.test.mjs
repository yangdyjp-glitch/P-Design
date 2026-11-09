import assert from 'node:assert/strict';
import {test} from 'node:test';
import {jobProgress} from '../src/job-progress.js';
import {createCloud} from '../src/cloud.js';

const project={id:'own',name:'自己的项目',pages:[{id:'one',requirements:'第一页要求'},{id:'two',requirements:'第二页要求'},{id:'three'}]};
const job={id:'job',projectId:'own',scope:'page',pageIds:['two'],status:'running',kind:'revise'};
test('page progress identifies the actual target rather than the selected or first page',()=>{
 assert.equal(jobProgress(job,project).label,'第 2 张 · 调整版式');
 assert.equal(jobProgress(job,{...project,id:'another-project'}).scope,'单图');
 assert.equal(jobProgress({...job,pageIds:['missing']},project).scope,'单图');
 assert.equal(jobProgress({...job,scope:'project',pageIds:['one','two','three']},project).scope,'整套');
});
test('actual task states distinguish preparation, photo search, generation and correction',()=>{
 const state=(extra)=>jobProgress({...job,...extra},project);
 assert.equal(state({status:'queued'}).action,'等待开始');assert.equal(state({status:'queued',startingRequest:true}).action,'启动设计');assert.equal(state({status:'starting'}).action,'准备设计');
 assert.equal(state({searchingPhotos:true}).action,'搜索实景配图');assert.equal(state({status:'generating'}).action,'生成示意配图');assert.equal(state({result:{repairing:true}}).action,'自动修正版面');assert.equal(state({repairOf:'previous'}).action,'自动修正版面');
 assert.equal(state({submissionStage:'saving'}).action,'保存文案');assert.equal(state({submissionStage:'sending'}).action,'提交要求');
 for(const status of ['completed','failed','cancelled'])assert.equal(state({status}),null);
});
test('only actual browser check counts are displayed, including a repaginated result',()=>{
 const checking={...job,scope:'project',status:'completed',clientState:'checking',clientProgress:{current:2,total:6,pageId:'new-page'}};
 assert.equal(jobProgress(checking,project).label,'整套 · 检查 2/6 张');
 assert.equal(jobProgress({...checking,scope:'page',pageIds:['two'],clientProgress:{current:1,total:1}},project).label,'第 2 张 · 自动检查');
 for(const clientProgress of [null,{current:0,total:6},{current:7,total:6},{current:2,total:21},{current:'2',total:6}])assert.equal(jobProgress({...checking,clientProgress},project).action,'自动检查');
 assert.equal(jobProgress({...checking,clientState:'saving'},project).action,'保存画面');
 assert(!JSON.stringify(jobProgress({...job,scope:'project'},project)).includes('%'));
});
test('the button and live description track a task on a different page or project',()=>{
 const previous=globalThis.document,buttonLabel={textContent:''},description={textContent:''},badge={textContent:''},attributes={};
 const send={querySelector:()=>buttonLabel,setAttribute:(key,value)=>attributes[key]=value,removeAttribute:key=>delete attributes[key]};
 const controls=[send,{disabled:false}],nodes={'[data-action="ai-page"]':send,'#automatic-state':description,'[data-action="ai-tasks"] span':badge};
 globalThis.document={querySelector:selector=>nodes[selector]||null,querySelectorAll:()=>controls};
 const S={projects:[project],session:{capabilities:{ai:true}},jobs:[{...job,searchingPhotos:true}]};
 const cloud=createCloud({S,project:()=>project,current:()=>project.pages[0]});
 try{cloud.updateBadge();assert.equal(buttonLabel.textContent,'第 2 张 · 搜索实景配图');assert.match(description.textContent,/第 2 张/);assert.match(description.textContent,/完成后可发送本图要求/);assert.equal(send.disabled,true);assert.equal(attributes['aria-busy'],'true');
  const other={...project,id:'other',name:'另外的项目'};S.projects.push(other);S.jobs=[{...job,projectId:'other',status:'generating'}];cloud.updateBadge();assert.equal(buttonLabel.textContent,'其他项目 · 生成示意配图');assert.match(description.textContent,/另外的项目/);
  S.jobs=[];cloud.updateBadge();assert.equal(buttonLabel.textContent,'发送并修改本图');assert.equal(send.disabled,false);assert.equal(attributes['aria-busy'],'false');assert.equal(attributes.title,undefined);
 }finally{cloud.dispose();globalThis.document=previous;}
});
for(const failSaving of [false,true])test(failSaving?'a cloud save failure preserves the checked result and reports the unfinished saving step':'browser checks and saving appear before completion, and only the passed state is cached',async()=>{
 const previousDocument=globalThis.document,previousFetch=globalThis.fetch,previousParser=globalThis.DOMParser,observed=[],errors=[];
 // This unit fixture contains trusted static HTML. Native DOM parsing and real
 // frame rendering are exercised separately in browser QA.
 globalThis.DOMParser=class{parseFromString(html){return {body:{querySelectorAll:()=>[],innerHTML:html}};}};
 const label={set textContent(value){observed.push(value);}},send={querySelector:()=>label,setAttribute(){},removeAttribute(){}};
 globalThis.document={querySelector:selector=>selector==='[data-action="ai-page"]'?send:null,querySelectorAll:()=>[send]};
 const page=id=>({id,copy:[{id:'copy-'+id,text:'保持原文'}],originalCopy:[{id:'copy-'+id,text:'保持原文'}],html:'',css:'',settings:{},requirements:'保留原图'});
 const p={id:'own',cloudRevision:7,name:'项目',pages:[page('one'),page('two')],assets:[],history:[],redo:[]};
 const completed={...job,automatic:true,status:'completed',baseRevision:7,result:{pages:[{id:'two',html:'<section class="xhs-card"><p data-copy="copy-two">保持原文</p></section>',css:'.xhs-card {color: #123456;}',photoAssetId:null}],assets:[]}};
 const S={projects:[p],activeId:p.id,pageId:'two',busy:false};let cachedState,finish;
 const saved=new Promise(resolve=>finish=resolve);
 globalThis.fetch=async(url,options)=>{if(url==='/api/session')return Response.json({user:{id:'test'},accessMode:'visitor',capabilities:{ai:true}});if(url==='/api/jobs')return Response.json({jobs:[completed]});if(url==='/api/projects/own'&&options.method==='PUT'){assert(observed.some(text=>text==='第 2 张 · 保存画面'));return failSaving?Response.json({error:'测试保存中断'},{status:503}):Response.json({revision:8});}throw Error('Unexpected request '+url);};
 const cloud=createCloud({S,project:()=>p,current:()=>p.pages[1],toast(message){errors.push(message);},render(){},baseCSS:()=>'',persist:async()=>{cachedState=p._aiState.state;finish();},auditProposal:async(draft,ids,notify)=>{assert.deepEqual(ids,['two']);notify({current:1,total:1,pageId:'two'});assert.equal(observed.at(-1),'第 2 张 · 自动检查');return [{id:'two',issues:[]}];}});
 let timeout;
 try{await cloud.init();cloud.startPolling();await Promise.race([saved,new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('Automatic checking did not complete: '+errors.join('; '))),5000);timeout.unref();})]);await new Promise(resolve=>setTimeout(resolve,0));assert.equal(cachedState,failSaving?'failed':'passed');assert.equal(S.jobs[0].clientState,failSaving?'save-failed':'applied');assert.equal(p.cloudRevision,failSaving?7:8);assert.equal(observed.at(-1),'发送并修改本图');if(failSaving){assert.equal(p.aiCheck.status,'passed');assert.equal(p._cloudDirty,true);assert.match(p._aiState.message,/画面检查已通过.*云端保存暂未完成/);}}
 finally{clearTimeout(timeout);cloud.dispose();globalThis.document=previousDocument;globalThis.fetch=previousFetch;globalThis.DOMParser=previousParser;}
});
