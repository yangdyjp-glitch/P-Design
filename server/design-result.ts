import {assertLockedCopy,readCopyBlocks} from './copy-integrity';
import {styleIssue} from '../src/style-safety.js';
import {imageModeIssue,requiresPhoto,requiredUploadIds} from '../src/preset-images.js';
import {paginationIssue} from '../src/pagination-policy.js';

export class DesignValidationError extends Error {
 constructor(public code:string,message:string){super(message);this.name='DesignValidationError';}
}
function reject(code:string,message:string):never{throw new DesignValidationError(code,message+'。本次结果未应用。');}

export function validateDesignResult(raw:any,job:{snapshot:string;skill_ids:string;kind:string;generatedAssetIds?:string[];generatedAssets?:any[]}){
 if(!raw||typeof raw.summary!=='string'||typeof raw.report!=='string'||!Array.isArray(raw.pages))reject('RESULT_FORMAT','AI 结果格式不完整');
 const snapshot=JSON.parse(job.snapshot),automatic=snapshot.workflow==='automatic'&&['design','revise'].includes(job.kind),pageScoped=automatic&&snapshot.scope==='page',allowed=new Map<string,any>(snapshot.pages.map((p:any)=>[p.id,p])),seen=new Set<string>();
 const sourceCopy:any[]=snapshot.pages.flatMap((p:any)=>p.copy),copyById=new Map<string,any>(sourceCopy.map(c=>[c.id,c])),returnedCopyIds:string[]=[];
 if(automatic&&(raw.pages.length<1||raw.pages.length>20||copyById.size!==sourceCopy.length))reject('PAGE_COUNT','AI 分页数量或原文编号不正确');
 if(pageScoped&&(snapshot.pages.length!==1||raw.pages.length!==1))reject('PAGE_SCOPE','单图修改必须保留当前一张图，不能新增、删除或重新分页');
 if(automatic&&snapshot.paginationMode==='fixed'&&raw.pages.length!==snapshot.pages.length)reject('PAGE_BOUNDARY','已明确分页的文案必须保持原页数；让图片适配页面，不能为了放图自行增页、拆页或合并');
 const assetIds=new Set<string>([...(snapshot.assets||[]).map((a:any)=>a.id),...(job.generatedAssetIds||[])]),usedImages=new Set<string>();
 const pages=raw.pages.map((page:any,position:number)=>{
  const original=allowed.get(page?.id),index=automatic?position+1:snapshot.pages.findIndex((p:any)=>p.id===page?.id)+1;
  if(((!automatic||pageScoped)&&!original)||typeof page?.id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(page.id)||typeof page.html!=='string'||page.html.length>150000||typeof page.css!=='string'||page.css.length>80000)reject('PAGE_SCOPE','AI 返回了范围外或格式不正确的页面');
  if(seen.has(page.id))reject('PAGE_DUPLICATE',`第 ${index} 页重复出现在 AI 结果中`);
  seen.add(page.id);
  const tag=page.html.match(/<\s*(script|iframe|object|embed|form|link|style|base|meta)\b/i)?.[1].toLowerCase();
  if(tag)reject('HTML_TAG',`第 ${index} 页的页面结构包含不支持的 ${tag} 标记${tag==='style'?'，样式应放入独立样式字段':''}`);
  const tags=(page.html.match(/<(?:[^"'<>]|"[^"]*"|'[^']*')*>/g)||[]).join('');
  if(/\bon\w+\s*=/i.test(tags))reject('HTML_EVENT',`第 ${index} 页包含不能执行的交互代码`);
  // An SVG namespace identifies vector markup; it does not load an external resource.
  const resourceMarkup=tags.replace(/\s+xmlns\s*=\s*(["'])http:\/\/www\.w3\.org\/2000\/svg\1/gi,'');
  if(/javascript:|https?:|data:/i.test(resourceMarkup))reject('HTML_RESOURCE',`第 ${index} 页包含外部链接或内嵌资源，请使用本项目素材地址`);
  const issue=styleIssue(page.css);
  if(issue)reject(issue.code,`第 ${index} 页：${issue.message}`);
  for(const match of tags.matchAll(/\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)){
   const inlineIssue=styleIssue(match[1]??match[2]);
   if(inlineIssue)reject(inlineIssue.code,`第 ${index} 页的局部样式：${inlineIssue.message}`);
  }
  let copy=original?.copy;
  if(automatic){
   let ids:string[];try{ids=[...readCopyBlocks(page.html).keys()];}catch{reject('LOCKED_COPY',`第 ${index} 页重复了锁定原文`);}
   if(!ids.length||ids.some(id=>!copyById.has(id)))reject('LOCKED_COPY',`第 ${index} 页包含原文以外的文案编号`);
   returnedCopyIds.push(...ids);copy=ids.map(id=>copyById.get(id));
  }
  try{assertLockedCopy(page.html,copy);}catch{reject('LOCKED_COPY',`第 ${index} 页的排版修改、遗漏或重复了锁定原文`);}
  const photoAssetId=typeof page.photoAssetId==='string'?page.photoAssetId:null;
  if(automatic){
   if(photoAssetId&&!assetIds.has(photoAssetId))reject('ASSET_SCOPE',`第 ${index} 页使用了本项目以外的图片`);
   for(const image of page.html.matchAll(/<img\b[^>]*>/gi)){
    const src=image[0].match(/\bsrc\s*=\s*(["'])(.*?)\1/i)?.[2],asset=image[0].match(/\bdata-asset-id\s*=\s*(["'])(.*?)\1/i)?.[2];
    if(!asset||!assetIds.has(asset)||src!=='/api/files/'+asset)reject('ASSET_SCOPE',`第 ${index} 页的图片未正确关联本项目素材`);
    usedImages.add(asset);
   }
  }
  return {id:page.id,html:page.html,css:page.css,photoAssetId,...(automatic?{copy:structuredClone(copy),label:String(copy[0]?.text||'画面 '+index).slice(0,24)}:{})};
 });
 if(automatic){const issue=paginationIssue(snapshot.pages,pages,pageScoped||snapshot.paginationMode==='fixed'?'fixed':'auto');if(issue)reject('PAGE_BOUNDARY',issue);}
 if(automatic&&usedImages.size>8)reject('ASSET_COUNT','一轮方案最多使用8张不同图片，请从上传及搜索素材中择优选用');
 const modeIssue=imageModeIssue(snapshot.imageMode,pages,[...(snapshot.assets||[]),...(job.generatedAssets||[])],{requirePhoto:automatic&&requiresPhoto(snapshot),requiredUploadIds:automatic?requiredUploadIds(snapshot):[]});if(modeIssue)reject('IMAGE_MODE',modeIssue);
 if(automatic&&(returnedCopyIds.length!==sourceCopy.length||returnedCopyIds.some((id,i)=>id!==sourceCopy[i].id)))reject('COPY_ORDER','AI 分页遗漏、重复或调整了原文顺序');
 if(['write','reference'].includes(job.kind)&&pages.length)reject('ANALYSIS_SCOPE','分析或文案任务不能自动修改原版面');
 const selected=automatic?(snapshot.loadedSkills||['xiaohongshu-design','xhs-design-polish']):JSON.parse(job.skill_ids);
 return {theme:snapshot.stylePreset?.theme?structuredClone(snapshot.stylePreset.theme):null,summary:raw.summary.slice(0,3000),report:raw.report.slice(0,30000),usedSkills:Array.isArray(raw.usedSkills)?[...new Set(raw.usedSkills.filter((s:any)=>selected.includes(s)))]:[],pages,replacePages:automatic&&!pageScoped,manuscript:job.kind==='write'?String(raw.manuscript||'').slice(0,60000):'',sources:Array.isArray(raw.sources)?raw.sources.filter((s:any)=>s&&typeof s.title==='string'&&/^https:\/\//.test(s.url)).slice(0,20):[],artifacts:[] as any[]};
}
