import assert from 'node:assert/strict';
import {test} from 'node:test';
import {removeLocalProject,reconcileProjects} from '../src/project-management.js';
import {createCloud} from '../src/cloud.js';

const project=id=>({id,name:id,pages:[{id:id+'-page',copy:[{id:id+'-copy',text:'保留当前编辑的文案'}]}],assets:[],cloudRevision:1});
test('deleting another project preserves the active page and its unsaved edits',()=>{
 const current={...project('a'),_cloudDirty:true},state={projects:[current,project('b')],activeId:'a',pageId:'a-page',selectedCopy:'a-copy',zoom:1.5};
 removeLocalProject(state,'b');assert.deepEqual(state.projects,[current]);assert.equal(state.activeId,'a');assert.equal(state.pageId,'a-page');assert.equal(state.selectedCopy,'a-copy');assert.equal(state.zoom,1.5);
});
test('deleting the active project selects a neighbor and the last deletion leaves an empty workspace',()=>{
 const state={projects:[project('a'),project('b'),project('c')],activeId:'b',pageId:'b-page',selectedCopy:'b-copy',audit:[],zoom:1.5};
 removeLocalProject(state,'b');assert.equal(state.activeId,'c');assert.equal(state.pageId,'c-page');assert.equal(state.audit,null);
 removeLocalProject(state,'c');assert.equal(state.activeId,'a');removeLocalProject(state,'a');
 assert.deepEqual(state.projects,[]);assert.equal(state.activeId,null);assert.equal(state.pageId,null);removeLocalProject(state,'missing');assert.deepEqual(state.projects,[]);
});
test('successful cloud reconciliation removes deleted cache entries while preserving unsynced work for backup',()=>{
 const a=project('a'),deleted=project('deleted'),dirty={...project('dirty'),_cloudDirty:true},localOnly={...project('local'),cloudRevision:undefined},newer={...a,cloudRevision:2};
 const result=reconcileProjects([a,deleted,dirty,localOnly],[newer,project('new')]);
 assert.deepEqual(result.map(p=>p.id),['a','dirty','local','new']);assert.equal(result[0],newer);assert.equal(result[1]._syncConflict,true);assert.deepEqual(result[1].pages,dirty.pages);assert.equal(result[2],localOnly);
 assert.deepEqual(reconcileProjects([deleted],[]),[]);assert.deepEqual(reconcileProjects([],[]),[]);
});

async function fixture(handler){
 const originalFetch=globalThis.fetch,originalDocument=globalThis.document,events=[],p={...project('own'),cloudRevision:undefined,_cloudDirty:true},S={projects:[p],jobs:[]};
 globalThis.document={querySelector:()=>null,querySelectorAll:()=>[]};
 globalThis.fetch=async(url,options={})=>{
  if(url==='/api/session')return Response.json({user:{id:'account'},accessMode:'accounts',capabilities:{ai:true}});
  if(url==='/api/jobs')return Response.json({jobs:[]});
  events.push(options.method);return handler(url,options,events);
 };
 const cloud=createCloud({S,project:()=>p,current:()=>p.pages[0]});await cloud.init();
 return {p,S,events,cloud,close(){cloud.dispose();globalThis.fetch=originalFetch;globalThis.document=originalDocument;}};
}
test('deletion follows an in-flight save and stale autosaves cannot recreate the deleted project',async()=>{
 let began,release;const started=new Promise(resolve=>began=resolve),held=new Promise(resolve=>release=resolve);
 const f=await fixture(async(url,options)=>{if(options.method==='PUT'){began();await held;return Response.json({revision:1});}assert.equal(options.method,'DELETE');return Response.json({deleted:true});});
 try{
  f.S.jobs=[{id:'own-job',projectId:'own',status:'queued'},{id:'other-job',projectId:'other',status:'running'}];
  const saving=f.cloud.save(f.p);await started;const deleting=f.cloud.remove(f.p),stale=f.cloud.save(f.p);assert.deepEqual(f.events,['PUT']);
  release();await Promise.all([saving,deleting,stale]);assert.deepEqual(f.events,['PUT','DELETE']);
  await f.cloud.save({...f.p,_cloudDirty:true});assert.deepEqual(f.events,['PUT','DELETE']);assert.equal(f.S.jobs[0].status,'cancelled');assert.equal(f.S.jobs[1].status,'running');
 }finally{f.close();}
});
test('a failed deletion retains the project and permits a later save and delete retry',async()=>{
 let attempts=0;const f=await fixture(async(url,options)=>options.method==='DELETE'?++attempts===1?Response.json({error:'临时连接失败'},{status:503}):Response.json({deleted:true}):Response.json({revision:2}));
 try{const original=structuredClone(f.p);await assert.rejects(f.cloud.remove(f.p),/临时连接失败/);assert.deepEqual(f.p,original);assert.equal(f.S.projects[0],f.p);await f.cloud.save(f.p);assert.equal(f.p.cloudRevision,2);await f.cloud.remove(f.p);assert.deepEqual(f.events,['DELETE','PUT','DELETE']);}finally{f.close();}
});
test('duplicate deletion requests are coalesced and an already deleted cloud project is cleared locally',async()=>{
 let release;const held=new Promise(resolve=>release=resolve),f=await fixture(async()=>{await held;return Response.json({error:'找不到这个项目。'},{status:404});});
 try{const first=f.cloud.remove(f.p),second=f.cloud.remove(f.p);await new Promise(resolve=>setTimeout(resolve,0));assert.deepEqual(f.events,['DELETE']);release();await Promise.all([first,second]);await f.cloud.save(f.p);assert.deepEqual(f.events,['DELETE']);}finally{f.close();}
});
