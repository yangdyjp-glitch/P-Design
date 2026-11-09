import {clone,uid,escape as esc,parseManuscript,sanitizeHTML,sanitizeCSS} from './engine.js';
import {manuscriptPaginationMode,projectPaginationMode} from './pagination-policy.js';
import {canApplyAutomatic,hasAuditErrors,automaticMessage,designProposal,jobApplied} from './ai-workflow.js';
import {jobProgress} from './job-progress.js';
import {lastPageRevision} from './page-revision.js';
const active=s=>['queued','starting','running','generating'].includes(s);
const labels={queued:'等待开始',starting:'准备设计',running:'AI 设计与自检中',generating:'AI 制作视觉素材',completed:'已完成',failed:'未完成',cancelled:'已停止'};
const kinds={design:'AI 自动设计',revise:'AI 自动调整',cover:'封面设计',polish:'排版复核',reference:'参考分析',write:'文案创作',image:'视觉素材',template:'主题制图'};
export function createCloud({S,project,current,modal,closeModal,toast,render,remember,persist,button,baseCSS,auditProposal,onAuthLost}){
 let saveChain=Promise.resolve(),pollTimer,modalJobId=null,polling=false,submitting=false,submission=null,owner=null,disposed=false,initialProjects=null;
 const removingProjects=new Set(),deletedProjects=new Set(),removals=new Map();
 const requests=new AbortController();
 const api=async(path,opts={})=>{
  if(disposed)throw Error('登录状态已变化，请重新打开工作台。');
  const r=await fetch('/api/'+path,{...opts,signal:requests.signal,cache:'no-store',headers:{...(opts.body instanceof Blob?{}:{'Content-Type':'application/json'}),...(opts.headers||{}),...(owner?{'X-Tuxu-Account':owner}:{})}});
  let value;try{value=await r.json();}catch{throw Error('服务暂时不可用，请稍后重试。');}
  if(!r.ok){const error=Error(value.error||'请求未完成。');error.status=r.status;if(['AUTH_REQUIRED','AUTH_CHANGED'].includes(value.code))onAuthLost?.();throw error;}if(disposed)throw Error('登录状态已变化，请重新打开工作台。');return value;
 };
 function signin(){modal('工作空间暂时未就绪','<p class="small-note">'+esc(S.session?.serviceError||'请先连接工作空间，再使用 AI。')+'</p>');}
 async function init(){S.jobs=[];initialProjects=null;try{const data=await api('workspace');if(disposed)return;S.session=data.session;owner=S.session.accessMode==='accounts'?S.session.user?.id:null;S.jobs=data.jobs;initialProjects=data.projects;}catch(error){S.session={user:null,serviceError:error.message,capabilities:{cloud:false,ai:false,skills:[]}};}return S.session;}
 async function pull(){if(!S.session?.user)return [];if(initialProjects!==null){const projects=initialProjects;initialProjects=null;return projects;}return (await api('projects')).projects;}
 async function details(j){if(j.detailsLoaded===false){Object.assign(j,(await api('jobs/'+j.id)).job);j.detailsLoaded=true;}return j;}
 async function uploadAsset(p,a){
  if(a.url===`/api/files/${a.id}`)return;
  const source=a.url.startsWith('assets/photos/')?'/api/legacy-assets/'+a.url.split('/').pop():a.url;
  const response=await fetch(source);if(!response.ok)throw Error('素材加载失败：'+a.name);
  const blob=await response.blob(),asset=await api('assets?projectId='+encodeURIComponent(p.id)+'&id='+encodeURIComponent(a.id)+'&name='+encodeURIComponent(a.name),{method:'POST',body:blob,headers:{'Content-Type':blob.type}});
  Object.assign(a,asset);if(asset.source!=='web'){delete a.sourceUrl;delete a.imageUrl;}
 }
 async function saveNow(p){
  if(deletedProjects.has(p.id))return;
  if(!S.session?.user||p.cloudRevision&&!p._cloudDirty)return;
  if(p._syncConflict)throw Error('项目有其他窗口的新修改，请先备份再重新载入。');
  const stamp=p._editVersion||0;for(const a of p.assets)await uploadAsset(p,a);
  const snapshot=clone(p);for(const key of ['cloudRevision','_cloudDirty','_editVersion','_syncConflict','_aiState'])delete snapshot[key];snapshot.history=[];snapshot.redo=[];
  try{
   const saved=await api('projects/'+p.id,{method:'PUT',body:JSON.stringify({project:snapshot,revision:p.cloudRevision||0})});
   p.cloudRevision=saved.revision;p._cloudDirty=(p._editVersion||0)!==stamp;p._lastSyncedAt=Date.now();
   const label=document.querySelector('#save-status');if(label&&project()?.id===p.id)label.textContent=p._cloudDirty?'正在保存新修改…':'已保存到云端';
  }catch(error){if(error.status===409)p._syncConflict=true;throw error;}
 }
 async function save(p){saveChain=saveChain.catch(()=>{}).then(()=>saveNow(p));return saveChain;}
 async function remove(p){
  if(removals.has(p.id))return removals.get(p.id);
  removingProjects.add(p.id);
  const operation=saveChain.catch(()=>{}).then(async()=>{
   if(S.session?.user)try{await api('projects/'+p.id,{method:'DELETE'});}catch(error){if(error.status!==404)throw error;}
   deletedProjects.add(p.id);
   for(const job of S.jobs||[])if(job.projectId===p.id){if(active(job.status))job.status='cancelled';job.clientState='orphaned';}
  });
  removals.set(p.id,operation);saveChain=operation.catch(()=>{});
  try{return await operation;}finally{removingProjects.delete(p.id);removals.delete(p.id);updateBadge();}
 }
 function updateBadge(){
  const busy=submitting||S.checkingAI||(S.jobs||[]).some(j=>active(j.status));
  const working=submission||S.jobs?.find(job=>['checking','saving'].includes(job.clientState))||S.jobs?.find(job=>active(job.status));
  const target=working&&S.projects.find(item=>item.id===working.projectId),progress=jobProgress(working,target);
  const badge=document.querySelector('[data-action="ai-tasks"] span');if(badge)badge.textContent=busy&&progress?'设计记录 · '+progress.shortAction:'设计记录';
  const currentProject=project(),page=current(),notes=page?.requirements?.trim()||'',latest=S.jobs?.find(j=>j.projectId===currentProject?.id&&(j.scope!=='page'||j.pageIds?.includes(page?.id)));
  const local=lastPageRevision(S.jobs,currentProject?.id,page?.id);
  const otherProject=working&&working.projectId!==currentProject?.id,otherPage=working&&(otherProject||working.scope==='page'&&!working.pageIds?.includes(page?.id));
  const state=document.querySelector('#automatic-state');if(state)state.textContent=busy&&progress?(otherProject?'「'+(target?.name||'其他项目')+'」'+progress.message:progress.message)+(otherPage?' 完成后可发送本图要求。':''):!busy&&notes&&notes!==local?.request?'本图要求已保存，点击发送后开始修改。':latest?automaticMessage(latest,currentProject):'补充本图的调整要求后发送，AI 只修改这张图。';
  const feedback=document.querySelector('#page-revision-feedback');if(feedback){
   feedback.hidden=!local;
   if(local){const job=local.job,review=job.result?.revisionReview,status=jobApplied(job,currentProject)?review?.outcome==='already_satisfied'?'原图已满足，本次未改动':'已应用到本图':labels[job.status]||'已记录';
    const html='<summary>上次本图修改 · '+esc(status)+'</summary><div class="page-revision-content"><p><b>发送的要求</b>'+esc(local.request)+'</p>'+(job.error?'<p class="revision-error">'+esc(job.error)+'</p>':review?review.checks.map(check=>'<p><b>'+esc(check.requirement)+'</b>'+esc(check.change)+'<span>'+esc(check.evidence)+'</span></p>').join(''):job.result?.summary?'<p><b>实际改动</b>'+esc(job.result.summary)+'</p>':'<p>正在按本图要求处理，完成后显示改动说明。</p>')+'</div>';
    if(feedback._content!==html){feedback.innerHTML=html;feedback._content=html;}
   }
  }
  for(const control of document.querySelectorAll('[data-action="ai-design"],#design-submit'))control.disabled=!!busy||!S.session?.capabilities.ai;
  for(const control of document.querySelectorAll('[data-action="delete-project"],[data-action="confirm-delete-project"]'))control.disabled=!!S.busy||submitting||!!S.checkingAI;
  const send=document.querySelector('[data-action="ai-page"]');if(send){send.disabled=!!busy||!S.session?.capabilities.ai||!notes;send.querySelector('span').textContent=busy&&progress?(otherProject?'其他项目 · '+progress.action:progress.label):'发送并修改本图';send.setAttribute('aria-busy',String(!!busy));if(busy&&progress)send.title=progress.message;else send.removeAttribute('title');}
 }
 function setState(p,j,state,message){p._aiState={jobId:j.id,state,message};updateBadge();}
 async function startDesign(prefill='',options={}){
  if(!S.session?.user)return signin();
  if(!S.session.capabilities.ai)return toast('AI 服务尚未开启，请稍后再试。');
  if(submitting||(S.jobs||[]).some(j=>active(j.status)))return toast('AI 正在完成当前设计，请稍候。');
  const p=project(),page=current(),pageOnly=options.scope==='page';
  if(!p||!page||!p.pages.some(pg=>pg.copy.some(c=>c.text.trim())))return toast('先在右侧添加文案。');
  const pageIds=pageOnly?[page.id]:p.pages.map(pg=>pg.id),notes=pageOnly?String(page.requirements||'').trim():'';
  if(pageOnly&&!notes)return toast('先填写本图要调整的内容。');
  submitting=true;submission={projectId:p.id,kind:pageOnly?'revise':'design',scope:pageOnly?'page':'project',pageIds,submissionStage:'saving'};updateBadge();
  try{
   await save(p);await persist({skipCloud:true});
   if(p._cloudDirty)throw Error('内容有新修改，请等待保存后再次发送。');
   if(pageOnly&&!p.pages.some(target=>target.id===page.id&&String(target.requirements||'').trim()===notes))throw Error('本图要求已更新，请再次发送。');
   const prompt=pageOnly?notes:String(prefill||p.brief||'').trim()||(projectPaginationMode(p)==='fixed'?'保留原有页数、页面顺序和每页全部文案，让图片适配页面，不能为了放图自行增页。完成整套设计和自动检查。':'根据全部未分页文案与本项目素材，自行判断最合适的小红书画面、分页与视觉语言，完成整套设计和自动检查。');
   submission.submissionStage='sending';updateBadge();
   const {job}=await api('jobs',{method:'POST',body:JSON.stringify({projectId:p.id,revision:p.cloudRevision,kind:pageOnly?'revise':'design',workflow:'automatic',scope:pageOnly?'page':'project',prompt,pageIds,baseCSS:baseCSS(),requestId:uid()})});
   S.jobs.unshift(job);closeModal();setState(p,job,'running',pageOnly?'AI 正在修改本图并自动检查，其他图保持不变。':'AI 正在判断视觉方案、制作画面并自动检查。');startPolling();toast(pageOnly?'已发送，只修改当前图，完成检查后自动呈现。':'已交给 AI，完成检查后会自动呈现。');
  }catch(error){toast(error.message);}finally{submitting=false;submission=null;updateBadge();}
 }
 function proposal(j){
  const p=S.projects.find(p=>p.id===j.projectId);if(!p)throw Error('原项目已删除，可从交付文件查看结果。');
  const draft=designProposal(j,p);for(const page of draft.pages.filter(page=>j.result.pages.some(result=>result.id===page.id))){page.html=sanitizeHTML(page.html);page.css=sanitizeCSS(page.css);}return draft;
 }
 async function reviewAutomatic(j){
  if(S.busy)return;
  const p=S.projects.find(p=>p.id===j.projectId);
  if(!p||deletedProjects.has(j.projectId)){j.clientState='orphaned';return;}
  if(removingProjects.has(j.projectId))return;
  if(jobApplied(j,p)){j.clientState='applied';return;}
  if(S.jobs.some(other=>other.projectId===j.projectId&&other.createdAt>j.createdAt&&(active(other.status)||other.status==='completed'))){j.clientState='superseded';return;}
  if(S.jobs.some(child=>child.repairOf===j.id)){j.clientState='superseded';return;}
  if(!canApplyAutomatic(j,p)){j.clientState='held';setState(p,j,'held','文案或素材已有新修改，原方案已保留。点击 AI 重新设计即可。');return;}
  j.clientState='checking';S.checkingAI=true;setState(p,j,'checking','AI 已完成渲染自检，正在自动核对网页中的实际画面。');
  try{
   await details(j);const draft=proposal(j),reports=await auditProposal(draft,j.scope==='page'?j.pageIds:undefined,progress=>{j.clientProgress=progress;updateBadge();if(modalJobId===j.id)paintResult(j);},j.scope==='page'?[]:j.requiredUploadIds||[]);
   if(removingProjects.has(p.id)||deletedProjects.has(p.id)){delete j.clientState;return;}
   if(!canApplyAutomatic(j,p)){j.clientState='held';setState(p,j,'held','检查期间文案已有新修改，已保留你的最新内容。');return;}
   if(S.busy){delete j.clientState;return;}
   if(hasAuditErrors(reports)){
    if(!j.repairOf&&!j.result.repairAttempts){
     const checks=reports.flatMap(page=>page.issues.filter(issue=>issue.severity==='error').map(issue=>({pageId:page.id,message:issue.message}))).slice(0,20);
     const {job}=await api('jobs',{method:'POST',body:JSON.stringify({projectId:p.id,revision:p.cloudRevision,kind:j.kind,workflow:'automatic',scope:j.scope||'project',prompt:'根据实际网页检查修正当前方案。',pageIds:j.scope==='page'?j.pageIds:p.pages.map(pg=>pg.id),baseCSS:baseCSS(),requestId:uid(),repairOf:j.id,checks})});
     if(!S.jobs.some(item=>item.id===job.id))S.jobs.unshift(job);j.clientState='superseded';setState(p,job,'correcting','发现画面问题，AI 正在自动修正这一轮方案。');return;
    }
    j.clientState='check-failed';setState(p,j,'failed','本轮自动修正后仍有画面问题，文案已保留，可重新设计。');return;
   }
   j.clientState='saving';setState(p,j,'saving','检查已通过，正在保存画面。');
   const history={id:uid(),at:Date.now(),label:j.scope==='page'?'AI 单图修改与检查':'AI 自动设计与检查',pages:clone(p.pages)};p.history??=[];p.history.push(history);if(p.history.length>25)p.history.shift();p.redo=[];
   p.pages=draft.pages;p.assets=draft.assets;p.lastAIJobId=j.id;for(const changed of j.result.pages){const target=p.pages.find(page=>page.id===changed.id);if(target)target.lastAIJobId=j.id;}p.aiCheck={jobId:j.id,status:'passed',scope:j.scope||'project',pageIds:j.result.pages.map(page=>page.id),pageCount:reports.length,checkedAt:Date.now()};p._cloudDirty=true;p._editVersion=(p._editVersion||0)+1;
   if(project()?.id===p.id){if(j.scope!=='page'||!p.pages.some(page=>page.id===S.pageId))S.pageId=p.pages[0].id;S.audit=reports;render();}
   await save(p);if(removingProjects.has(p.id)||deletedProjects.has(p.id)){delete j.clientState;return;}j.clientState='applied';delete j.clientProgress;setState(p,j,'passed',j.scope==='page'?(j.result.revisionReview?.outcome==='already_satisfied'?'本图原本已满足本次要求，画面未改动。':'本图已更新并通过自动检查，其他图保持不变。'):'设计已呈现，AI 渲染检查与网页检查均已通过。');await persist({skipCloud:true});toast('AI 已完成设计和自动检查，可以查看或下载作品。');
  }catch(error){const saving=j.clientState==='saving';j.clientState=saving?'save-failed':'check-failed';setState(p,j,'failed',saving?'画面检查已通过，但云端保存暂未完成，可先备份当前项目。':'自动检查暂未完成，方案与文案已保留。');if(saving)await persist({skipCloud:true});toast(error.message);}
  finally{S.checkingAI=false;updateBadge();}
 }
 function startPolling(){if(disposed)return;clearTimeout(pollTimer);pollTimer=setTimeout(poll,1200);}
 async function poll(){
  if(polling||disposed)return;polling=true;
  try{
   for(const j of (S.jobs||[]).filter(j=>active(j.status))){if(removingProjects.has(j.projectId)||deletedProjects.has(j.projectId))continue;try{j.startingRequest=j.status==='queued';updateBadge();const next=(await api('jobs/'+j.id+'/advance',{method:'POST',body:'{}'})).job;if(!deletedProjects.has(j.projectId))Object.assign(j,next);updateBadge();}catch(error){if(error.status!==409&&!deletedProjects.has(j.projectId))throw error;}finally{delete j.startingRequest;updateBadge();}}
   for(const j of (S.jobs||[]).filter(j=>j.automatic&&j.status==='completed'&&!j.clientState))await reviewAutomatic(j);
   if(document.querySelector('[data-ai-list]'))paintTasks();if(modalJobId){const j=S.jobs.find(j=>j.id===modalJobId);if(j)paintResult(j);}updateBadge();
  }catch(error){const state=document.querySelector('#automatic-state');if(state)state.textContent='服务暂时繁忙，任务已保留，稍后自动继续。';}
  finally{polling=false;if(!disposed&&S.jobs?.some(j=>active(j.status)||j.automatic&&j.status==='completed'&&!j.clientState))pollTimer=setTimeout(poll,8000);}
 }
 function showTasks(){if(!S.session?.user)return signin();modalJobId=null;modal('设计记录','<div data-ai-list></div><p class="small-note">AI 自行选择方案并执行检查。处理期间保持网页打开，回来后也可继续。</p>');paintTasks();}
 function paintTasks(){
  const el=document.querySelector('[data-ai-list]');if(!el)return;
  el.innerHTML=S.jobs?.length?S.jobs.map(j=>{const progress=jobProgress(j,S.projects.find(p=>p.id===j.projectId));return '<button class="job-card" data-job-view="'+j.id+'"><div class="between"><b>'+esc(j.scope==='page'?'单图修改':kinds[j.kind]||j.kind)+'</b><span class="job-status '+(progress?'running':j.status)+'">'+esc(progress?.label||(j.clientState==='applied'?'已呈现 · 检查通过':labels[j.status]))+'</span></div><p>'+esc(j.result?.summary||j.prompt.slice(0,100))+'</p><small>'+new Date(j.createdAt).toLocaleString('zh-CN')+' · '+(j.status==='completed'?'实际使用 '+(j.result?.usedSkills?.length||0)+' 个技能':'AI 可从 '+j.skillIds.length+' 个技能中择用')+'</small></button>';}).join(''):'<div class="empty">还没有设计记录。准备文案后，交给 AI 开始。</div>';
  el.querySelectorAll('[data-job-view]').forEach(b=>b.onclick=()=>showResult(S.jobs.find(j=>j.id===b.dataset.jobView)));
 }
 async function showResult(j){modalJobId=j.id;modal('AI 设计结果','<div id="ai-result"><p class="small-note">正在载入这次设计…</p></div>');try{await details(j);if(modalJobId===j.id)paintResult(j);}catch(error){toast(error.message);}}
 function paintResult(j){
  const el=document.querySelector('#ai-result');if(!el)return;const r=j.result,progress=jobProgress(j,S.projects.find(p=>p.id===j.projectId));
  const skillNames=(r?.usedSkills||[]).map(id=>S.session.capabilities.skills.find(s=>s.id===id)?.name||id).join('、');
  el.innerHTML='<div class="between"><b>'+esc(j.scope==='page'?'单图修改':kinds[j.kind]||j.kind)+'</b><span class="job-status '+(progress?'running':j.status)+'">'+esc(progress?.label||labels[j.status])+'</span></div>'+(progress?'<div class="ai-running" role="status"><span class="loading-ring"></span> '+esc(progress.message)+'</div>'+(active(j.status)?button('cancel-ai','停止本轮',null,'btn small'):''):j.error?'<p class="ai-error">'+esc(j.error)+'</p>':r?'<h3>'+esc(r.summary)+'</h3>'+(j.automatic?'<p class="preserve-note">'+esc(automaticMessage(j,S.projects.find(p=>p.id===j.projectId)))+'</p>':'')+'<div class="panel-actions">'+(r.pages?.length?button('preview-ai','查看方案','eye','btn')+(!j.automatic?button('apply-ai','应用这一版','check','btn primary'):''):'')+(r.manuscript?button('apply-ai-copy','用草稿创建项目',null,'btn primary'):'')+'</div><details class="ai-details"><summary>设计与检查说明</summary><div class="ai-report">'+esc(r.report)+'</div><div class="ai-used">实际使用：'+esc(skillNames)+'</div>'+(r.sources?.length?'<div class="ai-sources">'+r.sources.map(s=>'<a target="_blank" rel="noopener noreferrer" href="'+esc(s.url)+'">'+esc(s.title)+'</a>').join('')+'</div>':'')+'</details>'+(r.artifacts?.length?'<div class="ai-artifacts">'+r.artifacts.map(a=>'<a class="btn small" href="'+esc(a.url)+'" download>'+esc(a.name)+'</a>').join('')+'</div>':''):'');
  el.querySelector('[data-action="cancel-ai"]')?.addEventListener('click',async()=>{try{Object.assign(j,(await api('jobs/'+j.id+'/cancel',{method:'POST',body:'{}'})).job);paintResult(j);updateBadge();}catch(error){toast(error.message);}});
  el.querySelector('[data-action="preview-ai"]')?.addEventListener('click',()=>preview(j).catch(error=>toast(error.message)));
  for(const kind of ['apply-ai','apply-ai-copy'])el.querySelector('[data-action="'+kind+'"]')?.addEventListener('click',()=>applyLegacy(j,kind).catch(error=>toast(error.message)));
 }
 async function preview(j){
  const {frameDocument}=await import('./engine.js'),draft=proposal(j);if(j.scope==='page')draft.pages=draft.pages.filter(page=>j.pageIds.includes(page.id));modalJobId=null;
  modal('AI 方案预览','<div class="ai-preview-grid">'+draft.pages.map(pg=>'<div class="overview-frame"><iframe title="AI 排版提案" data-proposal="'+pg.id+'"></iframe></div>').join('')+'</div>',button('return-ai-result','返回设计结果',null,'btn'),true);
  for(const pg of draft.pages){const frame=document.querySelector('[data-proposal="'+pg.id+'"]');if(frame)frame.srcdoc=frameDocument(pg,draft,baseCSS(),{preview:true});}
  document.querySelector('[data-action="return-ai-result"]').onclick=()=>showResult(j);
 }
 async function applyLegacy(j,kind){
  if(kind==='apply-ai-copy'){const p={id:uid(),name:('AI 草稿 · '+j.prompt).slice(0,100),paginationMode:manuscriptPaginationMode(j.result.manuscript),pages:parseManuscript(j.result.manuscript),assets:[],history:[],redo:[],createdAt:Date.now(),updatedAt:Date.now()};S.projects.unshift(p);S.activeId=p.id;S.pageId=p.pages[0].id;}
  else{const p=project();if(!canApplyAutomatic(j,p))throw Error('文案已有新修改，请重新设计。');const draft=proposal(j),reports=await auditProposal(draft,j.result.pages.map(page=>page.id));if(hasAuditErrors(reports))throw Error('方案未通过画面或上传图片裁剪检查，请重新设计。');if(!canApplyAutomatic(j,p))throw Error('检查期间内容已有新修改，请重新设计。');remember('应用 AI 排版');p.pages=draft.pages;p.assets=draft.assets;}
  S.audit=null;project()._cloudDirty=true;project()._editVersion=(project()._editVersion||0)+1;persist();closeModal();modalJobId=null;render();
 }
 function showSkills(){const list=S.session?.capabilities.skills||[];modal('AI 可用的设计能力','<p class="small-note">AI 从 '+list.length+' 个完整技能中自行择用，无需手动配置。</p><div class="skills-grid">'+list.map(s=>'<div class="skill-tile"><b>'+esc(s.name)+'</b><p>'+esc(s.description)+'</p></div>').join('')+'</div>','',true);}
 function showAccount(){
  if(!S.session?.user)return signin();const visitor=S.session.accessMode==='visitor';
  modal(visitor?'当前访客空间':'我的工作空间','<div class="settings-item"><b>'+esc(S.session.user.name||'工作空间')+'</b><p>文案、素材和作品属于当前空间。换浏览器或电脑前，请下载项目备份。</p>'+(visitor&&!S.session.capabilities.storagePersistent?'<p>当前服务器未配置持久存储，重新部署前请下载项目和交付文件。</p>':'')+'</div><div class="settings-item"><b>AI 服务</b><p>'+S.session.capabilities.skills.filter(s=>s.ready).length+' 个设计技能已就绪，由 AI 按内容自行选择。每人每天最多 10 个任务，自动修正同样计入额度。</p></div>');
 }
 return {init,pull,save,remove,startDesign,startPageDesign:()=>startDesign('',{scope:'page'}),showAI:startDesign,showTasks,showSkills,showAccount,startPolling,updateBadge,request:api,dispose(){disposed=true;initialProjects=null;clearTimeout(pollTimer);requests.abort();}};
}
