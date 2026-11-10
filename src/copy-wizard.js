import {uid,escape as esc,parseManuscript} from './engine.js';
import {copyHash,sourceText} from './copy-workflow.js';
import {manuscriptPaginationMode} from './pagination-policy.js';
import {validateStylePresetId} from './style-presets.js';
import {projectImageMode,webImagesForMode} from './preset-images.js';
import {jobProgress} from './job-progress.js';

const active=job=>job&&['queued','starting','running','generating'].includes(job.status);
export function createCopyWizard({S,project,render,scheduleSave,persist,toast,closeModal,button,stylePresetChoices,showSelectedPreset,readImageFiles,cloud}){
 const latest=p=>S.jobs?.find(job=>job.id===p?.copyFlow?.jobId),busy=()=>!!S.copySubmitting||S.jobs?.some(active)||!!S.checkingAI;
 const touch=p=>{p._cloudDirty=true;p._editVersion=(p._editVersion||0)+1;};
 const steps=step=>'<ol class="creation-steps" aria-label="新建图文步骤">'+['优化并确认文案','配图与预案','AI 设计'].map((label,index)=>'<li class="'+(index+1===step?'current':index+1<step?'done':'')+'" '+(index+1===step?'aria-current="step"':'')+'><span>'+String(index+1).padStart(2,'0')+'</span>'+label+'</li>').join('')+'</ol>';
 function isPreparing(p){return p?.copyFlow?.version===1&&p.copyFlow.phase!=='design';}
 function newDraft(){
  const page=parseManuscript('新的图文',{preserveText:true})[0];page.copy[0].text='';page.originalCopy[0].text='';
  const p={id:uid(),name:'待确认的文案',paginationMode:'auto',pages:[page],assets:[],brief:'',stylePresetId:null,allowWebImages:false,copyFlow:{version:1,phase:'copy',sourceText:'',draftText:'',jobId:null,proposalJobId:null,confirmation:null},history:[],redo:[],createdAt:Date.now(),updatedAt:Date.now()};
  S.projects.unshift(p);S.activeId=p.id;S.pageId=page.id;S.audit=null;closeModal();render();scheduleSave();document.querySelector('#copy-source')?.focus();
 }
 function sourceForm(p){return '<form id="copy-source-form"><label class="copy-label" for="copy-source">原始文案</label><textarea id="copy-source" class="copy-manuscript" maxlength="60000" required placeholder="粘贴你准备好的文字。AI 会优化表达、梳理重点并核对信息，确认后再配图。">'+esc(p.copyFlow.sourceText)+'</textarea><p class="small-note">已用（1P）、P1、第1页或 --- 明确分页时，按原分页优化。未分页时由 AI 提出完整的组图结构。</p><div class="copy-form-actions"><button class="btn primary" type="submit" data-copy-start>开始优化文案</button></div></form>';}
 function view(p){
  const flow=p.copyFlow,job=latest(p),ready=!!flow.proposalJobId&&!!flow.draftText,step=flow.phase==='copy'?1:2;
  let body='';
  if(step===1){body='<p class="creation-eyebrow">从内容开始</p><h1>'+(ready?'确认这份文案，再交给 AI 设计':'先把文案整理好')+'</h1><p class="creation-description">'+(ready?'可以直接编辑优化稿。确认后，图片与版式都将围绕这份文字展开。':'只需输入文字，AI 主动选择写作方法，优化表达并独立审校。')+'</p>';
   body+=ready?'<form id="copy-confirm-form"><div class="between"><label class="copy-label" for="copy-draft">优化后的文案</label><span class="pill">AI 稿审校已通过</span></div>'+(flow.changes?.length?'<div class="copy-changes"><b>这次优化</b><ul>'+flow.changes.map(change=>'<li>'+esc(change)+'</li>').join('')+'</ul></div>':'')+'<textarea id="copy-draft" class="copy-manuscript" maxlength="60000" required>'+esc(flow.draftText)+'</textarea><p class="small-note">确认时锁定分页和文案。手动编辑会直接采用，编辑后的内容请自行核对。</p><div class="copy-form-actions"><button class="btn primary" type="submit" data-copy-confirm>确认文案，进入配图</button>'+button('copy-record','查看优化与技能记录',null,'btn')+'</div></form><details class="copy-source-details"><summary>查看原稿，或修改后重新优化</summary>'+sourceForm(p)+'</details>':sourceForm(p);
   body+='<div class="copy-progress" role="status" aria-live="polite"></div><div class="copy-live-actions"></div><p class="creation-footnote">优化与设计分别计入任务额度。文案确认前不会启动画面设计。</p>';
  }else{
   body='<p class="creation-eyebrow">文字已确认</p><h1>为这份内容准备画面</h1><p class="creation-description">'+p.pages.length+' 页文案已锁定。选择素材方式与预案，AI 会主动安排构图并检查成图。</p><form id="copy-assets-form"><details class="copy-source-details"><summary>查看已确认的文案</summary><div class="confirmed-manuscript">'+esc(flow.draftText)+'</div></details><div class="new-image-options"><div class="new-asset-input"><label class="btn" for="new-photos">添加图片（选填）</label><input id="new-photos" type="file" accept="image/png,image/jpeg,image/webp" multiple hidden><span id="new-photo-count" class="small-note">'+(p.assets.length?'已添加 '+p.assets.length+' 张图片':'最多 8 张，AI 判断用途与摆放')+'</span></div><p class="photo-upload-rule">上传图最多裁剪 20%，至少保留 80% 原图画面。</p><label class="web-photo-choice" for="new-web-images"><input id="new-web-images" type="checkbox" '+(p.allowWebImages?'checked':'')+'><span><b>让 AI 从网上找图</b><small>优先实景照片，保留来源；网络照片可灵活裁切。</small></span></label><p id="new-image-help" class="small-note" hidden></p></div>';
   body+=(p.assets.length?'<div class="copy-photo-list">'+p.assets.map(asset=>'<figure><img src="'+esc(asset.url)+'" alt="'+esc(asset.name)+'"><figcaption>'+esc(asset.name)+'</figcaption>'+button('copy-remove-photo','移除',null,'btn small','data-id="'+esc(asset.id)+'"')+'</figure>').join('')+'</div>':'')+stylePresetChoices(p.stylePresetId||'')+'<div class="form-field"><label for="new-brief">本次补充 <span class="muted">选填</span></label><textarea id="new-brief" maxlength="6000" rows="2" placeholder="仅填写本次图文希望保留的品牌要求或表达重点。">'+esc(p.brief||'')+'</textarea></div><p id="new-task-help" class="small-note"></p><div class="copy-form-actions"><button class="btn primary" type="submit" data-copy-design>开始 AI 设计</button>'+button('copy-back','返回修改文案',null,'btn')+'</div></form>';
  }
  return '<main class="creation-workspace" data-copy-workspace="'+esc(p.id)+'">'+steps(step)+'<div class="creation-content">'+body+'</div></main>';
 }
 function sync(){
  const p=project();if(!isPreparing(p)||!document.querySelector('[data-copy-workspace]'))return;
  const job=latest(p),progress=jobProgress(job,p),status=document.querySelector('.copy-progress'),actions=document.querySelector('.copy-live-actions');
  if(status){status.textContent=active(job)?progress?.message||'正在优化文案…':job?.status==='failed'?job.error||'文案优化未完成，原稿已保留，可重新尝试。':job?.status==='cancelled'?'本次优化已停止，原稿已保留。':!p.copyFlow.proposalJobId&&p.copyFlow.draftText?'原稿已修改，请重新优化后确认。':p.copyFlow.proposalJobId?'优化稿已准备好，确认后进入配图。':'输入文字后开始优化。';status.classList.toggle('error',job?.status==='failed');}
  if(actions){const html=active(job)?button('copy-stop','停止本次优化',null,'btn small'):'';if(actions.innerHTML!==html)actions.innerHTML=html;}
  for(const control of document.querySelectorAll('[data-copy-start]'))control.disabled=busy()||!p.copyFlow.sourceText.trim()||!S.session?.capabilities.ai;
  for(const control of document.querySelectorAll('#copy-source,#copy-draft'))control.disabled=!!S.copySubmitting;
  const confirm=document.querySelector('[data-copy-confirm]');if(confirm)confirm.disabled=busy()||!p.copyFlow.proposalJobId||!p.copyFlow.draftText.trim();
  const stamp=document.querySelector('#copy-confirm-form .pill');if(stamp)stamp.textContent=p.copyFlow.proposalJobId?'AI 稿审校已通过':'原稿已修改，需重新优化';
  for(const control of document.querySelectorAll('[data-copy-design],[data-action="copy-back"],[data-action="copy-remove-photo"]'))control.disabled=busy();
 }
 function afterRender(){if(project()?.copyFlow?.phase==='assets')showSelectedPreset();sync();}
 async function start(){
  const p=project(),flow=p.copyFlow;if(busy())throw Error('请等待当前 AI 任务完成。');if(!flow.sourceText.trim())throw Error('请先输入文案。');
  S.copySubmitting=true;sync();
  try{
   const pages=parseManuscript(flow.sourceText,{preserveText:true});p.pages=pages;p.paginationMode=manuscriptPaginationMode(flow.sourceText);p.name=pages[0].label.slice(0,80)||'待确认的文案';S.pageId=pages[0].id;flow.phase='copy';flow.confirmation=null;flow.proposalJobId=null;flow.draftText='';scheduleSave();await cloud().save(p);await persist({skipCloud:true});if(p._cloudDirty)throw Error('原稿正在保存，请稍后再试。');
   const {job}=await cloud().request('jobs',{method:'POST',body:JSON.stringify({projectId:p.id,revision:p.cloudRevision,requestId:uid(),kind:'copy',prompt:'优化本次文案，主动采用合适的写作技能，核对事实保留与分页。',pageIds:p.pages.map(page=>page.id)})});flow.jobId=job.id;S.jobs.unshift(job);touch(p);cloud().startPolling();await persist({skipCloud:true});await cloud().save(p);await persist({skipCloud:true});render();toast('已开始优化文案，审校通过后由你确认。');
  }finally{S.copySubmitting=false;sync();cloud().updateBadge();}
 }
 async function receive(job){
  const p=S.projects.find(item=>item.id===job.projectId);if(!p?.copyFlow||p.copyFlow.phase!=='copy'||p.copyFlow.jobId!==job.id){job.clientState='copy-held';return;}
  if(p.copyFlow.proposalJobId===job.id){job.clientState='copy-ready';return;}
  const original=sourceText(p.copyFlow.sourceText);if(job.copySourceHash!==await copyHash(original)||sourceText(p.copyFlow.sourceText)!==original){job.clientState='copy-held';return;}
  if(job.detailsLoaded===false){Object.assign(job,(await cloud().request('jobs/'+job.id)).job);job.detailsLoaded=true;}
  if(p.copyFlow.jobId!==job.id||sourceText(p.copyFlow.sourceText)!==original){job.clientState='copy-held';return;}
  if(job.result?.copyReview?.status!=='passed'||job.result.copyReview.independent!==true||job.result.copyReview.jobId!==job.id||job.result.copyReview.sourceHash!==job.copySourceHash)throw Error('文案独立审校尚未通过。');
  p.copyFlow.draftText=job.result.manuscript;p.copyFlow.proposalJobId=job.id;p.copyFlow.changes=job.result.copyOptimization.changes;p.copyFlow.reviewSummary=job.result.copyReview.summary;p._cloudDirty=true;p._editVersion=(p._editVersion||0)+1;await cloud().save(p);job.clientState='copy-ready';if(project()?.id===p.id){render();await persist({skipCloud:true});toast('文案已优化并通过审校，请查看并确认。');}
 }
 async function confirm(){
  const p=project();if(busy())throw Error('请等待当前任务完成。');S.copySubmitting=true;sync();
  try{scheduleSave();await cloud().save(p);if(p._cloudDirty)throw Error('文案正在保存，请稍后确认。');const result=await cloud().request('projects/'+p.id+'/confirm-copy',{method:'POST',body:JSON.stringify({revision:p.cloudRevision,jobId:p.copyFlow.proposalJobId,text:p.copyFlow.draftText})});Object.assign(p,result.project,{_cloudDirty:false});S.pageId=p.pages[0].id;await persist({skipCloud:true});render();toast('文案已确认，现在可以配置图片与预案。');}finally{S.copySubmitting=false;sync();cloud().updateBadge();}
 }
 async function design(){
  const p=project(),mode=projectImageMode(p);if(mode==='upload'&&!p.assets.some(asset=>asset.source==='upload'))throw Error('预案一需要至少上传一张图片。');if(busy())throw Error('请等待当前任务完成。');
  S.copySubmitting=true;sync();
  try{p.copyFlow.phase='design';touch(p);await cloud().save(p);if(p._cloudDirty)throw Error('配置正在保存，请稍后再试。');if(project()?.id!==p.id)throw Error('当前项目已切换，请回到原项目开始设计。');await persist({skipCloud:true});if(project()?.id!==p.id)throw Error('当前项目已切换，请回到原项目开始设计。');S.pageId=p.pages[0].id;render();await cloud().startDesign();}
  catch(error){p.copyFlow.phase='assets';touch(p);await cloud().save(p).catch(()=>{});render();throw error;}
  finally{S.copySubmitting=false;sync();cloud().updateBadge();}
 }
 async function submit(event){event.preventDefault();const control=event.submitter;if(control)control.disabled=true;try{if(event.target.id==='copy-source-form')await start();else if(event.target.id==='copy-confirm-form')await confirm();else if(event.target.id==='copy-assets-form')await design();}catch(error){toast(error.message);sync();if(control?.isConnected)control.disabled=false;}}
 function input(event){const p=project(),el=event.target;if(!isPreparing(p))return false;if(el.id==='copy-source'){p.copyFlow.sourceText=el.value;p.copyFlow.proposalJobId=null;p.copyFlow.confirmation=null;scheduleSave();sync();return true;}if(el.id==='copy-draft'){p.copyFlow.draftText=el.value;scheduleSave();sync();return true;}if(el.id==='new-brief'){p.brief=el.value;scheduleSave();return true;}return false;}
 async function images(files){const p=project();if(p?.copyFlow?.phase!=='assets')return;const entries=await readImageFiles(files);if(p.copyFlow.phase!=='assets'||!S.projects.includes(p))throw Error('图片未添加，请先返回配图步骤。');if(p.assets.length+entries.length>8)throw Error('本项目最多上传八张图片。');p.assets.push(...entries);touch(p);await cloud().save(p);await persist({skipCloud:true});render();}
 function changed(event){const p=project(),el=event.target;if(p?.copyFlow?.phase!=='assets')return false;if(el.name==='style-preset'){p.stylePresetId=validateStylePresetId(el.value);p.allowWebImages=webImagesForMode(projectImageMode(p),p.allowWebImages);showSelectedPreset();scheduleSave();return true;}if(el.id==='new-web-images'){p.allowWebImages=el.checked;scheduleSave();return true;}if(el.id==='new-photos'){const files=[...el.files];el.value='';images(files).catch(error=>toast(error.message));return true;}return false;}
 const actions={
  'copy-back':async()=>{if(busy())throw Error('请先等待当前任务完成。');project().copyFlow.phase='copy';project().copyFlow.confirmation=null;scheduleSave();await persist();render();},
  'copy-stop':async()=>{const job=latest(project());if(active(job)){Object.assign(job,(await cloud().request('jobs/'+job.id+'/cancel',{method:'POST',body:'{}'})).job);sync();cloud().updateBadge();}},
  'copy-record':()=>cloud().showTasks(),
  'copy-remove-photo':control=>{project().assets=project().assets.filter(asset=>asset.id!==control.dataset.id);scheduleSave();render();}
 };
 function open(job){const p=S.projects.find(item=>item.id===job.projectId);if(!p)return toast('原项目已删除。');S.activeId=p.id;S.pageId=p.pages[0].id;closeModal();render();persist({skipCloud:true});if(p.copyFlow?.phase==='design')toast('此文案已确认，可在右侧继续编辑。');}
 return {isPreparing,newDraft,view,afterRender,sync,receive,submit,input,changed,open,actions};
}
