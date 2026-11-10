import {test} from 'node:test';
import assert from 'node:assert/strict';
import {VISUAL_SKILLS,LEGACY_VISUAL_SKILLS,TASTE_REFERENCES,requiredVisualSkills,tasteResultIssue,visualDesignPolicy,validateVisualPlan,validateVisualReview} from '../src/visual-design.js';
import fs from 'node:fs/promises';
import {designProposal} from '../src/ai-workflow.js';
import {planFor,reviewFor} from './fixtures/visual-design.mjs';

test('all layout jobs require the same core visual skills and independent review; old correction contracts remain frozen',()=>{
 for(const kind of ['design','revise','cover','polish','template'])assert.deepEqual(visualDesignPolicy(kind).requiredSkills,VISUAL_SKILLS);
 for(const kind of ['write','image','reference'])assert.equal(visualDesignPolicy(kind),null);
 assert.equal(visualDesignPolicy('revise',{}),null);const policy=visualDesignPolicy('design');assert.deepEqual(visualDesignPolicy('revise',{visualDesignPolicy:policy}),policy);
});
test('composition plans require five loaded modules, valid scoped sources and exact fixed copy groups',()=>{
 const policy=visualDesignPolicy('revise');delete policy.specialistRouting;const snapshot={visualDesignPolicy:policy,loadedSkills:VISUAL_SKILLS,paginationMode:'fixed',scope:'page',pages:[{id:'one',copy:[{id:'a',text:'原始标题'},{id:'b',text:'保留标点与全文。'}]}]},valid=planFor('one',['a','b']);assert.deepEqual(validateVisualPlan(valid,snapshot),valid);
 for(const change of [plan=>plan.skills.pop(),plan=>plan.skills[0].sources=['/workspace/skills/xiaohongshu-design/../secret.md'],plan=>plan.pages[0].id='other',plan=>plan.pages[0].copyIds.reverse(),plan=>plan.pages[0].alternatives=['same','same','same'],plan=>plan.pages[0].techniques.pop()]){const invalid=structuredClone(valid);change(invalid);assert.throws(()=>validateVisualPlan(invalid,snapshot));}
 assert.throws(()=>validateVisualPlan(valid,{...snapshot,loadedSkills:['xiaohongshu-design','xhs-design-polish']}));
});
test('independent reviews cover actual pages and all visual topics; missing or unrelated page observations cannot pass',()=>{
 const valid=reviewFor(['one']);assert.equal(validateVisualReview(valid,['one']).status,'passed');assert.equal(validateVisualReview(reviewFor(['one'],true),['one']).status,'revise');
 for(const change of [review=>review.pages[0].checks.pop(),review=>review.pages[0].pageId='other',review=>review.pages[0].checks[1].topic='composition',review=>review.pages[0].checks[0].observation='',review=>review.series.judgment='revise']){const invalid=structuredClone(valid);change(invalid);assert.throws(()=>validateVisualReview(invalid,['one']));}
});
test('cover pages add the cover specialist and optional methods are recorded without dropping core skills or Taste',()=>{
 const snapshot={loadedSkills:[...VISUAL_SKILLS,'xhs-cover-lab'],scope:'page',pages:[{id:'one',copy:[{id:'a',text:'封面原文'}]}]},plan=planFor('one',['a']);plan.pages[0].role='封面页';assert.throws(()=>validateVisualPlan(plan,snapshot),/封面/);plan.skills.push({id:'xhs-cover-lab',sources:['/workspace/skills/xhs-cover-lab/SKILL.md']});plan.pages[0].techniques.push({skillId:'xhs-cover-lab',action:'明确缩略图中的停留重点',cause:'读者先看到这个页面的核心主题'});assert.equal(validateVisualPlan(plan,snapshot).skills.length,6);assert.throws(()=>validateVisualPlan(plan,{...snapshot,loadedSkills:VISUAL_SKILLS}));
});
test('Taste is a default method for every visual job and its registered references are real files',async()=>{
 for(const kind of ['design','revise','cover','polish','template']){const policy=visualDesignPolicy(kind);assert.equal(policy.taste.mode,'methods');assert.equal(policy.specialistRouting.maxLoaded,9);assert(policy.requiredSkills.includes('taste-skill'));}
 for(const reference of ['SKILL.md',...TASTE_REFERENCES])await fs.access('design-skills/taste-skill/'+reference);
 const legacy={version:1,requiredSkills:LEGACY_VISUAL_SKILLS,independentReview:true};assert.deepEqual(requiredVisualSkills({visualDesignPolicy:legacy}),LEGACY_VISUAL_SKILLS);assert.deepEqual(visualDesignPolicy('revise',{visualDesignPolicy:legacy}),legacy);
 const plan=planFor('one',['a']);plan.skills=plan.skills.filter(skill=>skill.id!=='taste-skill');plan.pages[0].techniques=plan.pages[0].techniques.filter(item=>item.skillId!=='taste-skill');assert(validateVisualPlan(plan,{visualDesignPolicy:legacy,loadedSkills:LEGACY_VISUAL_SKILLS,scope:'page',pages:[{id:'one',copy:[{id:'a',text:'原文'}]}]}));
});
test('Taste omissions, missing reference evidence and name-only per-page usage cannot be applied',()=>{
 const plan=planFor('one',['a']),design={skills:plan.skills.map(skill=>({...skill,loaded:true})),plan},used=plan.skills.map(skill=>skill.id),pages=[{id:'one',html:'<section></section>',css:''}];assert.equal(tasteResultIssue(design,used,pages),null);
 for(const mutate of [d=>d.skills.find(s=>s.id==='taste-skill').loaded=false,d=>d.plan.skills.find(s=>s.id==='taste-skill').sources.pop(),d=>d.plan.pages[0].techniques=d.plan.pages[0].techniques.filter(t=>t.skillId!=='taste-skill'),d=>d.plan.pages[0].techniques.find(t=>t.skillId==='taste-skill').action='好看']){const invalid=structuredClone(design);mutate(invalid);assert(tasteResultIssue(invalid,used,pages));}
 assert(tasteResultIssue(design,LEGACY_VISUAL_SKILLS,pages));assert(tasteResultIssue(design,used,[...pages,{id:'unplanned'}]));
 const project={id:'own',pages:[{id:'one',copy:[],settings:{}}],assets:[]},job={id:'job',projectId:'own',scope:'page',pageIds:['one'],tasteRequired:true,result:{pages,visualDesign:design,usedSkills:used}};assert.throws(()=>designProposal(job,project),/Taste/);assert.equal(designProposal({...job,result:{...job.result,visualReview:{taste:{version:1,mode:'methods'}}}},project).pages.length,1);
});
test('the browser refuses a new visual result without its independent review while preserving legacy compatibility',()=>{
 const project={id:'own',pages:[{id:'one',copy:[],settings:{}}],assets:[]},job={id:'job',projectId:'own',scope:'page',pageIds:['one'],result:{replacePages:false,pages:[{id:'one',html:'<section></section>',css:''}]}};
 assert.equal(designProposal(job,project).pages.length,1);assert.throws(()=>designProposal({...job,visualDesignRequired:true},project),/独立视觉/);
 const review={...reviewFor(['one']),status:'passed',independent:true,jobId:'job'};assert.equal(designProposal({...job,visualDesignRequired:true,result:{...job.result,visualReview:review}},project).pages.length,1);
 for(const invalid of [{...review,jobId:'other'},{...review,independent:false},{...review,status:'revise'},{...review,pages:[]}])assert.throws(()=>designProposal({...job,visualDesignRequired:true,result:{...job.result,visualReview:invalid}},project));
});
