import {imageSource,uploadCoverageIssue} from '../src/image-policy.js';
export function automaticJob(job:{snapshot:string;kind:string}){
 const snapshot=JSON.parse(job.snapshot);
 return snapshot.workflow==='automatic'&&['design','revise'].includes(job.kind);
}
export function automaticPages(pages:any[],pageIds:string[],scope:unknown='project',parent?:any){
 if(scope!=='project'&&scope!=='page')throw Error('AI 修改范围不正确。');
 if(!Array.isArray(pageIds)||!pageIds.length||pageIds.some(id=>!pages.some(page=>page.id===id)))throw Error('页面范围不正确。');
 if(parent&&(parent.scope||'project')!==scope)throw Error('自动修正不能改变原任务的修改范围。');
 if(scope==='page'){
  if(pageIds.length!==1||parent&&(parent.pages.length!==1||parent.pages[0].id!==pageIds[0]))throw Error('单图修改只能针对原来选中的一张图。');
  return pages.filter(page=>page.id===pageIds[0]);
 }
 return pages;
}
export function automaticAssets(assets:any[],pages:any[],policy:{imageMode?:string;scope?:string}={}){
 if(policy.imageMode==='upload'&&policy.scope!=='page'){
  if(assets.length>8)throw Error('上传配图预案每个项目最多使用8张图片，请拆分项目后再试。');
  return assets.slice();
 }
 const referenced=new Set<string>();for(const page of pages){if(page.photoAssetId)referenced.add(page.photoAssetId);for(const match of String(page.html||'').matchAll(/\bdata-asset-id\s*=\s*["']([^"']+)["']/g))referenced.add(match[1]);}
 const selected=assets.filter(asset=>referenced.has(asset.id));if(selected.length>8)throw Error('本次画面已使用超过8张图片，请减少后再试。');
 for(const asset of assets.slice().reverse())if(selected.length<8&&!selected.some(item=>item.id===asset.id))selected.push(asset);
 return selected;
}
export function imageAllowed(job:{snapshot:string;kind:string}){
 const snapshot=JSON.parse(job.snapshot);
 return (!snapshot.imageMode||snapshot.imageMode==='auto')&&(job.kind==='image'||automaticJob(job)&&!snapshot.repairOf);
}
export function repairAllowed(job:{snapshot:string;kind:string;result?:string|null}){
 if(!automaticJob(job)||JSON.parse(job.snapshot).repairOf)return false;
 const state=job.result?JSON.parse(job.result):{};
 return !(Number(state.repairAttempts)>0);
}
export function renderAudit(manifest:any,pageCount:number,pages:any[]=[],assets:any[]=[],policy:{imageMode?:string;requirePhoto?:boolean;requiredUploadIds?:string[]}={}){
 if(!manifest||manifest.status!=='passed'||!Array.isArray(manifest.pages)||manifest.pages.length!==pageCount||!Array.isArray(manifest.issues)||manifest.issues.length||!Array.isArray(manifest.networkFailures)||manifest.networkFailures.length)throw Error('AI 渲染记录未通过完整性、页面数量或资源检查');
 let visibleRequired=false;const visibleUploads=new Set<string>();
 for(const page of pages){
  const used=[...String(page.html).matchAll(/<img\b[^>]*\bdata-asset-id\s*=\s*["']([^"']+)["'][^>]*>/gi)].map(match=>match[1]);if(!used.length)continue;
  const record=manifest.pages.find((item:any)=>item.id===page.id),checks=record?.imageChecks;
  if(!Array.isArray(checks)||checks.length!==used.length)throw Error('AI 缺少逐图裁剪检查记录');
  for(let index=0;index<used.length;index++){const check=checks[index],asset=assets.find(item=>item.id===used[index]),source=imageSource(asset);
   if(check.assetId!==used[index]||check.source!==source||check.loaded!==true||check.passed!==true||typeof check.visibleFraction!=='number'||!Number.isFinite(check.visibleFraction)||check.visibleFraction<0||check.visibleFraction>1||source==='upload'&&(check.reason||check.visibleFraction+0.000001<0.8))throw Error('上传图片必须至少保留80%的原图画面');
   if(source===policy.imageMode&&check.visibleFraction>0)visibleRequired=true;
   if(source==='upload')visibleUploads.add(used[index]);
  }
 }
 if(policy.requirePhoto&&!visibleRequired)throw Error('配图预案必须实际显示至少一张指定来源的照片');
 const coverageIssue=uploadCoverageIssue(policy.requiredUploadIds,[...visibleUploads],assets);if(coverageIssue)throw Error(coverageIssue);
 return {status:'passed',pageCount,warnings:Array.isArray(manifest.warnings)?manifest.warnings.slice(0,20).map((w:any)=>String(typeof w==='string'?w:w.message||'存在渲染提示').slice(0,200)):[],checkedAt:new Date().toISOString()};
}
