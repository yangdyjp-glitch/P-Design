import {manuscriptParts,manuscriptPaginationMode} from './pagination-policy.js';

export const COPY_CORE=['xhs-writer','copywriting','copy-editing'];
export const COPY_CANDIDATES=[
 {id:'copywriting',reference:'references/copy-frameworks.md',use:'标题、重点、读者价值与行动引导；只依据本次事实'},
 {id:'copy-editing',reference:'references/checklist.md',use:'核对逻辑、信息、语气和冗余，明确局部编辑范围'},
 {id:'humanizer-zh',reference:'SKILL.md',use:'中文空话、翻译腔、重复与模板节奏的自然表达'},
 {id:'content-research-writer',reference:'SKILL.md',use:'确有资料需求时检索和引用；已有完整材料时不强行扩写'},
 {id:'content-strategy',reference:'references/content-distribution.md',use:'确有系列或多主题时组织主线与阅读任务，不新增运营负担'},
 {id:'social',reference:'references/carousel-frameworks.md',use:'组图叙述与开头表达，只借鉴适合中文小红书的方法，不套用海外平台指标'}
];
export const COPY_SKILLS=['xhs-writer',...COPY_CANDIDATES.map(item=>item.id)];
export const COPY_CHECKS=['facts','coverage','pagination','language','scope'];
const text=(value,max=2000)=>typeof value==='string'&&!!value.trim()&&value.length<=max;
export const sourceText=value=>String(value||'').replace(/\r\n?/g,'\n').trim();
export async function copyHash(value){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(sourceText(value)));return [...new Uint8Array(bytes)].map(n=>n.toString(16).padStart(2,'0')).join('');}
export function copyPolicy(source){const original=sourceText(source);return {version:1,requiredSkills:[...COPY_CORE],catalog:structuredClone(COPY_CANDIDATES),paginationMode:manuscriptPaginationMode(original),sourcePages:manuscriptParts(original).chunks.length,maxLoaded:7};}
export function normalizeCopyFlow(incoming,previous){
 if(!incoming&&!previous)return undefined;
 if(!incoming||incoming.version!==1||!['copy','assets','design'].includes(incoming.phase)||typeof incoming.sourceText!=='string'||incoming.sourceText.length>60000||typeof incoming.draftText!=='string'||incoming.draftText.length>60000)throw Error('文案准备状态不完整');
 if(!previous&&incoming.phase!=='copy')throw Error('请先优化并确认文案');
 const reset=!previous||sourceText(incoming.sourceText)!==sourceText(previous.sourceText)||incoming.phase==='copy';
 return {version:1,phase:reset?'copy':previous.phase==='copy'?'copy':incoming.phase,sourceText:incoming.sourceText,draftText:incoming.draftText,jobId:typeof incoming.jobId==='string'?incoming.jobId.slice(0,100):null,proposalJobId:typeof incoming.proposalJobId==='string'?incoming.proposalJobId.slice(0,100):null,changes:Array.isArray(incoming.changes)?incoming.changes.filter(value=>text(value,600)).slice(0,8):[],reviewSummary:typeof incoming.reviewSummary==='string'?incoming.reviewSummary.slice(0,2000):'',confirmation:reset?null:previous.confirmation||null};
}
export function designCopyIssue(project){return project.copyFlow&&(!project.copyFlow.confirmation||project.copyFlow.phase==='copy')?'请先确认优化后的文案，再配置图片并设计':null;}
export function validateCopyPlan(plan,snapshot){
 const fail=message=>{throw Error('文案技能调度未完成：'+message);},loaded=new Set(snapshot.loadedSkills||[]);
 if(!plan||plan.version!==1||!Array.isArray(plan.skills)||!Array.isArray(plan.choices)||plan.choices.length!==COPY_CANDIDATES.length||typeof plan.intent!=='string'||plan.intent.trim().length<8)fail('需要完整的主动选择记录与本次目标');
 const registered=new Map();for(const skill of plan.skills){if(!COPY_SKILLS.includes(skill.id)||registered.has(skill.id)||!loaded.has(skill.id)||!Array.isArray(skill.sources)||!skill.sources.includes('/workspace/skills/'+skill.id+'/SKILL.md')||skill.sources.some(path=>typeof path!=='string'||!path.startsWith('/workspace/skills/'+skill.id+'/')||path.includes('..')||path.includes('\\')||!path.endsWith('.md')))fail('采用的模块必须实际载入，并登记本模块的真实来源');registered.set(skill.id,skill);}
 if(COPY_CORE.some(id=>!registered.has(id))||loaded.size>7)fail('内容策划、表达创作和编辑审校均需参与，最多七个模块');
 if(!registered.get('xhs-writer').sources.includes('/workspace/skills/xhs-writer/references/xiaohongshu-viral-methodology.md'))fail('需读取内容策划的真实方法参考');
 const seen=new Set();for(const choice of plan.choices){const spec=COPY_CANDIDATES.find(spec=>spec.id===choice?.skillId);if(!spec||seen.has(choice.skillId)||!['use','skip'].includes(choice.status)||!text(choice.reason,600)||choice.reason.trim().length<8)fail('六个候选都需要具体采用或跳过的理由');seen.add(choice.skillId);if(choice.status==='use'){if(!registered.has(choice.skillId)||!text(choice.action,1000)||choice.action.trim().length<8||!registered.get(choice.skillId).sources.includes('/workspace/skills/'+choice.skillId+'/'+spec.reference))fail('选中的专长需读取真实参考，并说明实际手法');}else if(registered.has(choice.skillId)||COPY_CORE.includes(choice.skillId))fail('核心模块不能跳过，未采用模块不能登记已使用');}
 return structuredClone(plan);
}
export function validateCopyProposal(raw,snapshot,turnId){
 const fail=message=>{throw Error(message+'。本次结果未应用。');},dispatch=snapshot.copyDispatch,proposal=raw?.copyOptimization,policy=snapshot.copyOptimizationPolicy;
 if(!raw||!text(raw.summary,3000)||!text(raw.report,30000)||!Array.isArray(raw.pages)||raw.pages.length||!proposal||proposal.version!==1||!Array.isArray(proposal.pages)||proposal.pages.length<1||proposal.pages.length>20||!Array.isArray(proposal.changes)||!proposal.changes.length||proposal.changes.length>8||proposal.changes.some(value=>!text(value,600)))fail('文案优化结果不完整');
 if(!dispatch||dispatch.turnId!==turnId)fail('缺少本轮实际文案技能调度');
 const used=dispatch.skills.map(skill=>skill.id);if(!Array.isArray(raw.usedSkills)||used.some(id=>!raw.usedSkills.includes(id))||raw.usedSkills.some(id=>!used.includes(id)))fail('实际使用报告与已载入的文案技能不一致');
 const pages=proposal.pages.map((page,index)=>{if(!text(page.text,60000)||manuscriptParts(page.text).chunks.length!==1||!Array.isArray(page.sourcePages)||!page.sourcePages.length||new Set(page.sourcePages).size!==page.sourcePages.length||page.sourcePages.some(n=>!Number.isInteger(n)||n<1||n>policy.sourcePages))fail('文案的逐页来源不完整');if(policy.paginationMode==='fixed'&&(proposal.pages.length!==policy.sourcePages||page.sourcePages.length!==1||page.sourcePages[0]!==index+1))fail('明确分页的文案必须逐页优化，不能拆页、合页或移动原页归属');return {text:sourceText(page.text),sourcePages:page.sourcePages};});
 const coverage=new Set(pages.flatMap(page=>page.sourcePages));if(coverage.size!==policy.sourcePages)fail('文案优化遗漏了原稿页面');
 const manuscript=pages.map(page=>page.text).join('\n\n---\n\n');if(manuscript.length>60000)fail('优化后的文案超过六万字');
 const sources=Array.isArray(raw.sources)?raw.sources.filter(item=>text(item?.title,500)&&typeof item.url==='string'&&/^https:\/\//.test(item.url)).slice(0,20):[];
 if(dispatch.plan.choices.some(choice=>choice.skillId==='content-research-writer'&&choice.status==='use')&&!sources.length)fail('资料研究技能需给出实际可核对的来源');
 return {summary:raw.summary,report:raw.report,usedSkills:used,pages:[],manuscript,copyOptimization:{version:1,pages,changes:proposal.changes,sourceHash:snapshot.sourceHash},copyDesign:dispatch,sources,artifacts:[]};
}
export function validateCopyReview(value){
 if(!value||!['passed','revise'].includes(value.status)||!text(value.summary,2000)||!Array.isArray(value.checks)||value.checks.length!==COPY_CHECKS.length||new Set(value.checks.map(check=>check.topic)).size!==COPY_CHECKS.length||value.checks.some(check=>!COPY_CHECKS.includes(check.topic)||!['pass','revise'].includes(check.judgment)||!text(check.evidence,1800)||typeof check.fix!=='string'||check.fix.length>1800||check.judgment==='revise'&&!check.fix.trim())||value.status!==(value.checks.some(check=>check.judgment==='revise')?'revise':'passed'))throw Error('独立文案审校结论不完整');return structuredClone(value);
}
