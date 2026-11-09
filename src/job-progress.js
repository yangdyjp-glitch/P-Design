const active=new Set(['queued','starting','running','generating']);

// Page positions come from the actual target project. A design may repaginate,
// so its final page count is only shown once the browser checks real results.
export function jobProgress(job,project){
 if(!job)return null;
 const sameProject=project?.id===job.projectId,pageOnly=job.scope==='page',pageId=pageOnly&&job.pageIds?.length===1?job.pageIds[0]:null;
 const index=sameProject&&pageId?project.pages.findIndex(page=>page.id===pageId):-1;
 const scope=pageOnly?(index>=0?'第 '+(index+1)+' 张':'单图'):'整套';
 let action='',detail='',stage='';
 const local=job.clientProgress;
 if(job.clientState==='saving'){
  stage='saving';action='保存画面';detail='检查已通过，正在保存修改后的画面。';
 }else if(job.clientState==='checking'){
  stage='checking';const count=local?.total,current=local?.current;
  const actual=Number.isInteger(current)&&Number.isInteger(count)&&current>0&&current<=count&&count<=20;
  action=actual&&!pageOnly?'检查 '+current+'/'+count+' 张':'自动检查';
  detail=actual?'正在检查'+(pageOnly?scope:'第 '+current+'/'+count+' 张')+'的文字、图片和裁切。':'正在核对实际画面的文字、图片和裁切。';
 }else if(job.submissionStage==='saving'){
  stage='saving-input';action='保存文案';detail='正在保存本次文案和补充要求。';
 }else if(job.submissionStage==='sending'){
  stage='submitting';action='提交要求';detail='正在提交设计要求。';
 }else if(!active.has(job.status))return null;
 else if(job.status==='queued'){
  stage='queued';action=job.startingRequest?'启动设计':'等待开始';detail=job.startingRequest?'正在准备 AI 设计环境。':'要求已收到，等待开始设计。';
 }else if(job.status==='starting'){
  stage='starting';action='准备设计';detail='正在准备设计环境、文案和素材。';
 }else if(job.status==='generating'){
  stage='generating';action='生成示意配图';detail='正在制作本次设计使用的示意配图。';
 }else if(job.searchingPhotos){
  stage='searching';action='搜索实景配图';detail='正在联网寻找实景照片，并保存图片来源。';
 }else if(job.result?.repairing||job.repairOf){
  stage='correcting';action='自动修正版面';detail='正在根据检查发现的问题修正版面。';
 }else{
  stage='designing';action=job.kind==='write'?'整理文案':job.kind==='reference'?'分析参考图':job.kind==='image'?'制作视觉素材':pageOnly?'调整版式':'设计整套画面';
  detail=job.kind==='write'?'正在根据素材整理文案。':job.kind==='reference'?'正在分析本次参考图片。':job.kind==='image'?'正在制作本次视觉素材。':pageOnly?'正在调整本图的文字层级、图文位置和版式。':'正在安排文案分页、图文位置和整套版式。';
 }
 const shortAction=({'saving-input':'保存',submitting:'提交',queued:'排队',starting:'准备',designing:'设计',searching:'搜图',generating:'配图',correcting:'修正',checking:'检查',saving:'保存'})[stage];
 return {stage,action,shortAction,scope,label:scope+' · '+action,message:scope+'：'+detail,pageId,projectId:job.projectId};
}
