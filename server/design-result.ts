import {assertLockedCopy} from './copy-integrity';
import {styleIssue} from '../src/style-safety.js';

export class DesignValidationError extends Error {
 constructor(public code:string,message:string){super(message);this.name='DesignValidationError';}
}
function reject(code:string,message:string):never{throw new DesignValidationError(code,message+'。本次结果未应用。');}

export function validateDesignResult(raw:any,job:{snapshot:string;skill_ids:string;kind:string}){
 if(!raw||typeof raw.summary!=='string'||typeof raw.report!=='string'||!Array.isArray(raw.pages))reject('RESULT_FORMAT','AI 结果格式不完整');
 const snapshot=JSON.parse(job.snapshot),allowed=new Map<string,any>(snapshot.pages.map((p:any)=>[p.id,p])),seen=new Set<string>();
 const pages=raw.pages.map((page:any)=>{
  const original=allowed.get(page?.id),index=snapshot.pages.findIndex((p:any)=>p.id===page?.id)+1;
  if(!original||typeof page.html!=='string'||page.html.length>150000||typeof page.css!=='string'||page.css.length>80000)reject('PAGE_SCOPE','AI 返回了范围外或格式不正确的页面');
  if(seen.has(page.id))reject('PAGE_DUPLICATE',`第 ${index} 页重复出现在 AI 结果中`);
  seen.add(page.id);
  const tag=page.html.match(/<\s*(script|iframe|object|embed|form|link|style|base|meta)\b/i)?.[1].toLowerCase();
  if(tag)reject('HTML_TAG',`第 ${index} 页的页面结构包含不支持的 ${tag} 标记${tag==='style'?'，样式应放入独立样式字段':''}`);
  if(/\bon\w+\s*=/i.test(page.html))reject('HTML_EVENT',`第 ${index} 页包含不能执行的交互代码`);
  // An SVG namespace identifies vector markup; it does not load an external resource.
  const resourceMarkup=page.html.replace(/\s+xmlns\s*=\s*(["'])http:\/\/www\.w3\.org\/2000\/svg\1/gi,'');
  if(/javascript:|https?:|data:/i.test(resourceMarkup))reject('HTML_RESOURCE',`第 ${index} 页包含外部链接或内嵌资源，请使用本项目素材地址`);
  const issue=styleIssue(page.css);
  if(issue)reject(issue.code,`第 ${index} 页：${issue.message}`);
  for(const match of page.html.matchAll(/\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)){
   const inlineIssue=styleIssue(match[1]??match[2]);
   if(inlineIssue)reject(inlineIssue.code,`第 ${index} 页的局部样式：${inlineIssue.message}`);
  }
  try{assertLockedCopy(page.html,original.copy);}catch{reject('LOCKED_COPY',`第 ${index} 页的排版修改、遗漏或重复了锁定原文`);}
  return {id:page.id,html:page.html,css:page.css,photoAssetId:typeof page.photoAssetId==='string'?page.photoAssetId:null};
 });
 if(['write','reference'].includes(job.kind)&&pages.length)reject('ANALYSIS_SCOPE','分析或文案任务不能自动修改原版面');
 const selected=JSON.parse(job.skill_ids);
 return {summary:raw.summary.slice(0,3000),report:raw.report.slice(0,30000),usedSkills:Array.isArray(raw.usedSkills)?raw.usedSkills.filter((s:any)=>selected.includes(s)):[],pages,manuscript:job.kind==='write'?String(raw.manuscript||'').slice(0,60000):'',sources:Array.isArray(raw.sources)?raw.sources.filter((s:any)=>s&&typeof s.title==='string'&&/^https:\/\//.test(s.url)).slice(0,20):[],artifacts:[] as any[]};
}
