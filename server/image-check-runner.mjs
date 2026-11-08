// This file is attached to the hosted design environment, not executed by the web server.
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
const input=JSON.parse(await fs.readFile('/workspace/input/project.json','utf8'));
const result=JSON.parse(await fs.readFile('/workspace/outputs/result.json','utf8'));
const assets=[...input.assets];
for(const file of ['web-photos.json','generated-photo.json'])try{const extra=JSON.parse(await fs.readFile('/workspace/input/'+file,'utf8'));for(const asset of extra.assets)if(!assets.some(item=>item.id===asset.id))assets.push(asset);}catch(error){if(error.code!=='ENOENT')throw error;}
const policy=(await fs.readFile('/workspace/runtime/image-policy.mjs','utf8')).replace(/^export /gm,'')+'\nwindow.__imagePolicy=auditImagePolicy;';
const fonts=[['Regular',400],['Medium',500],['Bold',700],['Black',900]].map(([name,weight])=>'@font-face{font-family:"TY Sans";src:url("file:///workspace/runtime/fonts/NotoSansSC-'+name+'.woff2");font-weight:'+weight+';}').join('');
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const records=[];
try{
 for(let index=0;index<result.pages.length;index++){
  const output=result.pages[index],source=input.pages.find(page=>page.id===output.id),settings=source?.settings||{},page=await browser.newPage({viewport:{width:1080,height:1440}});
  let markup=output.html;
  for(const asset of assets)if(asset.localPath)for(const quote of ['"',"'"])markup=markup.replaceAll(quote+'/api/files/'+asset.id+quote,quote+'file://'+asset.localPath+quote);
  const file='/workspace/outputs/.image-check-'+index+'.html';
  const shared=(input.baseCSS||'').replace(/@font-face\s*\{[^}]+\}/g,'');
  await fs.writeFile(file,'<!doctype html><html><meta charset="utf-8"><style>'+shared+fonts+'html,body{margin:0;padding:0}.xhs-card{width:1080px!important;height:1440px!important;margin:0!important}figure{overflow:hidden}figure img{object-position:'+(settings.photoX??50)+'% '+(settings.photoY??50)+'%!important;transform:scale('+(settings.photoZoom||1)+');transform-origin:center}'+output.css+'</style><body>'+markup+'</body></html>');
  try{
   await page.goto('file://'+file,{waitUntil:'load'});await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(image=>image.decode().catch(()=>{})));});
   await page.addScriptTag({content:policy});
   const imageChecks=await page.evaluate(assets=>{const root=document.querySelector('.xhs-card');if(!root)throw Error('No xhs-card root');return window.__imagePolicy(root,assets);},assets);
   records.push({id:output.id,imageChecks});
  }finally{await page.close();await fs.unlink(file);}
 }
}finally{await browser.close();}
const errors=records.flatMap(page=>page.imageChecks.filter(check=>!check.passed).map(check=>({pageId:page.id,assetId:check.assetId,message:check.source==='upload'?'Uploaded image must retain at least 80% of the original area; remove unsupported masks/rotation and reduce crop.':'Image failed to load',visibleFraction:check.visibleFraction})));
const audit={status:errors.length?'failed':'passed',pages:records,issues:errors,checkedAt:new Date().toISOString()};
await fs.writeFile('/workspace/outputs/image-policy-audit.json',JSON.stringify(audit,null,2));
const manifest=JSON.parse(await fs.readFile('/workspace/outputs/render-manifest.json','utf8'));
for(const page of manifest.pages){const record=records.find(item=>item.id===page.id);if(record)page.imageChecks=record.imageChecks;}
if(errors.length){manifest.status='failed';manifest.issues.push(...errors);}
await fs.writeFile('/workspace/outputs/render-manifest.json',JSON.stringify(manifest,null,2));
console.log(JSON.stringify(audit));if(errors.length)process.exitCode=1;
