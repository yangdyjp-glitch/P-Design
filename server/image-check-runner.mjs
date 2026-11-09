// This file is attached to the hosted design environment, not executed by the web server.
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';
const input=JSON.parse(await fs.readFile('/workspace/input/project.json','utf8'));
const {uploadCoverageIssue}=await import('/workspace/runtime/image-policy.mjs');
const {paginationIssue}=await import('/workspace/runtime/pagination-policy.mjs');
const {revisionReviewIssue,revisionMeasurementIssue}=await import('/workspace/runtime/page-revision.mjs');
const result=JSON.parse(await fs.readFile('/workspace/outputs/result.json','utf8'));
const assets=[...input.assets];
for(const file of ['web-photos.json','generated-photo.json'])try{const extra=JSON.parse(await fs.readFile('/workspace/input/'+file,'utf8'));for(const asset of extra.assets)if(!assets.some(item=>item.id===asset.id))assets.push(asset);}catch(error){if(error.code!=='ENOENT')throw error;}
const policy=(await fs.readFile('/workspace/runtime/image-policy.mjs','utf8')).replace(/^export /gm,'')+'\nwindow.__imagePolicy=auditImagePolicy;';
const fonts=[['Regular',400],['Medium',500],['Bold',700],['Black',900]].map(([name,weight])=>'@font-face{font-family:"TY Sans";src:url("file:///workspace/runtime/fonts/NotoSansSC-'+name+'.woff2");font-weight:'+weight+';}').join('');
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const records=[];let revisionMeasurement;
async function inspect(output,source,index,proof){
 const settings=source?.settings||{},page=await browser.newPage({viewport:{width:1080,height:1440}});
 let markup=output.html;
 for(const asset of assets)if(asset.localPath)for(const quote of ['"',"'"])markup=markup.replaceAll(quote+'/api/files/'+asset.id+quote,quote+'file://'+asset.localPath+quote);
 const file='/workspace/outputs/.image-check-'+index+'.html',shared=(input.baseCSS||'').replace(/@font-face\s*\{[^}]+\}/g,'');
 const clamp=(n,a,b)=>Math.max(a,Math.min(b,Number(n)||a));
 const background=/^#[a-f\d]{6}$/i.test(settings.background||'')?'.xhs-card{background:'+settings.background+'!important}':'';
 await fs.writeFile(file,'<!doctype html><html lang="zh-CN"><meta charset="utf-8"><style>'+shared+fonts+'html,body{margin:0;padding:0}.xhs-card{width:1080px!important;height:1440px!important;margin:0!important}figure{overflow:hidden}figure img{object-position:'+clamp(settings.photoX??50,0,100)+'% '+clamp(settings.photoY??50,0,100)+'%!important;transform:scale('+clamp(settings.photoZoom??1,1,2)+');transform-origin:center}'+background+(output.css||'')+'</style><body>'+markup+'</body></html>');
 try{
  await page.goto('file://'+file,{waitUntil:'load'});await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(image=>image.decode().catch(()=>{})));});
  await page.evaluate(scale=>{const sizes=[...document.querySelectorAll('[data-copy],[data-copy] *')].filter(el=>el.tagName!=='BR').map(el=>[el,parseFloat(getComputedStyle(el).fontSize)]);for(const [el,size]of sizes)if(size)el.style.fontSize=size*scale+'px';},settings.fontScale||1);
  await page.addScriptTag({content:policy});
  const record=await page.evaluate(assets=>{const root=document.querySelector('.xhs-card');if(!root)throw Error('No xhs-card root');const rect=root.getBoundingClientRect(),round=n=>Math.round(n*100)/100;return {width:round(rect.width),height:round(rect.height),imageChecks:window.__imagePolicy(root,assets),copyIds:[...root.querySelectorAll('[data-copy]')].map(el=>el.dataset.copy),typography:[...root.querySelectorAll('[data-copy]')].map(el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();return {id:el.dataset.copy,fontSize:s.fontSize,lineHeight:s.lineHeight,fontWeight:s.fontWeight,color:s.color,x:round(r.x),y:round(r.y),width:round(r.width),height:round(r.height)};})};},assets);
  if(proof){await page.screenshot({path:'/workspace/outputs/'+proof+'.png',animations:'disabled'});await page.screenshot({path:'/workspace/outputs/'+proof+'-phone.png',scale:'css',animations:'disabled'});execFileSync('python',['-c','from PIL import Image; import sys; p=sys.argv[1]; im=Image.open(p); im.resize((360,480),Image.Resampling.LANCZOS).save(p)', '/workspace/outputs/'+proof+'-phone.png']);}
  return {id:output.id,...record};
 }finally{await page.close();await fs.unlink(file);}
}
try{
 for(let index=0;index<result.pages.length;index++){
  const output=result.pages[index],source=input.pages.find(page=>page.id===output.id),revising=input.pageRevision?.pageId===output.id;
  const after=await inspect(output,source,index,revising?'revision-after':null);records.push(after);
  if(revising){
   const baselineAvailable=source?.layout==='original'&&typeof source.html==='string'&&!!source.html.trim()&&typeof source.css==='string'&&!!source.css.trim()&&input.pageRevision.baselineCopyCurrent!==false,before=baselineAvailable?await inspect(source,source,'before','revision-before'):null;
   let visualDifference=null;
   if(before)visualDifference=JSON.parse(execFileSync('python',['-c','from PIL import Image, ImageChops; import sys,json; a=Image.open(sys.argv[1]).convert("RGB"); b=Image.open(sys.argv[2]).convert("RGB"); d=ImageChops.difference(a,b); r,g,bl=d.split(); m=ImageChops.lighter(ImageChops.lighter(r,g),bl); n=m.point(lambda v:255 if v else 0).histogram()[255]; print(json.dumps({"changedPixels":n,"totalPixels":a.width*a.height,"fraction":n/(a.width*a.height),"bounds":m.getbbox()}))','/workspace/outputs/revision-before.png','/workspace/outputs/revision-after.png'],{encoding:'utf8'}));
   revisionMeasurement={version:1,pageId:output.id,request:input.pageRevision.request,status:'passed',baselineAvailable,before,after,visualDifference,files:{before:before?'revision-before.png':null,after:'revision-after.png'}};
  }
 }
}finally{await browser.close();}
const errors=records.flatMap(page=>page.imageChecks.filter(check=>!check.passed).map(check=>({pageId:page.id,assetId:check.assetId,message:check.source==='upload'?'Uploaded image must retain at least 80% of the original area; remove unsupported masks/rotation and reduce crop.':'Image failed to load',visibleFraction:check.visibleFraction})));
const requiredIds=input.imageMode==='upload'&&input.scope!=='page'?input.imagePolicy?.requiredUploadIds||[]:[];
const visibleIds=records.flatMap(page=>page.imageChecks.filter(check=>check.source==='upload'&&check.passed).map(check=>check.assetId));
const coverageIssue=uploadCoverageIssue(requiredIds,visibleIds,assets);if(coverageIssue)errors.push({pageId:result.pages[0]?.id,message:coverageIssue});
const pageIssue=paginationIssue(input.pages.map(page=>({id:page.id,copy:page.copy.map(({id})=>({id}))})),records.map(page=>({id:page.id,copy:page.copyIds.map(id=>({id}))})),input.scope==='page'||input.paginationMode==='fixed'?'fixed':'auto');
if(pageIssue)errors.push({pageId:result.pages[0]?.id,message:pageIssue});
if(input.pageRevision){
 const issue=revisionReviewIssue(result.revisionReview,input.pageRevision)||revisionMeasurementIssue(revisionMeasurement,input.pageRevision,result.revisionReview);
 if(issue){errors.push({pageId:input.pageRevision.pageId,message:issue});if(revisionMeasurement)revisionMeasurement.status='failed';}
 await fs.writeFile('/workspace/outputs/page-revision-audit.json',JSON.stringify(revisionMeasurement||{status:'failed',issues:[issue]},null,2));
}
const audit={status:errors.length?'failed':'passed',pages:records,issues:errors,checkedAt:new Date().toISOString()};
await fs.writeFile('/workspace/outputs/image-policy-audit.json',JSON.stringify(audit,null,2));
const manifest=JSON.parse(await fs.readFile('/workspace/outputs/render-manifest.json','utf8'));
for(const page of manifest.pages){const record=records.find(item=>item.id===page.id);if(record){page.imageChecks=record.imageChecks;page.copyIds=record.copyIds;}}
if(revisionMeasurement)manifest.pageRevision=revisionMeasurement;
if(errors.length){manifest.status='failed';manifest.issues.push(...errors);}
await fs.writeFile('/workspace/outputs/render-manifest.json',JSON.stringify(manifest,null,2));
console.log(JSON.stringify(audit));if(errors.length)process.exitCode=1;
