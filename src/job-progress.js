const active=new Set(['queued','starting','running','generating']);

// Page positions come from the actual target project. A design may repaginate,
// so its final page count is only shown once the browser checks real results.
export function jobProgress(job,project){
 if(!job)return null;
 const sameProject=project?.id===job.projectId,pageOnly=job.scope==='page',pageId=pageOnly&&job.pageIds?.length===1?job.pageIds[0]:null;
 const index=sameProject&&pageId?project.pages.findIndex(page=>page.id===pageId):-1;
 const scope=job.kind==='copy'?'文案':pageOnly?(index>=0?'第 '+(index+1)+' 张':'单图'):'整套';
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
  stage='queued';action=job.startingRequest?(job.kind==='copy'?'启动优化':'启动设计'):'等待开始';detail=job.kind==='copy'?(job.startingRequest?'正在准备 AI 文案环境。':'文案已收到，等待开始优化。'):job.startingRequest?'正在准备 AI 设计环境。':'要求已收到，等待开始设计。';
 }else if(job.status==='starting'){
  stage='starting';action=job.kind==='copy'?'准备优化':'准备设计';detail=job.kind==='copy'?'正在准备文案与写作技能。':'正在准备设计环境、文案和素材。';
 }else if(job.kind==='copy'){
  stage=job.copyStage==='reviewing'?'reviewing':job.result?.repairing?'correcting':job.copyStage==='matching'?'composing':'designing';action=job.copyStage==='reviewing'?'独立文案审校':job.result?.repairing?'修正文案':job.copyStage==='matching'?'匹配文案技能':'优化文案';detail=job.copyStage==='reviewing'?'正在对照原稿独立检查事实保留、信息完整性、分页与中文表达。':job.result?.repairing?'正在修正审校发现的问题，完成后再次核对。':'正在主动选择并应用合适的写作方法，优化表达与阅读结构。';
 }else if(job.status==='generating'){
  stage='generating';action='生成示意配图';detail='正在制作本次设计使用的示意配图。';
 }else if(job.searchingPhotos){
  stage='searching';action='搜索实景配图';detail='正在联网寻找实景照片，并保存图片来源。';
 }else if(job.visualStage==='reviewing'){
  stage='reviewing';action='独立视觉复核';detail='AI 正在独立查看实际成图，复核构图、图文比例、文字层级和留白。';
 }else if(job.visualStage==='delivering'){
  stage='delivering';action='收集成图';detail='独立视觉复核已通过，正在收集成图与可编辑文件。';
 }else if(job.result?.repairing||job.repairOf){
  stage='correcting';action='自动修正版面';detail='正在根据检查发现的问题修正版面。';
 }else if(job.visualStage==='composing'){
  stage='composing';action='规划视觉构图';detail=job.specialistRoutingRequired?'正在匹配适合各页的专长技能，比较构图与阅读顺序。':'正在结合核心视觉技能，比较本次内容适合的构图与阅读顺序。';
 }else{
  stage='designing';action=job.kind==='write'?'整理文案':job.kind==='reference'?'分析参考图':job.kind==='image'?'制作视觉素材':pageOnly?'调整版式':'设计整套画面';
  detail=job.kind==='write'?'正在根据素材整理文案。':job.kind==='reference'?'正在分析本次参考图片。':job.kind==='image'?'正在制作本次视觉素材。':pageOnly?'正在调整本图的文字层级、图文位置和版式。':job.paginationMode==='fixed'?'正在保留原分页，安排图文位置和整套版式。':'正在安排文案分页、图文位置和整套版式。';
 }
 const shortAction=(job.kind==='copy'?{designing:'优化',composing:'选法',reviewing:'审校'}[stage]:null)||({'saving-input':'保存',submitting:'提交',queued:'排队',starting:'准备',designing:'设计',composing:'构图',reviewing:'复核',delivering:'成图',searching:'搜图',generating:'配图',correcting:'修正',checking:'检查',saving:'保存'})[stage];
 return {stage,action,shortAction,scope,label:scope+' · '+action,message:scope+'：'+detail,pageId,projectId:job.projectId};
}
