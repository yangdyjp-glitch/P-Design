const templateNeeds=['dense_text','knowledge','checklist','narrative','evidence'];
export const SPECIALIST_NEEDS=['cover','reference','process','comparison','hierarchy',...templateNeeds,'illustration','local_adjustment'];
export const SPECIALISTS=[
 {id:'xhs-reference-contract',needs:['reference'],references:['references/checklist.md'],use:'真实设计样稿的层级、比例与节奏转规范；实拍素材不自动算设计参考'},
 {id:'xhs-cover-lab',needs:['cover'],references:['references/cover_archetypes.md','references/cover_brief_contract.md'],use:'封面停留理由、关键词、视觉证明与封面结构'},
 {id:'baoyu-infographic',needs:['process','comparison','hierarchy'],references:['references/analysis-framework.md','references/structured-content-template.md'],generative:true,use:'阶段、流程、比较、层级的布局库；禁止生图时仅参考信息组织方法'},
 {id:'auto-redbook',needs:templateNeeds,references:['assets/card.html','assets/styles.css'],use:'从实际卡片模板借鉴网格、区块和阅读节奏；保留原文、原分页和主题'},
 {id:'xhs-note-creator',needs:templateNeeds,references:['references/params.md'],use:'知识、清单和长文的文字卡片层级、分组与密度；使用模板结构而非固定主题色'},
 {id:'blcaptain-style-skill',needs:templateNeeds,references:['references/style-pack-catalog.md','references/xhs-style-system.md'],use:'实证、叙述和系列的具体视觉语法；不强加色调、印章、虚构标签或照片处理'},
 {id:'baoyu-cover-image',needs:['cover','illustration'],references:['references/types.md','references/visual-elements.md'],generative:true,use:'封面主视觉类型、情绪与表现；禁止生图时仅参考构图方法'},
 {id:'baoyu-xhs-images',needs:['illustration','narrative'],references:['references/style-layout-matrix.md'],generative:true,use:'插画组图的布局变化与信息节奏；不能擅自把真实照片改成插画'},
 {id:'xhs-images-design',needs:['illustration','narrative'],references:['references/style-presets.md'],generative:true,use:'手绘图解的布局与视觉组织；纯文字预案不新增插画'},
 {id:'xhs-writer',needs:['knowledge','narrative'],references:['references/xiaohongshu-viral-methodology.md'],writing:true,use:'已授权创作时策划内容；锁定原文时只参考阅读组织，不能改写'}
];
export const specialistRoutingPolicy=()=>({version:1,maxLoaded:8,catalog:structuredClone(SPECIALISTS)});
const nonempty=(text,max=1000)=>typeof text==='string'&&text.trim().length>=8&&text.length<=max;
const templates=['auto-redbook','xhs-note-creator','blcaptain-style-skill'];
function localAdjustmentAllowed(snapshot){const request=String(snapshot.pageRevision?.request||'').trim();return snapshot.scope==='page'&&snapshot.pages?.[0]?.html?.trim()&&request.length>0&&request.length<=300&&/(标题|字号|字重|行距|字距|对齐|换行|一行|颜色|间距|图片|照片|裁切|title|font|spacing|align|crop|image|photo)/i.test(request)&&!/(易读|阅读|重排|重新设计|重新排版|优化排版|审美|构图|层级|分组|节奏|风格|整体|redesign|readab|composition|hierarchy|regroup|restyle)/i.test(request);}

