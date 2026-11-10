import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {SPECIALISTS,specialistResultIssue} from '../src/specialist-routing.js';
import {VISUAL_SKILLS,visualDesignPolicy,validateVisualPlan} from '../src/visual-design.js';
import {planFor,specialistPlanFor} from './fixtures/visual-design.mjs';
import {designProposal} from '../src/ai-workflow.js';
const snapshot=(extra={})=>({kind:'design',workflow:'automatic',scope:'project',paginationMode:'fixed',imageMode:'none',loadedSkills:[...VISUAL_SKILLS,'xhs-note-creator'],visualDesignPolicy:visualDesignPolicy('design'),pages:[{id:'one',copy:[{id:'a',text:'保留原始内容'}]}],...extra});
const plan=options=>specialistPlanFor('one',['a'],options);

test('all ten specialist capability cards reference real installed source files and new jobs freeze the routing contract',async()=>{
 assert.equal(SPECIALISTS.length,10);assert.equal(new Set(SPECIALISTS.map(spec=>spec.id)).size,10);for(const spec of SPECIALISTS)for(const reference of spec.references)await fs.access('design-skills/'+spec.id+'/'+reference);
 const policy=visualDesignPolicy('design');assert.equal(policy.specialistRouting.version,1);policy.specialistRouting.catalog[0].use='saved description';assert.equal(visualDesignPolicy('revise',{visualDesignPolicy:policy}).specialistRouting.catalog[0].use,'saved description');assert.notEqual(visualDesignPolicy('design').specialistRouting.catalog[0].use,'saved description');
 const legacy={version:1,requiredSkills:VISUAL_SKILLS,independentReview:true};assert.equal(visualDesignPolicy('revise',{visualDesignPolicy:legacy}).specialistRouting,undefined);
});
test('broad visual work must consider every optional specialist and apply a genuinely loaded method to its page',()=>{
 const valid=plan();assert.equal(validateVisualPlan(valid,snapshot()).skills.length,5);
 for(const change of [p=>delete p.specialists,p=>p.specialists.pop(),p=>p.specialists[0]=p.specialists[1],p=>p.specialists.find(item=>item.status==='use').pageIds=['other'],p=>p.skills.at(-1).sources.pop(),p=>p.pages[0].techniques.pop(),p=>p.specialists.find(item=>item.status==='use').reason='不用',p=>p.pages[0].specialistNeeds=[]]){const invalid=structuredClone(valid);change(invalid);assert.throws(()=>validateVisualPlan(invalid,snapshot()),/专长|构图/);}
 assert.throws(()=>validateVisualPlan(valid,snapshot({loadedSkills:VISUAL_SKILLS})),/载入/);
 const skipped=plan({selected:[]});assert.throws(()=>validateVisualPlan(skipped,snapshot()),/主动采用/);
});
test('cover, genuine references, process and comparison require their matching optional skills',()=>{
 for(const [need,id]of [['cover','xhs-cover-lab'],['reference','xhs-reference-contract'],['process','baoyu-infographic'],['comparison','baoyu-infographic'],['hierarchy','baoyu-infographic']]){
  const valid=plan({needs:[need],selected:[id]}),current=snapshot({loadedSkills:[...VISUAL_SKILLS,id]});assert.equal(validateVisualPlan(valid,current).skills.length,5);const invalid=plan({needs:[need],selected:[]});assert.throws(()=>validateVisualPlan(invalid,current));
 }
 const invalid=plan({needs:['comparison']});assert.throws(()=>validateVisualPlan(invalid,snapshot()),/内容任务|对应专长/);
});
test('all three presets allow layout-method references but cannot enable generation or locked-copy rewriting',()=>{
 for(const imageMode of ['upload','web','none']){
  const valid=plan({needs:['process'],selected:['baoyu-infographic']}),current=snapshot({imageMode,loadedSkills:[...VISUAL_SKILLS,'baoyu-infographic']});assert.equal(validateVisualPlan(valid,current).skills.length,5);valid.specialists.find(item=>item.status==='use').mode='execute';assert.throws(()=>validateVisualPlan(valid,current),/生成图片/);
 }
 const writing=plan({needs:['knowledge'],selected:['xhs-note-creator','xhs-writer']});writing.specialists.find(item=>item.skillId==='xhs-writer').mode='execute';assert.throws(()=>validateVisualPlan(writing,snapshot({loadedSkills:[...VISUAL_SKILLS,'xhs-note-creator','xhs-writer']})),/文案创作/);
});
test('only a bounded single-page micro-adjustment may reuse existing composition without an extra module',()=>{
 const local=plan({needs:['local_adjustment'],selected:[]});local.pages[0].localAdjustmentReason='本次只要求标题保持一行，保留其余现有构图';const current=snapshot({scope:'page',kind:'revise',pageRevision:{version:1,request:'标题放在一行'},pages:[{id:'one',html:'<section>保留原始内容</section>',copy:[{id:'a',text:'保留原始内容'}]}],loadedSkills:VISUAL_SKILLS});assert.equal(validateVisualPlan(local,current).skills.length,4);
 for(const extra of [{scope:'project'},{pageRevision:null}])assert.throws(()=>validateVisualPlan(local,{...current,...extra}),/单页微调/);
 delete local.pages[0].localAdjustmentReason;assert.throws(()=>validateVisualPlan(local,current),/说明/);
});
test('a broad readability request cannot masquerade as a micro-adjustment to bypass specialist matching',()=>{
 const local=plan({needs:['local_adjustment'],selected:[]});local.pages[0].localAdjustmentReason='只调整当前页面的字号，其余结构完全保持不变';const current=snapshot({scope:'page',kind:'revise',pageRevision:{version:1,request:'让排版更加易读一些，调整字号和分组'},pages:[{id:'one',html:'<section>保留原始内容</section>',copy:[{id:'a',text:'保留原始内容'}]}],loadedSkills:VISUAL_SKILLS});assert.throws(()=>validateVisualPlan(local,current),/广泛|单页微调/);
});
test('specialist choices respect the eight-module budget and preserve exact copy and fixed page boundaries',()=>{
 assert.throws(()=>validateVisualPlan(plan(),snapshot({loadedSkills:[...VISUAL_SKILLS,...SPECIALISTS.slice(0,5).map(spec=>spec.id)]})),/八个/);
 const invalid=plan();invalid.pages[0].copyIds.push('invented');assert.throws(()=>validateVisualPlan(invalid,snapshot()),/文案/);
});
test('only a complete selected-method record can be applied; missing or invented actual usage is rejected',()=>{
 const choices=plan(),design={plan:choices,skills:choices.skills.map(skill=>({...skill,loaded:true}))},used=choices.skills.map(skill=>skill.id),pages=[{id:'one',html:'<section></section>',css:''}];assert.equal(specialistResultIssue(design,used,pages),null);assert(specialistResultIssue(design,VISUAL_SKILLS,pages));assert(specialistResultIssue(design,[...used,'auto-redbook'],pages));
 const project={id:'project',pages:[{id:'one',copy:[],settings:{}}],assets:[]},job={projectId:'project',scope:'page',pageIds:['one'],specialistRoutingRequired:true,result:{pages,visualDesign:design,usedSkills:used}};assert.equal(designProposal(job,project).pages.length,1);assert.throws(()=>designProposal({...job,result:{...job.result,visualDesign:undefined}},project),/专长/);
 assert.equal(designProposal({...job,specialistRoutingRequired:false,result:{pages}},project).pages.length,1);
});
test('a generative specialist execution claim requires a real generated asset used on its assigned page',()=>{
 const choices=plan({needs:['illustration'],selected:['baoyu-xhs-images']});choices.specialists.find(item=>item.status==='use').mode='execute';const design={plan:choices,skills:choices.skills.map(skill=>({...skill,loaded:true}))},used=choices.skills.map(skill=>skill.id),pages=[{id:'one',html:'<section></section>'}];assert.match(specialistResultIssue(design,used,pages),/实际生成/);pages[0].html='<section><img data-asset-id="generated-one"></section>';assert.equal(specialistResultIssue(design,used,pages,[{id:'generated-one',source:'generated'}]),null);
});
