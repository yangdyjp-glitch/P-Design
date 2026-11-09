import {resolveStylePreset} from './style-presets.js';
import {imageSource,uploadCoverageIssue} from './image-policy.js';

export function projectImageMode(project){return resolveStylePreset(project?.stylePresetId)?.imageMode||'auto';}
export function jobImageMode(project,parent){return parent?parent.imageMode||'auto':projectImageMode(project);}
export function webImagesForMode(mode,choice){return mode==='web'||mode==='auto'&&choice===true;}
export function assetsForMode(assets,mode){return mode==='none'?[]:mode==='upload'||mode==='web'?assets.filter(asset=>imageSource(asset)===mode):assets;}
export function requiresPhoto(snapshot){return ['upload','web'].includes(snapshot.imageMode)&&(snapshot.scope!=='page'||snapshot.otherPagesHavePhoto!==true);}
// Captured by the server for a new whole-set upload job; old jobs and page edits retain their original contract.
export function requiredUploadIds(snapshot){
 return snapshot.imageMode==='upload'&&snapshot.scope!=='page'&&Array.isArray(snapshot.imagePolicy?.requiredUploadIds)?[...new Set(snapshot.imagePolicy.requiredUploadIds)]:[];
}
export function hasAllowedPhoto(pages,assets,mode){
 return pages.some(page=>{
  const ids=[...String(page.html||'').matchAll(/<img\b[^>]*\bdata-asset-id\s*=\s*["']([^"']+)["'][^>]*>/gi)].map(match=>match[1]);
  if(page.layout!=='original'&&page.photoAssetId)ids.push(page.photoAssetId);
  return ids.some(id=>assets.some(asset=>asset.id===id&&imageSource(asset)===mode));
 });
}

/** @param {{requirePhoto?:boolean,requiredUploadIds?:string[]}} [policy] */
export function imageModeIssue(mode,pages,assets,policy={}){
 const {requirePhoto=false,requiredUploadIds=[]}=policy;
 if(!['upload','web','none'].includes(mode))return null;
 const rendered=new Set();
 for(const page of pages){
  const html=String(page.html||'');
  if(mode==='none'&&(/<\s*(?:img|svg|canvas|picture|source|video|audio|image|object|embed|iframe)\b/i.test(html)||/<input\b[^>]*\btype\s*=\s*["']?image\b/i.test(html)||page.photoAssetId))return '纯文字预案不能使用照片、插画或生成配图';
  const ids=[...(page.photoAssetId?[page.photoAssetId]:[])];
  for(const tag of html.matchAll(/<img\b[^>]*>/gi)){
   const id=tag[0].match(/\bdata-asset-id\s*=\s*["']([^"']+)["']/i)?.[1];
   if(!id)return '图片没有关联本项目素材';ids.push(id);rendered.add(id);
  }
  for(const id of ids){const asset=assets.find(asset=>asset.id===id);if(!asset||imageSource(asset)!==mode)return mode==='upload'?'上传配图预案只能使用用户上传的图片':'联网配图预案只能使用已搜索并保存来源的网络照片';}
 }
 if(requirePhoto&&!rendered.size)return mode==='web'?'联网配图预案需要至少一张实际搜索到的照片':'上传配图预案需要至少使用一张上传图片';
 if(mode==='upload')return uploadCoverageIssue(requiredUploadIds,rendered,assets);
 return null;
}
