import {clone} from './engine.js';

export function canApplyAutomatic(job,project){
 return !!project&&job.projectId===project.id&&!project._cloudDirty&&!project._syncConflict&&project.cloudRevision===job.baseRevision;
}
export function hasAuditErrors(reports){return reports.some(page=>page.issues.some(issue=>issue.severity==='error'));}
export function jobApplied(job,project){
 return !!job&&!!project&&(project.lastAIJobId===job.id||job.scope==='page'&&job.pageIds?.length===1&&project.pages.some(page=>page.id===job.pageIds[0]&&page.lastAIJobId===job.id));
}
export function designProposal(job,project){
 if(!project||job.projectId!==project.id)throw Error('原项目已删除，可从交付文件查看结果。');
 const result=job.result,draft=clone(project);
 if(job.scope==='page'&&(result.replacePages||job.pageIds?.length!==1||result.pages?.length!==1||result.pages[0].id!==job.pageIds[0]))throw Error('单图方案超出了当前图的修改范围。');
 for(const asset of result.assets||[])if(!draft.assets.some(item=>item.id===asset.id))draft.assets.push(asset);
 if(result.replacePages){
  draft.pages=result.pages.map(page=>{
   const previous=project.pages.find(item=>item.id===page.id)||project.pages.find(item=>item.copy.length===page.copy.length&&item.copy.every((copy,index)=>copy.id===page.copy[index].id));
   return {id:page.id,label:page.label||page.copy[0]?.text.slice(0,24)||'画面',copy:clone(page.copy),originalCopy:clone(page.copy),requirements:previous?.requirements||'',html:page.html,css:page.css,layout:'original',photoAssetId:page.photoAssetId,settings:{accent:result.theme?.primary||'#214BE1',fontScale:1,photoZoom:1,photoX:50,photoY:50}};
  });
 }else for(const page of result.pages||[]){
  const target=draft.pages.find(item=>item.id===page.id);if(!target)throw Error('页面已发生变化，请重新设计。');
  target.html=page.html;target.css=page.css;target.layout='original';target.photoAssetId=page.photoAssetId||null;
  if(result.theme?.primary){target.settings??={};target.settings.accent=result.theme.primary;}
 }
 return draft;
}
export function automaticMessage(job,project){
 if(project?._aiState&&project._aiState.jobId===job?.id)return project._aiState.message;
 if(!job)return '文案与素材准备好后，交给 AI 完成设计和检查。';
 if(job.status==='queued'||job.status==='starting')return '正在准备设计，文案已保留。';
 if(job.status==='running'||job.status==='generating')return job.result?.repairing?'AI 正在自动修正检查发现的问题。':job.searchingPhotos?'AI 正在联网寻找实景配图，并保存图片来源。':job.scope==='page'?'AI 正在修改本图并自动检查，其他图保持不变。':'AI 正在判断视觉方案、制作画面并自动检查。';
 if(job.status==='failed')return '本轮设计未完成，文案仍已保留，可稍后重试。';
 if(jobApplied(job,project))return job.scope==='page'?'本图已更新并通过自动检查，其他图保持不变。':'设计已呈现，AI 渲染检查与网页检查均已通过。';
 return '方案已保留；有新文案时可让 AI 重新设计。';
}
