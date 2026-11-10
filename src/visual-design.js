import {paginationIssue} from './pagination-policy.js';
import {specialistRoutingPolicy,validateSpecialistRouting} from './specialist-routing.js';

export const LEGACY_VISUAL_SKILLS=['xiaohongshu-design','victor-design','xhs-poster-composition','xhs-design-polish'];
export const TASTE_SKILL='taste-skill';
export const TASTE_REFERENCES=['references/xhs-static-adapter.md','references/layout-v4.md','references/system.md'];
export const VISUAL_SKILLS=[...LEGACY_VISUAL_SKILLS,TASTE_SKILL];
export const requiredVisualSkills=snapshot=>snapshot.visualDesignPolicy?.taste?.version===1?VISUAL_SKILLS:LEGACY_VISUAL_SKILLS;
export const VISUAL_CHECKS=['composition','hierarchy','typography','image_text','spacing','scope'];
export function visualDesignPolicy(kind,parent){
 if(parent)return parent.visualDesignPolicy||null;
 return ['design','revise','cover','polish','template'].includes(kind)?{version:1,requiredSkills:[...VISUAL_SKILLS],taste:{version:1,mode:'methods',references:[...TASTE_REFERENCES]},independentReview:true,specialistRouting:specialistRoutingPolicy()}:null;
}
const text=(value,max=2000)=>typeof value==='string'&&value.trim().length>0&&value.length<=max;
export function validateVisualPlan(value,snapshot){
 const fail=message=>{throw Error('构图计划未完成：'+message);};
 if(!value||value.version!==1||!Array.isArray(value.skills)||!Array.isArray(value.pages)||!value.pages.length||value.pages.length>20)fail('缺少完整的技能与逐页构图记录');
 const seenSkills=new Set(),loaded=new Set(snapshot.loadedSkills||[]);
 for(const skill of value.skills){
  if(!loaded.has(skill.id)||seenSkills.has(skill.id)||!/^[a-z0-9-]{1,80}$/.test(skill.id))fail('记录的视觉技能必须实际载入，且不能重复');seenSkills.add(skill.id);
  if(!Array.isArray(skill.sources)||!skill.sources.includes('/workspace/skills/'+skill.id+'/SKILL.md')||skill.sources.length>12||skill.sources.some(path=>!text(path,240)||!path.startsWith('/workspace/skills/'+skill.id+'/')||path.includes('..')||path.includes('\\')||!/\.(md|css|html|json)$/.test(path)))fail('技能来源应包含本次模块的实际 SKILL.md 和相关说明或模板文件');
 }
 const required=requiredVisualSkills(snapshot);if(required.some(id=>!seenSkills.has(id)))fail('本轮主流程、视觉设计、构图、精修及指定的 Taste 方法必须完整参与');
 if(snapshot.visualDesignPolicy?.taste?.version===1){const sources=value.skills.find(skill=>skill.id===TASTE_SKILL).sources;if(TASTE_REFERENCES.some(path=>!sources.includes('/workspace/skills/'+TASTE_SKILL+'/'+path)))fail('Taste 需要实际平面适配、布局及视觉系统的来源');}
 if(value.pages.some(page=>/^(?:cover|封面|开篇封面)(?:页|\s|$)/i.test(page.role||''))&&!seenSkills.has('xhs-cover-lab'))fail('封面页还需载入并记录封面实验室技能');
 const ids=new Set(),copyById=new Map(snapshot.pages.flatMap(page=>page.copy.map(copy=>[copy.id,copy]))),allCopy=snapshot.pages.flatMap(page=>page.copy.map(copy=>copy.id)),ownCopy=new Set(allCopy);
 for(const page of value.pages){
  if(!/^[a-zA-Z0-9_-]{1,100}$/.test(page.id||'')||ids.has(page.id))fail('页面编号无效或重复');ids.add(page.id);
  if(!Array.isArray(page.copyIds)||!page.copyIds.length||page.copyIds.some(id=>!ownCopy.has(id)))fail('文案范围不匹配');
  for(const field of ['role','firstFocus','layout','imageRole','rationale','sourceHandling'])if(!text(page[field]))fail('每页应说明阅读任务、主次、布局和图片角色');
  if(!Array.isArray(page.readingOrder)||!page.readingOrder.length||page.readingOrder.length>10||page.readingOrder.some(item=>!text(item,300)))fail('缺少可执行的阅读顺序');
  if(!Array.isArray(page.alternatives)||page.alternatives.length!==3||page.alternatives.some(item=>!text(item,1000))||new Set(page.alternatives).size!==3)fail('需比较三种适合本次内容与范围的构图方向');
  if(!Array.isArray(page.techniques)||page.techniques.length<3||page.techniques.length>12||page.techniques.some(item=>!seenSkills.has(item.skillId)||!text(item.action,1000)||!text(item.cause,1000))||['victor-design','xhs-poster-composition','xhs-design-polish'].some(id=>!page.techniques.some(item=>item.skillId===id)))fail('视觉、构图和中文精修都应落实到有原因的具体决策');
  if(snapshot.visualDesignPolicy?.taste?.version===1&&!page.techniques.some(item=>item.skillId===TASTE_SKILL&&item.action.trim().length>=8&&item.cause.trim().length>=8))fail('每页都需落实适合本次内容与调整范围的 Taste 手法');
 }
 const pages=value.pages.map(page=>({id:page.id,copy:page.copyIds.map(id=>copyById.get(id))})),issue=paginationIssue(snapshot.pages,pages,snapshot.scope==='page'||snapshot.paginationMode==='fixed'?'fixed':'auto');if(issue)fail(issue);
 const returned=value.pages.flatMap(page=>page.copyIds);if(returned.length!==allCopy.length||returned.some((id,index)=>id!==allCopy[index]))fail('不能借构图改变原文、顺序或页界');
 validateSpecialistRouting(value,snapshot);
 return structuredClone(value);
}
export function tasteResultIssue(design,usedSkills,pages){
 if(!design?.skills?.some(skill=>skill.id===TASTE_SKILL&&skill.loaded)||!usedSkills?.includes(TASTE_SKILL))return 'Taste 审美方法未实际载入并列入使用记录';
 const source=design.plan?.skills?.find(skill=>skill.id===TASTE_SKILL)?.sources||[];if(!source.includes('/workspace/skills/'+TASTE_SKILL+'/SKILL.md')||TASTE_REFERENCES.some(path=>!source.includes('/workspace/skills/'+TASTE_SKILL+'/'+path)))return 'Taste 缺少本次实际方法来源';
 if(pages.some(page=>!design.plan?.pages?.find(item=>item.id===page.id)?.techniques?.some(item=>item.skillId===TASTE_SKILL&&text(item.action,1000)&&item.action.trim().length>=8&&text(item.cause,1000)&&item.cause.trim().length>=8)))return 'Taste 未落实到每页实际的构图或局部审美处理';
 return null;
}
export function validateVisualReview(value,pageIds){
 if(!value||!text(value.summary,3000)||!Array.isArray(value.pages)||value.pages.length!==pageIds.length)throw Error('独立视觉复核缺少完整的逐页结果');
 const seen=new Set();for(const page of value.pages){
  if(!pageIds.includes(page.pageId)||seen.has(page.pageId)||!Array.isArray(page.checks)||page.checks.length!==VISUAL_CHECKS.length)throw Error('独立视觉复核的页面或检查项不匹配');seen.add(page.pageId);
  const topics=new Set();for(const check of page.checks){if(!VISUAL_CHECKS.includes(check.topic)||topics.has(check.topic)||!['pass','revise','advisory'].includes(check.judgment)||!text(check.observation,2000)||!text(check.fix,2000))throw Error('独立视觉复核缺少可核对的观察和处理意见');topics.add(check.topic);}
 }
 if(!value.series||!['pass','revise','advisory'].includes(value.series.judgment)||!text(value.series.observation,2000)||!text(value.series.fix,2000)||pageIds.length===1&&value.series.judgment==='revise')throw Error('独立视觉复核不能臆测未看到的其他页面');
 const status=value.series.judgment==='revise'||value.pages.some(page=>page.checks.some(check=>check.judgment==='revise'))?'revise':'passed';
 return {...structuredClone(value),status};
}