export function validateSpecialistRouting(plan,snapshot){
 const policy=snapshot.visualDesignPolicy?.specialistRouting;if(policy?.version!==1)return;
 const fail=message=>{throw Error('专长调度未完成：'+message);},catalog=policy.catalog||SPECIALISTS,decisions=plan.specialists;
 if(!Array.isArray(decisions)||decisions.length!==catalog.length)fail('必须逐项考虑全部十个可选模块，记录选用、跳过或受限原因');
 const byId=new Map(),pageIds=new Set(plan.pages.map(page=>page.id)),registered=new Map(plan.skills.map(skill=>[skill.id,skill]));
 if((snapshot.loadedSkills||[]).length>policy.maxLoaded||registered.size>policy.maxLoaded)fail('每次最多载入八个模块，请复用适合本套内容的方法');
 for(const item of decisions){
  const spec=catalog.find(spec=>spec.id===item?.skillId);
  if(!spec||byId.has(item.skillId)||!['use','skip','restricted'].includes(item.status)||!['methods','execute','none'].includes(item.mode)||!Array.isArray(item.pageIds)||new Set(item.pageIds).size!==item.pageIds.length||item.pageIds.some(id=>!pageIds.has(id))||!nonempty(item.reason,600))fail('选择记录必须完整、唯一，且对应本次页面与具体原因');
  byId.set(item.skillId,item);
  if(item.status!=='use'){if(item.mode!=='none'||item.pageIds.length||registered.has(item.skillId))fail('未采用的模块不能登记为已使用');continue;}
  if(item.mode==='none'||!item.pageIds.length||!registered.has(item.skillId)||!snapshot.loadedSkills?.includes(item.skillId))fail('选中的专长必须实际载入、登记来源并分配到页面');
  if(item.mode==='execute'&&spec.generative&&!((!snapshot.imageMode||snapshot.imageMode==='auto')&&snapshot.workflow==='automatic'&&['design','revise'].includes(snapshot.kind)&&!snapshot.repairOf))fail('本预案不允许执行生成图片的流程，请仅借鉴方法或选其他模块');
  if(item.mode==='execute'&&spec.writing&&snapshot.kind!=='write')fail('锁定原文的设计不能执行文案创作');
  const prefix='/workspace/skills/'+item.skillId+'/';
  if(!registered.get(item.skillId).sources.some(path=>spec.references.some(reference=>path===prefix+reference)))fail('选中的专长还需读取并登记能力卡中的实际参考文件');
  for(const id of item.pageIds){const page=plan.pages.find(page=>page.id===id);if(!page.techniques.some(technique=>technique.skillId===item.skillId))fail('专长必须落实为对应页面的具体手法与内容原因');}
 }
 for(const id of registered.keys())if(catalog.some(spec=>spec.id===id)&&byId.get(id)?.status!=='use')fail('使用清单与专长选择不一致');
 for(const page of plan.pages){
  const needs=page.specialistNeeds;
  if(!Array.isArray(needs)||!needs.length||needs.length>5||new Set(needs).size!==needs.length||needs.some(need=>!SPECIALIST_NEEDS.includes(need)))fail('每页必须判断具体的信息任务，不能只登记通用排版');
  const selected=decisions.filter(item=>item.status==='use'&&item.pageIds.includes(page.id)),selectedIds=new Set(selected.map(item=>item.skillId));
  const local=needs.length===1&&needs[0]==='local_adjustment';
  if(local){if(!localAdjustmentAllowed(snapshot)||!nonempty(page.localAdjustmentReason,600))fail('只有明确的单页微调可以复用既有构图，并说明无需新增专长的原因；广泛的易读性或构图调整仍需匹配专长');}
  else if(needs.includes('local_adjustment')||!selected.length)fail('新设计和整体重排应主动采用至少一个适合本页的专长');
  for(const item of selected){const spec=catalog.find(spec=>spec.id===item.skillId);if(!local&&!needs.some(need=>spec.needs.includes(need)))fail('所选专长应对应本页的内容任务，不能为增加数量而调用');}
  for(const [need,required]of [['cover','xhs-cover-lab'],['reference','xhs-reference-contract'],['process','baoyu-infographic'],['comparison','baoyu-infographic'],['hierarchy','baoyu-infographic']])if(needs.includes(need)&&!selectedIds.has(required))fail('本页的'+need+'任务尚未调用对应专长 '+required);
  if(needs.some(need=>templateNeeds.includes(need))&&!templates.some(id=>selectedIds.has(id)))fail('文字、叙述与实证内容需主动选择一个适合的卡片或风格模块');
 }
}

export function specialistResultIssue(design,usedSkills,pages,assets=[]){
 const decisions=design?.plan?.specialists;if(!Array.isArray(decisions)||decisions.length!==SPECIALISTS.length||new Set(decisions.map(item=>item.skillId)).size!==SPECIALISTS.length||decisions.some(item=>!SPECIALISTS.some(spec=>spec.id===item.skillId)))return '缺少完整的专长选择记录';
 const loaded=new Set((design.skills||[]).filter(skill=>skill.loaded).map(skill=>skill.id)),ids=new Set((pages||[]).map(page=>page.id));
 for(const item of decisions)if(item.status==='use'){if(!loaded.has(item.skillId))return '采用的专长未实际载入登记';if(!usedSkills?.includes(item.skillId))return '采用的专长未列入本次实际使用报告';if(!item.pageIds?.length||item.pageIds.some(id=>!ids.has(id)))return '采用的专长未对应本次画面';}
 const generated=new Set(assets.filter(asset=>asset.source==='generated'||asset.generated===true).map(asset=>asset.id));
 for(const item of decisions.filter(item=>item.status==='use'&&item.mode==='execute'&&SPECIALISTS.find(spec=>spec.id===item.skillId)?.generative))for(const id of item.pageIds){const page=pages.find(page=>page.id===id),images=[...String(page.html).matchAll(/\bdata-asset-id\s*=\s*["']([^"']+)["']/g)].map(match=>match[1]);if(!images.some(id=>generated.has(id)))return '不能把方法参考报告为已经执行生图，需有实际生成并应用的素材';}
 const chosen=new Set(decisions.filter(item=>item.status==='use').map(item=>item.skillId));if((usedSkills||[]).some(id=>SPECIALISTS.some(spec=>spec.id===id)&&!chosen.has(id)))return '技能使用报告与选择记录不一致';
 return null;
}
