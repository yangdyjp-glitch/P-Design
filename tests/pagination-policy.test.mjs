import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';
import {parseManuscript} from '../src/engine.js';
import {designProposal} from '../src/ai-workflow.js';
import {manuscriptParts,manuscriptPaginationMode,validatePaginationMode,projectPaginationMode,jobPaginationMode} from '../src/pagination-policy.js';

const {outputFiles}=await build({entryPoints:['server/design-result.ts'],bundle:true,write:false,platform:'node',format:'esm'});
const {validateDesignResult}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const blocks=[{id:'title',text:'周末阅读'},{id:'body',text:'带一本书，给自己 10 分钟。'},{id:'next',text:'线上或线下交流'},{id:'detail',text:'根据时间选择适合自己的方式。'}];
const pages=[{id:'first',copy:blocks.slice(0,2)},{id:'second',copy:blocks.slice(2)}];
const markup=copy=>'<section class="xhs-card">'+copy.map(c=>'<p data-copy="'+c.id+'">'+c.text+'</p>').join('')+'</section>';
const result={summary:'已设计',report:'实际检查',pages:pages.map(page=>({id:page.id,html:markup(page.copy),css:''}))};
const job={kind:'design',skill_ids:'[]',snapshot:JSON.stringify({workflow:'automatic',scope:'project',paginationMode:'fixed',pages,assets:[]})};

test('explicit numbered page markers and separators preserve their exact page groups',()=>{
 for(const text of ['（1P）周末阅读\n带一本书\n（2P）交流方式\n- 线上或线下','(1P)\n周末阅读\n带一本书\n(2P)\n交流方式\n- 线上或线下','P1：周末阅读\n带一本书\nP2：交流方式\n- 线上或线下','第1页\n周末阅读\n带一本书\n第2页\n交流方式\n- 线上或线下','周末阅读\r\n带一本书\r\n---\r\n交流方式\r\n- 线上或线下']){
  assert.equal(manuscriptPaginationMode(text),'fixed');
  assert.deepEqual(parseManuscript(text,{preserveText:true}).map(page=>page.copy.map(copy=>copy.text)),[['周末阅读','带一本书'],['交流方式','- 线上或线下']]);
 }
});
test('a single explicit page stays fixed while unpaginated paragraphs remain AI-paginated',()=>{
 assert.equal(manuscriptPaginationMode('（1P）\n阅读清单\n- 带一本书'),'fixed');
 const plain='阅读清单\n\n- 带一本书\n#周末阅读';assert.equal(manuscriptPaginationMode(plain),'auto');
 assert.equal(manuscriptParts(plain).chunks.length,1);assert.deepEqual(parseManuscript(plain,{preserveText:true})[0].copy.map(c=>c.text),['阅读清单','- 带一本书','#周末阅读']);
 assert.throws(()=>parseManuscript('（1P）'),/填写本页文案/);
});
test('existing projects are conservative and correction jobs retain the frozen pagination contract',()=>{
 assert.equal(projectPaginationMode({pages}),'fixed');assert.equal(validatePaginationMode(null),'fixed');
 for(const bad of ['other',{},false])assert.throws(()=>validatePaginationMode(bad));
 assert.equal(jobPaginationMode({paginationMode:'auto'}),'auto');
 assert.equal(jobPaginationMode({paginationMode:'auto'},{paginationMode:'fixed'}),'fixed');
 assert.equal(jobPaginationMode({paginationMode:'fixed'},{paginationMode:'auto'}),'auto');
 assert.equal(jobPaginationMode({paginationMode:'fixed'},{}),'auto');
});
test('fixed pagination rejects splitting, merging, replacement IDs and cross-page moves even at the same count',()=>{
 assert.deepEqual(validateDesignResult(result,job).pages.map(p=>p.copy),pages.map(p=>p.copy));
 const page=(id,copy)=>({id,html:markup(copy),css:''});
 const rejected=[
  [result.pages[0],page('second',blocks.slice(2,3)),page('extra-photo-page',blocks.slice(3))],
  [page('first',blocks)],
  [page('new-first',blocks.slice(0,2)),result.pages[1]],
  [page('first',blocks.slice(0,3)),page('second',blocks.slice(3))],
  [result.pages[1],result.pages[0]],
 ];
 for(const bad of rejected)assert.throws(()=>validateDesignResult({...result,pages:bad},job),error=>error.code==='PAGE_BOUNDARY');
});
test('all three source modes obey the same fixed page groups without weakening image rules',()=>{
 for(const imageMode of ['upload','web','none']){
  const assets=imageMode==='none'?[]:[{id:'photo',source:imageMode}],snapshot={workflow:'automatic',scope:'project',paginationMode:'fixed',pages,assets,imageMode,imagePolicy:{requiredUploadIds:imageMode==='upload'?['photo']:[]}};
  const current={...job,snapshot:JSON.stringify(snapshot)},raw=structuredClone(result);
  if(assets.length)raw.pages[1].html=raw.pages[1].html.replace('</section>','<img data-asset-id="photo" src="/api/files/photo"></section>');
  assert.equal(validateDesignResult(raw,current).pages.length,2);
  assert.throws(()=>validateDesignResult({...raw,pages:[...raw.pages,{id:'photo-only-page',html:'<section class="xhs-card"></section>',css:''}]},current),error=>error.code==='PAGE_BOUNDARY');
 }
});
test('only unpaginated or legacy whole-set jobs can freely choose new page boundaries',()=>{
 const raw={...result,pages:[{id:'combined',html:markup(blocks),css:''}]};
 for(const paginationMode of ['auto',undefined])assert.equal(validateDesignResult(raw,{...job,snapshot:JSON.stringify({workflow:'automatic',scope:'project',paginationMode,pages,assets:[]})}).pages.length,1);
 assert.throws(()=>validateDesignResult(raw,{...job,snapshot:JSON.stringify({workflow:'automatic',scope:'page',paginationMode:'auto',pages:[{id:'first',copy:blocks}],assets:[]})}),error=>error.code==='PAGE_SCOPE');
});
test('browser automatic application refuses changed page groups and preserves the original project',()=>{
 const project={id:'own-project',paginationMode:'fixed',pages:structuredClone(pages),assets:[]},original=structuredClone(project);
 const accepted=validateDesignResult(result,job),task={id:'job',automatic:true,scope:'project',projectId:project.id,paginationMode:'fixed',result:accepted};
 assert.deepEqual(designProposal(task,project).pages.map(p=>p.copy),pages.map(p=>p.copy));
 const changed=structuredClone(task);changed.result.pages[0].copy.push(changed.result.pages[1].copy.shift());
 assert.throws(()=>designProposal(changed,project),/文案被移至其他页/);
 assert.throws(()=>designProposal({...task,paginationMode:'auto',result:{...accepted,pages:[{...accepted.pages[0],copy:blocks}]}},project),/原页数/);
 assert.deepEqual(project,original);
 const autoProject={...project,paginationMode:'auto'},autoTask={...task,paginationMode:'auto',result:{...accepted,pages:[{...accepted.pages[0],id:'new',copy:blocks}]}};
 assert.equal(designProposal(autoTask,autoProject).pages.length,1);
 const legacyProject={...project};delete legacyProject.paginationMode;
 assert.equal(designProposal(autoTask,legacyProject).pages.length,1);
 assert.throws(()=>designProposal({...autoTask,paginationMode:'fixed'},legacyProject),/原页数/);
});
