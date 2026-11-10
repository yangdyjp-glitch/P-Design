import {paginationIssue} from './pagination-policy.js';
import {specialistRoutingPolicy,validateSpecialistRouting} from './specialist-routing.js';

export const VISUAL_SKILLS=['xiaohongshu-design','victor-design','xhs-poster-composition','xhs-design-polish'];
export const VISUAL_CHECKS=['composition','hierarchy','typography','image_text','spacing','scope'];
export function visualDesignPolicy(kind,parent){
 if(parent)return parent.visualDesignPolicy||null;
 return ['design','revise','cover','polish','template'].includes(kind)?{version:1,requiredSkills:[...VISUAL_SKILLS],independentReview:true,specialistRouting:specialistRoutingPolicy()}:null;
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
 if(VISUAL_SKILLS.some(id=>!seenSkills.has(id)))fail('主流程、Victor、海报构图和中文精修缺一不可');
 if(value.pages.some(page=>/^(?:cover|封面|开篇封面)(?:页|\s|$)/i.test(page.role||''))&&!seenSkills.has('xhs-cover-lab'))fail('封面页还需载入并记录封面实验室技能');
 const ids=new Set(),copyById=new Map(snapshot.pages.flatMap(page=>page.copy.map(copy=>[copy.id,copy]))),allCopy=snapshot.pages.flatMap(page=>page.copy.map(copy=>copy.id)),ownCopy=new Set(allCopy);
 for(const page of value.pages){
  if(!/^[a-zA-Z0-9_-]{1,100}$/.test(page.id||'')||ids.has(page.id))fail('页面编号无效或重复');ids.add(page.id);
  if(!Array.isArray(page.copyIds)||!page.copyIds.length||page.copyIds.some(id=>!ownCopy.has(id)))fail('文案范围不匹配');
  for(const field of ['role','firstFocus','layout','imageRole','rationale','sourceHandling'])if(!text(page[field]))fail('每页应说明阅读任务、主次、布局和图片角色');
  if(!Array.isArray(page.readingOrder)||!page.readingOrder.length||page.readingOrder.length>10||page.readingOrder.some(item=>!text(item,300)))fail('缺少可执行的阅读顺序');
  if(!Array.isArray(page.alternatives)||page.alternatives.length!==3||page.alternatives.some(item=>!text(item,1000))||new Set(page.alternatives).size!==3)fail('需比较三种适合本次内容与范围的构图方向');
  if(!Array.isArray(page.techniques)||page.techniques.length<3||page.techniques.length>12||page.techniques.some(item=>!seenSkills.has(item.skillId)||!text(item.action,1000)||!text(item.cause,1000))||['victor-design','xhs-poster-composition','xhs-design-polish'].some(id=>!page.techniques.some(item=>item.skillId===id)))fail('视觉、构图和中文精修都应落实到有原因的具体决策');
 }
 const pages=value.pages.map(page=>({id:page.id,copy:page.copyIds.map(id=>copyById.get(id))})),issue=paginationIssue(snapshot.pages,pages,snapshot.scope==='page'||snapshot.paginationMode==='fixed'?'fixed':'auto');if(issue)fail(issue);
 const returned=value.pages.flatMap(page=>page.copyIds);if(returned.length!==allCopy.length||returned.some((id,index)=>id!==allCopy[index]))fail('不能借构图改变原文、顺序或页界');
 validateSpecialistRouting(value,snapshot);
 return structuredClone(value);
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
