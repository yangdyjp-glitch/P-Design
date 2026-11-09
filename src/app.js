
import {toBlob} from "html-to-image";
import JSZip from "jszip";
import {createCloud} from "./cloud.js";
import {createAccounts} from "./accounts.js";
import {STYLE_PRESETS,resolveStylePreset,validateStylePresetId} from "./style-presets.js";
import {projectImageMode,webImagesForMode} from "./preset-images.js";
import {uid,clean,escape as esc,clone,LAYOUTS,PALETTES,parseManuscript,pageMarkup,frameDocument,applyFontScale,auditPage,routeSkills,quickAdjustment,validateProject,clamp} from "./engine.js";
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const S={projects:[],activeId:null,pageId:null,tab:"copy",selectedCopy:null,baseCSS:"",db:null,zoom:1,editing:null,audit:null,busy:false};
let saveTimer,previewTimer,toastTimer;
const paths={
 grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
 plus:'<path d="M12 5v14M5 12h14"/>', image:'<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8" cy="9" r="1.5"/><path d="m3 17 5-5 4 4 4-6 5 6"/>',
 palette:'<circle cx="8" cy="8" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="18" cy="12" r="1"/><path d="M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1.6-3.2c-.5-.7 0-1.8.9-1.8H18c2 0 3-1 3-3 0-5-4-10-9-10Z"/>',
 history:'<path d="M3 11a9 9 0 1 1 2.6 7M3 4v7h7M12 7v5l3 2"/>', folder:'<path d="M3 7V5h6l2 2h10v13H3z"/>',
 chevron:'<path d="m9 5 7 7-7 7"/>', down:'<path d="m6 9 6 6 6-6"/>', up:'<path d="m6 15 6-6 6 6"/>',
 download:'<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/>',upload:'<path d="M12 16V4m-4 4 4-4 4 4M4 16v5h16v-5"/>',
 undo:'<path d="m8 4-5 5 5 5M3 9h11a6 6 0 0 1 0 12"/>',redo:'<path d="m16 4 5 5-5 5M21 9H10a6 6 0 0 0 0 12"/>',
 check:'<path d="m5 12 4 4L19 6"/>', checkcircle:'<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
 close:'<path d="m6 6 12 12M6 18 18 6"/>',dots:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
 eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
 arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',settings:'<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2" fill="white"/><circle cx="16" cy="12" r="2" fill="white"/><circle cx="10" cy="18" r="2" fill="white"/>',
 lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',
 type:'<path d="M4 5h16M12 5v15M8 20h8"/>',phone:'<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M10 18h4"/>',
 expand:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
 leaf:'<path d="M19 3C7 3 3 8 5 15c7 3 15-1 14-12ZM4 21l9-10"/>',
 trash:'<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>',
 copy:'<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
 alert:'<path d="m12 3 10 18H2L12 3ZM12 9v5m0 3h.01"/>',
 save:'<path d="M4 3h13l4 4v14H3V3h1ZM7 3v6h10V3M7 21v-8h10v8"/>'
};
const icon=(name)=>'<svg viewBox="0 0 24 24" aria-hidden="true">'+(paths[name]||paths.grid)+'</svg>';
const button=(action,label,name,cls="btn",attrs="")=>'<button type="button" class="'+cls+'" data-action="'+action+'" '+attrs+'>'+ (name?icon(name):"")+'<span>'+label+'</span></button>';
const formatDate=t=>new Intl.DateTimeFormat("zh-CN",{month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false,timeZone:"Asia/Shanghai"}).format(t);
const project=()=>S.projects.find(p=>p.id===S.activeId);
function current(){const p=project();return p?.pages.find(x=>x.id===S.pageId)||p?.pages[0];}
function toast(t){const el=$("#toast");el.textContent=t;el.classList.add("visible");clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove("visible"),4300);}
function openDB(){return new Promise((resolve,reject)=>{const r=indexedDB.open("tuxu-studio-"+(S.session?.user?.id||"guest"),1);r.onupgradeneeded=()=>r.result.createObjectStore("workspace");r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
function dbRead(){return new Promise((resolve,reject)=>{const r=S.db.transaction("workspace").objectStore("workspace").get("state");r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
function cacheWorkspace(){return new Promise((resolve,reject)=>{const t=S.db.transaction("workspace","readwrite");t.objectStore("workspace").put({projects:S.projects,activeId:S.activeId},"state");t.oncomplete=resolve;t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error);});}
async function persist({skipCloud=false}={}){
 if(S.authLocked||S.session?.accessMode==='accounts'&&!S.session.user)return;
 clearTimeout(saveTimer);
 const p=project();if(p)p.updatedAt=Date.now();
 const label=$("#save-status");if(label)label.textContent="正在保存…";
 try{
  if(!S.db)throw Error("浏览器存储不可用");
  await cacheWorkspace();
  if(label)label.textContent=S.session?.user?(skipCloud?(p?._cloudDirty?"已保存到本机":"已保存到云端"):"正在同步云端…"):"已保存到此浏览器";
  if(!skipCloud&&p&&S.session?.user){try{await Cloud.save(p);if(!S.authLocked&&S.db)await cacheWorkspace();}catch(e){if(label)label.textContent="本机已保存 · 云端待同步";toast(e.message);}}
 }catch(e){if(label)label.textContent="尚未保存 · 请备份项目";toast("浏览器存储不足或不可用，请下载项目备份以免丢失。");}
}
function scheduleSave(){if(S.authLocked)return;const p=project();if(p){p._cloudDirty=true;p._editVersion=(p._editVersion||0)+1;}clearTimeout(saveTimer);const el=$("#save-status");if(el)el.textContent="正在保存…";saveTimer=setTimeout(persist,450);}
function remember(label){
 const p=project();p.history??=[];p.redo=[];p.history.push({id:uid(),at:Date.now(),label,pages:clone(p.pages)});if(p.history.length>25)p.history.shift();
 const undo=$('[data-action="undo"]'),redo=$('[data-action="redo"]');if(undo)undo.disabled=false;if(redo)redo.disabled=true;
}
function edit(label,fn,{full=true}={}){remember(label);fn();S.audit=null;scheduleSave();if(full)render();else{updatePreview();renderInspector();}}
function activePageIndex(){return project().pages.findIndex(p=>p.id===current().id);}
function markup(p,interactive=false){return frameDocument(p,project(),S.baseCSS,{interactive});}
function render(){
 if(S.authLocked)return;
 const p=project(),page=current(),visitor=S.session?.accessMode==='visitor';if(!p||!page)return;
 S.pageId=page.id;
 $("#app").innerHTML='<div class="shell">'+
 '<aside class="sidebar"><div class="brand"><img src="icon.svg" alt=""><div><b>图序</b><small>DESIGN STUDIO</small></div></div>'+
 button("new","新建图文","plus","btn primary full")+
 '<div class="nav-heading">工作空间</div>'+
 button("workspace","设计工作台","grid","nav-item active")+button("assets","项目素材","image","nav-item")+button("ai-tasks","设计记录","history","nav-item")+
 '<div class="nav-heading between"><span>我的项目</span><button class="icon-btn" aria-label="导入项目" data-action="import-project">'+icon("plus")+'</button></div><div class="project-list">'+
 S.projects.map(pr=>'<button class="project-item '+(pr.id===p.id?"active":"")+'" data-action="switch-project" data-id="'+esc(pr.id)+'"><i></i><span>'+esc(pr.name)+'</span></button>').join("")+'</div>'+
 '<div class="sidebar-bottom"><div class="storage-card"><div class="row">'+icon("leaf")+'<b style="font-size:11px">留住每一次好设计</b></div><p>'+(visitor?'无需登录即可使用 AI。换设备前下载备份，带走可编辑作品。':'登录后项目自动同步到云端。下载备份，也能带走可编辑作品。')+'</p>'+button("backup","备份当前项目","download","btn small full")+'</div><div class="sidebar-footer"><span>图序工作台 · AI 版</span><button data-action="settings" aria-label="工作台说明">'+icon("settings")+'</button></div></div></aside>'+
 '<div class="workspace"><header class="topbar"><div class="breadcrumbs"><span class="mobile-title">图序</span><span>工作空间</span><span>/</span><b>小红书图文</b></div><div class="top-actions">'+button("mobile-menu","菜单","grid","btn small mobile-menu-button")+'<span class="save-label"><i class="dot"></i><span id="save-status">'+(S.session?.user?(p._cloudDirty?"正在同步云端…":"已保存到云端"):"已保存到此浏览器")+'</span></span>'+button("account",visitor?"访客空间":S.session?.user?"我的账户":"登录云端","settings","btn flat small")+'</div></header>'+
 '<section class="project-header between"><div><div class="project-heading"><h1>'+esc(p.name)+'</h1><button class="icon-btn" aria-label="项目与版本" data-action="more">'+icon("down")+'</button><span class="pill">AI 自动设计</span></div><div class="project-description"><span id="page-total">'+p.pages.length+'</span> 个画面 · '+esc(resolveStylePreset(p.stylePresetId)?.name||'AI 自行判断分页与视觉')+' · 高清导出 2160 × 2880</div></div><div class="project-toolbar">'+
 button("overview","预览","eye","btn")+button("export","下载作品","download","btn")+button("ai-design","AI 设计整套","leaf","btn primary")+
 '</div></section><div class="stage-layout"><aside class="page-rail"><div class="rail-label"><span>画面</span><span>'+p.pages.length+'</span></div><div id="page-list">'+p.pages.map((pg,i)=>'<button class="page-item '+(pg.id===page.id?"active":"")+'" data-action="select-page" data-id="'+pg.id+'" title="'+esc(pg.label)+'"><span class="thumb"><iframe tabindex="-1" title="第'+(i+1)+'页缩略预览" data-thumb="'+pg.id+'"></iframe></span><span class="page-index">'+String(i+1).padStart(2,"0")+'</span></button>').join("")+'</div></aside>'+
 '<main class="canvas-workspace"><div class="canvas-bar"><div class="row"><span>画面 '+String(activePageIndex()+1).padStart(2,"0")+'</span><span style="color:#b7c0ac">/</span><span>'+esc(page.label.slice(0,18))+'</span></div><div class="row"><span>'+icon("lock")+' 原文保真排版</span></div></div><div class="canvas-area"><div class="canvas-holder"><iframe id="canvas-frame" title="当前页面可编辑预览"></iframe><div class="canvas-loading">正在呈现画面…</div></div></div><div class="view-hint">点击画面中的文字，可定位到右侧文案</div><div class="canvas-footer"><div class="zoom-control"><button data-action="zoom-out" aria-label="缩小">−</button><span id="zoom-label">适应</span><button data-action="zoom-in" aria-label="放大">＋</button><button data-action="fit" title="适应画布" aria-label="适应画布">'+icon("expand")+'</button></div>'+button("phone","手机预览","phone","btn small")+'</div></main>'+
 '<aside class="inspector"><div class="copy-panel-head"><b>文案</b><span>你负责内容，AI 负责画面</span></div><div class="inspector-body" id="inspector-body"></div><div class="assistant automatic-assistant"><label class="assistant-title" for="design-notes">本图补充要求 <span class="muted">第 '+String(activePageIndex()+1).padStart(2,"0")+' 张</span></label><textarea id="design-notes" rows="2" maxlength="5000" aria-label="给本图的补充要求" aria-describedby="page-notes-help" placeholder="例如：本图的照片完整显示，不要裁切。">'+esc(page.requirements||'')+'</textarea><p class="page-notes-help" id="page-notes-help">只修改当前这张图，其他图保持不变。</p>'+button("ai-page","发送并修改本图","arrow","btn primary full")+'<div class="automatic-state"><span class="ai-state-dot"></span><p id="automatic-state" aria-live="polite"></p></div><div class="assistant-footnote">AI 自动检查并呈现 · Ctrl + Enter 发送</div></div></aside></div></div></div>';
 for(const pg of p.pages){const fr=$('[data-thumb="'+pg.id+'"]');fr.srcdoc=markup(pg);fr.addEventListener("load",()=>fr.contentDocument?.fonts.ready.then(()=>applyFontScale(fr.contentDocument,pg.settings.fontScale||1)),{once:true});}
 renderInspector();updatePreview();fitCanvas();Cloud.updateBadge();
}
function renderInspector(){
 const pg=current(),p=project(),el=$("#inspector-body");if(!el)return;
 S.tab="copy";
 $$(".inspector-tabs button").forEach(b=>b.classList.toggle("active",b.dataset.tab===S.tab));
 if(S.tab==="copy"){
  el.innerHTML='<div class="between"><h2 class="section-title" style="margin-bottom:13px">页面文案</h2><span class="tiny muted">'+pg.copy.reduce((n,c)=>n+c.text.length,0)+' 字</span></div><div class="preserve-note">'+icon("lock")+' 自动排版不改字，手动编辑单独留痕。</div>'+
  pg.copy.map((c,i)=>'<label class="copy-field '+(i===0?"title-field ":"")+(S.selectedCopy===c.id?"selected":"")+'" data-field-id="'+esc(c.id)+'"><span class="field-heading"><span>'+ (i===0?"主标题":"内容 "+String(i).padStart(2,"0"))+'</span><span data-count="'+esc(c.id)+'">'+c.text.length+' 字</span></span><textarea data-copy-field="'+esc(c.id)+'" aria-label="'+(i===0?"主标题":"内容"+i)+'" rows="'+Math.min(7,Math.max(2,Math.ceil(c.text.length/20)))+'" spellcheck="false">'+esc(c.text)+'</textarea></label>').join("")+
  '<div class="inspector-divider"></div>'+button("add-copy","添加内容段落","plus","btn small full");
 }else if(S.tab==="visual"){
  const hasPhoto=!!pg.photoAssetId;
  el.innerHTML='<h2 class="section-title">构图方式</h2><div class="layout-options">'+Object.entries(LAYOUTS).map(([k,v],i)=>'<button class="layout-choice '+(pg.layout===k?"active":"")+'" data-action="layout" data-layout="'+k+'"><span>'+[18,27,13,23].map((h,j)=>'<i style="height:'+h+'px;width:'+(j===0?15:7)+'px"></i>').join("")+'</span>'+v+'</button>').join("")+'</div>'+
  '<p class="small-note">切换构图保留整页文字。导出前会检查内容是否放得下。</p><div class="inspector-divider"></div><h2 class="section-title">强调色</h2><div class="color-dots">'+PALETTES.map(c=>'<button class="color-dot '+(pg.settings.accent===c.color?"active":"")+'" style="background:'+c.color+'" title="'+c.name+'" aria-label="'+c.name+'" data-action="color" data-color="'+c.color+'"></button>').join("")+'<input type="color" id="custom-color" title="自定义强调色" aria-label="自定义强调色" value="'+pg.settings.accent+'"></div>'+
  '<div class="control-row"><span>文字大小</span><input type="range" min="75" max="130" value="'+Math.round(pg.settings.fontScale*100)+'" data-setting="fontScale" aria-label="文字大小"><span>'+Math.round(pg.settings.fontScale*100)+'%</span></div>'+
  button("all-color","将强调色应用到整套",null,"btn small full")+
  '<div class="inspector-divider"></div><div class="between"><h2 class="section-title" style="margin:0">照片素材</h2>'+button("upload","上传","plus","btn small")+'</div>'+
  (p.assets.length?'<div class="photo-grid">'+p.assets.map(a=>'<button class="photo-option '+(pg.photoAssetId===a.id?"active":"")+'" data-action="choose-photo" data-id="'+a.id+'" title="'+esc(a.name)+'"><img src="'+esc(a.url)+'" alt="'+esc(a.name)+'"></button>').join("")+'</div>':'<div class="empty">'+icon("image")+'<br>添加本次项目的真实照片</div>')+
  (hasPhoto?'<div class="control-row"><span>照片缩放</span><input type="range" min="100" max="200" value="'+pg.settings.photoZoom*100+'" data-setting="photoZoom" aria-label="照片缩放"><span>'+Math.round(pg.settings.photoZoom*100)+'%</span></div><div class="control-row"><span>水平裁切</span><input type="range" min="0" max="100" value="'+pg.settings.photoX+'" data-setting="photoX" aria-label="水平裁切"><span>'+pg.settings.photoX+'</span></div><div class="control-row"><span>垂直裁切</span><input type="range" min="0" max="100" value="'+pg.settings.photoY+'" data-setting="photoY" aria-label="垂直裁切"><span>'+pg.settings.photoY+'</span></div>':"")+
  '<div class="inspector-divider"></div><div class="panel-actions">'+button("move-up","前移","up","btn small",activePageIndex()===0?"disabled":"")+button("move-down","后移","down","btn small",activePageIndex()===p.pages.length-1?"disabled":"")+button("duplicate-page","复制页","copy","btn small")+'</div>'+button("delete-page","删除此页","trash","btn flat small delete-link",p.pages.length===1?"disabled":"");
 }else{
  const report=S.audit?.find(r=>r.id===pg.id);
  el.innerHTML='<h2 class="section-title">交付前检查</h2><div class="audit-card '+(report?.issues.some(x=>x.severity==="error")?"error":"")+'"><div class="row">'+icon(report?"checkcircle":"eye")+'<b style="font-size:11px">'+(report?(report.issues.some(x=>x.severity==="error")?"需要调整版面":"本页结构检查通过"):"让每个画面都准备妥当")+'</b></div><p class="small-note">'+(report?"检查文字完整性、越界、重叠与照片加载。":"检查整套内容，再查看实际画面与手机阅读效果。")+'</p></div>'+button("audit","检查整套作品","checkcircle","btn full")+
  (report?(report.issues.length?report.issues.map(x=>'<div class="audit-line '+(x.severity==="error"?"error":"")+'">'+icon(x.severity==="error"?"alert":"type")+'<span>'+esc(x.message)+'</span></div>').join(""):'<div class="audit-line">'+icon("check")+'文案完整，未发现文字越界或遮挡。</div><div class="audit-line">'+icon("check")+'本页所用图片已加载。</div>'):'<div class="small-note" style="margin-top:14px">检查结果不代替审美判断；仍需查看预览中的字重、断行和裁切。</div>')+
  '<div class="inspector-divider"></div><h3 class="section-title">本页采用的设计方法</h3>'+routeSkills(pg).map(([k,v])=>'<div class="audit-line"><span>'+esc(v)+'</span></div>').join("")+'<p class="small-note">AI 设计可调用完整技能与云端制作工具，具体使用记录见任务结果。</p>';
 }
}
function updatePreview(){
 clearTimeout(previewTimer);const fr=$("#canvas-frame");if(!fr)return;
 $(".canvas-loading").style.display="flex";fr.onload=async()=>{try{await fr.contentDocument.fonts.ready;applyFontScale(fr.contentDocument,current().settings.fontScale||1);$(".canvas-loading").style.display="none";}catch(e){toast("画面加载失败，请刷新页面。");}};
 fr.srcdoc=markup(current(),true);updateActiveThumb();
}
function updateActiveThumb(){const pg=current(),fr=$('[data-thumb="'+pg.id+'"]');if(fr){fr.onload=async()=>{await fr.contentDocument.fonts.ready;applyFontScale(fr.contentDocument,pg.settings.fontScale||1);};fr.srcdoc=markup(pg);}}
function fitCanvas(){
 const area=$(".canvas-area"),holder=$(".canvas-holder");if(!area||!holder)return;
 const fit=Math.min((area.clientWidth-(innerWidth<650?18:50))/1080,(area.clientHeight-28)/1440);
 const scale=Math.max(.14,Math.min(.7,fit))*S.zoom;
 holder.style.width=1080*scale+"px";holder.style.height=1440*scale+"px";$("#canvas-frame").style.transform="scale("+scale+")";$("#zoom-label").textContent=Math.round(scale*100)+"%";
}
function modal(title,body,footer="",wide=false){
 closeModal();const d=document.createElement("dialog");d.className="modal"+(wide?" overview-dialog":"");
 d.innerHTML='<div class="modal-head"><h2>'+title+'</h2><button class="icon-btn" aria-label="关闭窗口" data-action="close">'+icon("close")+'</button></div><div class="modal-body">'+body+'</div>'+(footer?'<div class="modal-footer">'+footer+'</div>':"");
 $("#modal-root").append(d);d.showModal();d.addEventListener("click",e=>{if(e.target===d&&!S.busy)d.close();});d.addEventListener("close",()=>{if(!S.busy)d.remove();});return d;
}
function closeModal(){const d=$("dialog");if(d){d.close();d.remove();}}
function webPhotoChoice(id,checked=false){return '<label class="web-photo-choice" for="'+id+'"><input id="'+id+'" type="checkbox" '+(checked?'checked':'')+'><span><b>让 AI 从网上找图</b><small>不上传也可使用，优先实景照片。网络配图可灵活裁切。</small></span></label>';}
function stylePresetChoices(){
 return '<fieldset class="style-presets"><legend>整套初始方向 <span class="muted">选填</span></legend><div class="preset-intro"><p>'+ (STYLE_PRESETS.some(preset=>resolveStylePreset(preset.id))?'三种排版原则，AI 按实际素材与内容安排画面。':'预留三套固定风格，设定后可一键选用。')+'</p><label class="preset-auto"><input type="radio" name="style-preset" value="" checked><span>AI 自行判断</span></label></div><div class="preset-grid">'+STYLE_PRESETS.map((preset,index)=>{
  const content='<span class="preset-top"><span class="preset-number">'+String(index+1).padStart(2,'0')+'</span><span class="preset-status">'+(resolveStylePreset(preset.id)?'已预设':'待设定')+'</span></span><span class="preset-name">'+esc(preset.name).split(' · ').join('<br>')+'</span><span class="preset-summary">'+esc(preset.summary||'风格将逐一设定')+'</span>';
  return resolveStylePreset(preset.id)?'<label class="preset-card preset-ready"><input type="radio" name="style-preset" value="'+preset.id+'"><span class="preset-content">'+content+'</span></label>':'<button type="button" class="preset-card preset-pending" data-action="preset-details" data-id="'+preset.id+'" aria-expanded="false" aria-controls="preset-detail">'+content+'</button>';
 }).join('')+'</div><div class="preset-detail" id="preset-detail" role="region" aria-live="polite" hidden></div><p class="preset-help">原图适配、实景主导、文字主导，各有自己的构图与检查重点。</p></fieldset>';
}
function showPresetDetails(control){
 const preset=STYLE_PRESETS.find(preset=>preset.id===control.dataset.id),panel=$('#preset-detail');if(!preset||!panel)return;
 const open=control.getAttribute('aria-expanded')!=='true';
 $$('.preset-pending').forEach(button=>button.setAttribute('aria-expanded','false'));
 panel.hidden=!open;
 if(open){control.setAttribute('aria-expanded','true');panel.innerHTML='<b>'+esc(preset.name)+' · 待设定</b><p>配色、字体、构图和图片处理规则将分别保存到此预案。具体风格将在后续逐一调整。</p><p>此预案暂未启用，当前设计选择保持不变。</p>';}
}
function showSelectedPreset(){
 const panel=$('#preset-detail');if(!panel)return;
 const preset=resolveStylePreset($('[name="style-preset"]:checked')?.value);
 $$('.preset-pending').forEach(button=>button.setAttribute('aria-expanded','false'));
 panel.hidden=!preset;
 if(preset)panel.innerHTML='<b>'+esc(preset.name)+'</b><p>'+esc(preset.description||preset.summary)+'</p>';
 const mode=preset?.imageMode||'auto',upload=$('.new-asset-input'),crop=$('.new-image-options .photo-upload-rule'),web=$('.new-image-options .web-photo-choice'),help=$('#new-image-help'),webInput=$('#new-web-images');
 if(upload)upload.hidden=!['auto','upload'].includes(mode);if(crop)crop.hidden=!['auto','upload'].includes(mode);if(web)web.hidden=mode!=='auto';
 if(webInput){if(mode!=='auto'){if(webInput.dataset.manualChoice===undefined)webInput.dataset.manualChoice=String(webInput.checked);webInput.checked=mode==='web';}else if(webInput.dataset.manualChoice!==undefined){webInput.checked=webInput.dataset.manualChoice==='true';delete webInput.dataset.manualChoice;}}
 if(help){help.hidden=mode==='auto';help.textContent=mode==='upload'?'本预案仅使用上传图片，请至少添加一张。':mode==='web'?'AI 将联网搜索实景照片并保留来源，无需上传图片。':'纯文字排版，只用文字、色块和线条组织内容。';}
 const uploadLabel=$('label[for="new-photos"]');if(uploadLabel)uploadLabel.innerHTML=icon('image')+(mode==='upload'?'上传图片（必填）':'添加图片（选填）');
 const taskHelp=$('#new-task-help');if(taskHelp)taskHelp.textContent=mode==='auto'?'AI 会自行择用设计技能；必要时生成示意素材。每轮最多自动修正一次，用量计入每日任务额度。':'AI 会按所选预案安排画面并自动检查。每轮最多自动修正一次，用量计入每日任务额度。';
}
function newProjectDialog(){
 modal("把文案交给 AI",'<form id="new-project-form"><div class="form-field"><label for="new-copy">原始文案</label><textarea class="import-text" id="new-copy" maxlength="60000" placeholder="粘贴完整文案。AI 会判断如何分页、构图和安排照片，文字、数字与顺序会保留。" required></textarea></div>'+
 '<div class="new-image-options"><div class="new-asset-input"><label class="btn" for="new-photos">'+icon("image")+'添加图片（选填）</label><input id="new-photos" type="file" accept="image/png,image/jpeg,image/webp" multiple hidden><span id="new-photo-count" class="small-note">最多 8 张，AI 自行判断用途与摆放</span></div><p class="photo-upload-rule">'+icon("lock")+'上传图片最多裁剪 20%，至少保留 80% 的原图画面。</p>'+webPhotoChoice('new-web-images')+'<p id="new-image-help" class="small-note" aria-live="polite" hidden></p></div>'+
 stylePresetChoices()+'<div class="form-field"><label for="new-brief">本次补充 <span class="muted">选填</span></label><textarea id="new-brief" rows="2" maxlength="6000" placeholder="有希望保留的品牌要求或表达重点，可以写在这里。"></textarea><p class="small-note">仅用于本次整套图文，单张调整仍在右侧填写。</p></div><div class="project-summary">'+icon("lock")+' 保留原文 · AI 设计 · 自动检查</div><p class="small-note" id="new-task-help">AI 会自行择用设计技能；必要时生成示意素材。每轮最多自动修正一次，用量计入每日任务额度。</p></form>',button("close","取消",null,"btn")+'<button class="btn primary" type="submit" form="new-project-form">'+icon("leaf")+'开始 AI 设计</button>');
}
function projectSettings(){
 modal("项目设置",'<div class="form-field"><label for="project-name">项目名称</label><input id="project-name" maxlength="100" value="'+esc(project().name)+'"></div><div class="between"><span class="small-note">创建于 '+formatDate(project().createdAt)+'</span>'+button("delete-project","删除项目","trash","btn flat small delete-link",S.projects.length===1?"disabled":"")+'</div>',button("close","取消",null,"btn")+button("save-project-name","保存名称","check","btn primary"));
}
function showAssets(){
 const p=project(),mode=projectImageMode(p),uploads=['auto','upload'].includes(mode);
 modal("项目素材",(uploads?'<div class="file-drop" data-action="upload">'+icon("upload")+'<br>添加照片或图片<br><span class="tiny muted">JPG、PNG、WebP · 每张不超过 12 MB</span></div><p class="photo-upload-rule">'+icon("lock")+'上传图片最多裁剪 20%，至少保留 80% 的原图画面。</p>':'<p class="small-note">'+(mode==='web'?'本项目使用联网配图，AI 会搜索实景照片并保留来源。':'本项目使用纯文字排版，无需图片。')+'</p>')+(mode==='auto'?webPhotoChoice('project-web-images',p.allowWebImages===true):'')+(mode!=='none'?'<div class="gallery-large" style="margin-top:20px">'+p.assets.map(a=>'<figure><img src="'+esc(a.url)+'" alt="'+esc(a.name)+'"><figcaption>'+esc(a.name)+(a.source==='web'?' · 网络配图':a.generated?' · AI 生成示意素材':' · 上传图片')+(a.source==='web'&&/^https:\/\//.test(a.sourceUrl||'')?' · <a href="'+esc(a.sourceUrl)+'" target="_blank" rel="noopener noreferrer">查看来源</a>':'')+'</figcaption></figure>').join("")+'</div>':'')+'<p class="small-note">AI 按本项目预案判断图片用途与摆放，并自动检查来源及裁剪比例。</p>');
}
function showMore(){modal("项目与版本",'<div class="mobile-actions">'+button("project-settings","修改项目名称",null,"btn full")+button("history","查看版本记录","history","btn full")+button("undo","撤销上一次修改","undo","btn full",!project().history?.length?"disabled":"")+button("backup","备份当前项目","save","btn full")+button("skills","AI 的设计能力","leaf","btn full")+'</div>');}
function showBrand(){
 const p=project();
 modal("品牌与样式",'<div class="form-field"><label>项目强调色</label><div class="color-dots">'+PALETTES.map(c=>'<button class="color-dot" style="background:'+c.color+'" aria-label="'+c.name+'" title="'+c.name+'" data-action="brand-color" data-color="'+c.color+'"></button>').join("")+'</div></div><div class="settings-item"><b>同一套作品，保留视觉连贯</b><p>强调色可统一应用到整套；每页仍可保留不同构图、底色与照片比例。</p></div><div class="settings-item"><b>字体与高清输出</b><p>已内置 Noto Sans SC 中文字体，保留真实字重。所有页面使用 1080 × 1440 母版，按 2 倍清晰度导出。</p></div><p class="small-note">品牌与产品资料属于本次项目，不会成为其他项目的固定要求。</p>');
}
function showHistory(){
 const hist=project().history||[];
 modal("版本记录",'<div class="project-summary">'+icon("history")+'保留最近25次操作，可撤销或恢复。<span style="margin-left:auto">'+hist.length+' 条</span></div>'+
 (hist.length?hist.slice().reverse().map(h=>'<div class="version-item"><div>'+esc(h.label)+'<small>'+formatDate(h.at)+'</small></div>'+button("restore-history","恢复",null,"btn small",'data-id="'+h.id+'"')+'</div>').join(""):'<div class="empty">还没有修改记录。<br>修改文案、构图或照片后，记录会出现在这里。</div>'));
}
function showSettings(){modal("关于图序工作台",'<div class="settings-item"><b>你负责内容，AI 负责画面</b><p>准备文案与图片后，AI 自行决定分页、视觉方向、照片安排和设计技能，并执行渲染与网页检查。检查通过后自动呈现。</p></div><div class="settings-item"><b>每个账户，独立创作</b><p>文案、素材、项目和设计记录按账户隔离。管理员可以创建账户，使用者在自己的工作空间里继续编辑。</p></div><div class="settings-item"><b>带走可编辑作品</b><p>可下载高清图片、可编辑 HTML 和项目备份。</p></div><p class="small-note">版本 0.5.1 · 独立账户工作空间</p>');}
function showExport(){
 modal("导出你的作品",'<div class="project-summary"><b>'+project().pages.length+'</b><div>个画面已准备就绪<br><span class="tiny muted">2160 × 2880 · 高清 PNG</span></div></div><div class="settings-item"><b>导出整套高清图</b><p>每页生成一张PNG，并打包成ZIP。导出前会自动检查缺字、越界与图片加载。</p></div><div class="panel-actions">'+button("export-all","整套PNG · ZIP","download","btn primary")+button("export-one","仅导出当前页",null,"btn")+'</div><div class="inspector-divider"></div><div class="settings-item"><b>保留可编辑作品</b><p>项目备份可再次导入图序；HTML工程包含正式文字、布局、照片和字体许可。</p></div><div class="panel-actions">'+button("backup","项目备份 · JSON","save","btn")+button("export-source","可编辑HTML · ZIP","folder","btn")+'</div>');
}
function showOverview(phone=false){
 const p=project(),pages=phone?[current()]:p.pages;
 const phoneWidth=Math.min(360,innerWidth*.94-40);
 const d=modal(phone?"手机阅读预览":"整套作品预览",'<div class="overview-grid" style="'+(phone?"grid-template-columns:1fr;":"")+'">'+pages.map((pg,i)=>'<div class="overview-page"><div class="overview-frame" style="'+(phone?"width:360px;height:480px;max-width:100%;":"")+'"><iframe title="'+esc(pg.label)+'" data-overview="'+pg.id+'" style="'+(phone?"transform:scale(.3333333);":"")+'"></iframe></div><span>'+String((phone?activePageIndex():i)+1).padStart(2,"0")+' · '+esc(pg.label.slice(0,20))+'</span></div>').join("")+'</div>',"",!phone);
 for(const pg of pages){const fr=$('[data-overview="'+pg.id+'"]',d);if(phone){fr.parentElement.style.width=phoneWidth+"px";fr.parentElement.style.height=phoneWidth*4/3+"px";fr.style.transform="scale("+phoneWidth/1080+")";}fr.srcdoc=markup(pg);fr.onload=()=>fr.contentDocument.fonts.ready.then(()=>applyFontScale(fr.contentDocument,pg.settings.fontScale||1));}
}
function confirmDelete(kind){
 const p=project(),isProject=kind==="project";
 modal(isProject?"删除这个项目？":"删除这个页面？",'<p style="font-size:12px;line-height:1.9">将删除'+esc(isProject?p.name:"当前第 "+(activePageIndex()+1)+" 页")+'。'+(isProject?"建议先下载项目备份。":"页面删除后可以撤销。")+'</p>',button("close","取消",null,"btn")+button(isProject?"confirm-delete-project":"confirm-delete-page","确认删除","trash","btn primary"));
}
function mobileMenu(){modal("你的工作空间",'<div class="mobile-actions">'+button("new","新建图文","plus","btn full")+button("mobile-copy","编辑文案","type","btn full")+button("assets","项目素材","image","btn full")+button("ai-tasks","设计记录","history","btn full")+button("account",S.session?.accessMode==='accounts'?"我的账户":"当前工作空间","settings","btn full")+button("backup","备份当前作品","save","btn full")+'</div>');}
function mobileCopy(){modal("编辑当前页文案",current().copy.map((c,i)=>'<label class="copy-field"><span class="field-heading">'+(i===0?"标题":"内容 "+i)+'</span><textarea data-copy-field="'+esc(c.id)+'" rows="4">'+esc(c.text)+'</textarea></label>').join(""),button("close","完成编辑","check","btn primary"));}
const actions={
 "mobile-menu":mobileMenu,"mobile-copy":mobileCopy,"ai-design":()=>Cloud.startDesign(),"ai-page":()=>Cloud.startPageDesign(),"ai-tasks":()=>Cloud.showTasks(),skills:()=>Cloud.showSkills(),account:()=>S.session.accessMode==='accounts'?Accounts.showAccount():Cloud.showAccount(),new:newProjectDialog,workspace:()=>{closeModal();},assets:showAssets,more:showMore,history:showHistory,settings:showSettings,
 "preset-details":showPresetDetails,
 close:()=>{if(!S.busy)closeModal();},export:showExport,overview:()=>showOverview(),phone:()=>showOverview(true),
 "project-settings":projectSettings,"save-project-name":()=>{const n=$("#project-name").value.trim();if(!n)return toast("请输入项目名称。");project().name=n;closeModal();scheduleSave();render();},
 "select-page":b=>{S.pageId=b.dataset.id;S.selectedCopy=null;S.editing=null;S.zoom=1;render();},
 "switch-project":b=>{S.activeId=b.dataset.id;S.pageId=project().pages[0].id;S.audit=null;S.zoom=1;render();scheduleSave();},
 tab:b=>{S.tab=b.dataset.tab;renderInspector();},
 undo:()=>{const p=project(),h=p.history?.pop();if(!h)return;p.redo??=[];p.redo.push({id:uid(),at:Date.now(),label:h.label,pages:clone(p.pages)});p.pages=h.pages;S.audit=null;scheduleSave();render();},
 redo:()=>{const p=project(),h=p.redo?.pop();if(!h)return;p.history??=[];p.history.push({id:uid(),at:Date.now(),label:h.label,pages:clone(p.pages)});p.pages=h.pages;S.audit=null;scheduleSave();render();},
 layout:b=>edit("切换构图",()=>{current().layout=b.dataset.layout;if(current().layout==="photo"&&!current().photoAssetId&&project().assets.length)current().photoAssetId=project().assets[0].id;}),
 color:b=>edit("修改强调色",()=>current().settings.accent=b.dataset.color,{full:false}),
 "brand-color":b=>{edit("整套强调色",()=>{for(const p of project().pages)p.settings.accent=b.dataset.color;});closeModal();toast("已更新整套作品的强调色。");},
 "all-color":()=>{edit("同步整套强调色",()=>{const color=current().settings.accent;for(const p of project().pages)p.settings.accent=color;});toast("已应用到整套，页面构图保持不变。");},
 upload:()=>['auto','upload'].includes(projectImageMode(project()))?$("#file-images").click():toast('当前预案不使用上传图片。'),
 "choose-photo":b=>edit("替换当前页照片",()=>{current().photoAssetId=b.dataset.id;if(!current().html.includes("<img")&&current().layout!=="photo")current().layout="photo";current().settings.photoZoom=1;}),
 "add-page":()=>{if(project().pages.length>=20)return toast("一套作品最多20页。");edit("添加页面",()=>{const p=parseManuscript("新页面标题\n在这里输入本页正文。")[0];p.layout="editorial";project().pages.splice(activePageIndex()+1,0,p);S.pageId=p.id;S.tab="copy";});},
 "duplicate-page":()=>{if(project().pages.length>=20)return toast("一套作品最多20页。");edit("复制页面",()=>{const p=clone(current());p.id=uid();const replacements=new Map(p.copy.map(c=>[c.id,uid()]));for(const c of p.copy)c.id=replacements.get(c.id);for(const c of p.originalCopy)c.id=replacements.get(c.id)||c.id;for(const [old,n]of replacements)p.html=p.html.replaceAll(old,n);project().pages.splice(activePageIndex()+1,0,p);S.pageId=p.id;});},
 "move-up":()=>{if(activePageIndex()===0)return;edit("调整页面顺序",()=>{const i=activePageIndex(),pages=project().pages;[pages[i-1],pages[i]]=[pages[i],pages[i-1]];});},
 "move-down":()=>{const i=activePageIndex();if(i===project().pages.length-1)return;edit("调整页面顺序",()=>{const pages=project().pages;[pages[i+1],pages[i]]=[pages[i],pages[i+1]];});},
 "add-copy":()=>edit("添加内容段落",()=>{const id=uid();current().copy.push({id,text:"在这里输入新的内容。"});current().originalCopy.push({id,text:"在这里输入新的内容。"});if(current().layout==="original")current().layout="editorial";S.selectedCopy=id;}),
 "delete-page":()=>confirmDelete("page"),"confirm-delete-page":()=>{if(project().pages.length<=1)return;edit("删除页面",()=>{const i=activePageIndex();project().pages.splice(i,1);S.pageId=project().pages[Math.max(0,i-1)].id;});closeModal();},
 "delete-project":()=>confirmDelete("project"),"confirm-delete-project":async()=>{if(S.projects.length<2)return;await Cloud.remove(project());S.projects=S.projects.filter(p=>p.id!==S.activeId);S.activeId=S.projects[0].id;S.pageId=project().pages[0].id;closeModal();render();scheduleSave();},
 "restore-history":b=>{const p=project(),h=p.history.find(x=>x.id===b.dataset.id);if(!h)return;const pages=clone(h.pages);edit("恢复历史版本",()=>{p.pages=pages;});closeModal();toast("已恢复，仍可通过撤销返回。");},
 "zoom-in":()=>{S.zoom=clamp(S.zoom+.1,.5,2);fitCanvas();},"zoom-out":()=>{S.zoom=clamp(S.zoom-.1,.5,2);fitCanvas();},fit:()=>{S.zoom=1;fitCanvas();},
 "import-project":()=>$("#file-project").click(),
 backup:()=>exportProject(),"export-all":()=>exportImages(false),"export-one":()=>exportImages(true),"export-source":()=>exportSource(),
 audit:()=>checkAll()
};

function progress(title){S.busy=true;const d=modal(title,'<div class="row"><div class="loading-ring"></div><span>正在准备…</span></div><div class="progress-track"><i></i></div><div class="progress-status"></div>');d.addEventListener("cancel",e=>e.preventDefault());return (n,t)=>{const bar=$(".progress-track i",d),status=$(".progress-status",d);if(bar)bar.style.width=Math.round(n*100)+"%";if(status)status.textContent=t;};}
function endProgress(){S.busy=false;closeModal();}
async function renderFrame(pg,targetProject=project()){
 const fr=document.createElement("iframe");fr.style.cssText="position:fixed;left:-20000px;top:0;width:1080px;height:1440px;border:0;pointer-events:none";
 document.body.append(fr);
 try{
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error("画面加载超时，请重试。")),45000);fr.onload=()=>{clearTimeout(timer);resolve();};fr.onerror=reject;fr.srcdoc=frameDocument(pg,targetProject,S.baseCSS);});
  const doc=fr.contentDocument;await doc.fonts.ready;applyFontScale(doc,pg.settings.fontScale||1);
  await Promise.all([...doc.images].map(im=>im.decode().catch(()=>{})));
  return {frame:fr,doc,root:doc.querySelector(".xhs-card"),remove:()=>fr.remove()};
 }catch(e){fr.remove();throw e;}
}
async function auditProposal(draft,pageIds,onProgress){
 const report=[],pages=draft.pages.filter(page=>!pageIds||pageIds.includes(page.id));
 for(const [index,page]of pages.entries()){onProgress?.({current:index+1,total:pages.length,pageId:page.id});const rendered=await renderFrame(page,draft);try{report.push({id:page.id,label:page.label,issues:auditPage(rendered.doc,page,draft)});}finally{rendered.remove();}}
 return report;
}
async function checkAll(){
 if(S.busy)return;
 const update=progress("检查整套作品"),report=[];
 try{
  for(let i=0;i<project().pages.length;i++){
   const p=project().pages[i];update(i/project().pages.length,"正在检查第 "+(i+1)+" 页的文字与图片");
   const r=await renderFrame(p);
   try{report.push({id:p.id,label:p.label,issues:auditPage(r.doc,p,project())});}finally{r.remove();}
  }
  S.audit=report;endProgress();S.tab="check";renderInspector();
  const count=report.filter(r=>r.issues.some(x=>x.severity==="error")).length;
  toast(count?count+"页需要调整，可切换页面查看检查结果。":"整套结构检查通过，请继续查看手机阅读与照片裁切。");
 }catch(e){endProgress();toast(e.message);}
}
const dataURLCache=new Map();
async function toDataURL(url){
 if(url.startsWith("data:"))return url;
 if(!dataURLCache.has(url))dataURLCache.set(url,(async()=>{
  const r=await fetch(new URL(url,location.href));if(!r.ok)throw Error("素材加载失败："+url);
  const b=await r.blob();return await new Promise((res,rej)=>{const f=new FileReader();f.onload=()=>res(f.result);f.onerror=rej;f.readAsDataURL(b);});
 })());
 return dataURLCache.get(url);
}
async function fontCSS(doc){
 const names={400:"Regular",500:"Medium",700:"Bold",900:"Black"};
 const weights=new Set([...doc.querySelectorAll("[data-copy],[data-copy] *")].map(el=>Number(doc.defaultView.getComputedStyle(el).fontWeight)||400));
 const rules=[];
 for(const w of weights){const weight=[400,500,700,900].reduce((a,b)=>Math.abs(b-w)<Math.abs(a-w)?b:a);const url=await toDataURL("assets/fonts/NotoSansSC-"+names[weight]+".woff2");rules.push('@font-face{font-family:"TY Sans";src:url("'+url+'") format("woff2");font-weight:'+weight+';}');}
 return rules.join("\n");
}
function safeName(name){return name.replace(/[<>:"/\\|?*\u0000-\u001f]/g,"_").slice(0,70)||"图序作品";}
function download(blob,name){
 const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),60000);
}
async function exportImages(one){
 if(S.busy)return;
 const pages=one?[clone(current())]:clone(project().pages),update=progress(one?"导出当前画面":"导出整套作品"),zip=new JSZip(),results=[];
 try{
  for(let i=0;i<pages.length;i++){
   const p=pages[i];update(i/pages.length,"正在呈现第 "+(i+1)+" / "+pages.length+" 页");
   const r=await renderFrame(p);
   try{
    const issues=auditPage(r.doc,p,project());
    if(issues.some(x=>x.severity==="error")){
     S.audit=[{id:p.id,label:p.label,issues}];S.pageId=p.id;S.tab="check";
     throw Error("第"+(project().pages.findIndex(x=>x.id===p.id)+1)+"页："+issues.find(issue=>issue.severity==='error').message+" 请让 AI 调整后再导出。");
    }
    for(const im of r.root.querySelectorAll("img"))im.src=await toDataURL(im.src);
    await Promise.all([...r.doc.images].map(im=>im.decode()));
    r.doc.body.classList.add("exporting");
    update((i+.2)/pages.length,"正在生成高清图片 "+(i+1)+" / "+pages.length);
    const blob=await toBlob(r.root,{width:1080,height:1440,pixelRatio:2,fontEmbedCSS:await fontCSS(r.doc),skipFonts:true,skipAutoScale:true,cacheBust:false});
    if(!blob)throw Error("浏览器未能生成图片，请使用Chrome或Edge重试。");
    const n=String(project().pages.findIndex(x=>x.id===p.id)+1).padStart(2,"0"),name=n+"_"+safeName(p.label.slice(0,20))+".png";
    results.push({name,blob});if(!one)zip.file(name,blob);
   }finally{r.remove();}
  }
  update(.97,"正在打包下载");
  if(one)download(results[0].blob,results[0].name);
  else download(await zip.generateAsync({type:"blob",compression:"STORE"}),safeName(project().name)+"_高清图片.zip");
  endProgress();toast(one?"当前页已导出为2160×2880 PNG。":"整套高清图片已生成，请在下载记录中查看。");
 }catch(e){endProgress();render();toast(e.message);}
}
async function portableProject(){
 const p=clone(project());p.history=[];p.redo=[];
 for(const a of p.assets)a.url=await toDataURL(a.url);
 return p;
}
async function exportProject(){
 if(S.busy)return;
 try{const p=await portableProject();download(new Blob([JSON.stringify({schema:"tuxu-project-v1",exportedAt:new Date().toISOString(),project:p},null,2)],{type:"application/json"}),safeName(p.name)+".tuxu.json");toast("项目已备份，文件包含文案、照片与布局。");}catch(e){toast(e.message);}
}
async function exportSource(){
 if(S.busy)return;const update=progress("打包可编辑工程");
 try{
  const p=await portableProject(),zip=new JSZip();
  zip.file("project.tuxu.json",JSON.stringify({schema:"tuxu-project-v1",project:p},null,2));
  let css=S.baseCSS;const rules=[];
  for(const [w,n]of [[400,"Regular"],[500,"Medium"],[700,"Bold"],[900,"Black"]]){
   const file="NotoSansSC-"+n+".woff2",r=await fetch("assets/fonts/"+file);zip.file("assets/fonts/"+file,await r.arrayBuffer());
   rules.push('@font-face{font-family:"TY Sans";src:url("assets/fonts/'+file+'") format("woff2");font-weight:'+w+';}');
  }
  zip.file("assets/fonts/OFL.txt",await (await fetch("assets/fonts/OFL.txt")).text());
  css=css.replace(/@font-face\s*\{[^}]+\}/g,"")+rules.join("\n");
  const pages=p.pages.map((pg,i)=>{
   const doc=frameDocument(pg,p,css,{portable:true});
   return {pg,doc,i};
  });
  const overview='<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>'+esc(p.name)+'</title><style>body{margin:0;background:#e5e9e0;font:16px sans-serif}.sheet{display:flex;flex-direction:column;align-items:center;gap:28px;padding:28px}iframe{display:block;width:1080px;height:1440px;border:0}h1{font-size:24px}</style><div class="sheet"><h1>'+esc(p.name)+'</h1>'+pages.map(({i})=>'<iframe src="page-'+(i+1)+'.html" title="第'+(i+1)+'页"></iframe>').join("")+'</div></html>';
  for(const {pg,doc,i}of pages){
   let html=doc;
   if(pg.settings.fontScale!==1)html=html.replace("</head>",'<script>document.fonts.ready.then(()=>{const sizes=[...document.querySelectorAll("[data-copy],[data-copy] *")].filter(e=>e.tagName!=="BR").map(e=>[e,parseFloat(getComputedStyle(e).fontSize)]);for(const [e,n]of sizes)e.style.fontSize=(n*'+pg.settings.fontScale+')+"px";});<\/script></head>');
   zip.file("page-"+(i+1)+".html",html);
  }
  zip.file("index.html",overview);
  zip.file("原文与当前文案.json",JSON.stringify(p.pages.map(pg=>({page:pg.label,original:pg.originalCopy,current:pg.copy})),null,2));
  zip.file("图片来源.json",JSON.stringify(p.assets.filter(asset=>asset.source==='web').map(asset=>({name:asset.name,source:asset.sourceUrl,image:asset.imageUrl})),null,2));
  zip.file("打开说明.txt","双击index.html查看整套母版。每个page-N.html均保留可编辑的HTML文字与版式。project.tuxu.json可导入图序继续编辑。照片以原始数据嵌入，字体许可在assets/fonts/OFL.txt。当前工程不包含账号发布功能。");
  update(.9,"正在完成打包");
  download(await zip.generateAsync({type:"blob",compression:"DEFLATE",compressionOptions:{level:4}}),safeName(p.name)+"_可编辑工程.zip");
  endProgress();toast("可编辑HTML工程已打包。");
 }catch(e){endProgress();toast(e.message);}
}

document.addEventListener("click",e=>{
 if(S.authLocked)return;
 const b=e.target.closest("[data-action]");if(!b||b.disabled)return;
 const fn=actions[b.dataset.action];if(fn&&!S.busy)Promise.resolve(fn(b)).catch(err=>toast(err.message));
});
async function readImageFiles(input){
 const files=[...input];if(files.length>8)throw Error("每次最多添加8张图片。");
 const images=[];for(const file of files){
  if(!["image/png","image/jpeg","image/webp"].includes(file.type))throw Error("请上传PNG、JPG或WebP图片。");
  if(file.size>12*1024*1024)throw Error(file.name+"超过12MB，请先压缩。");
  const url=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});
  images.push({id:uid(),name:file.name,url,source:'upload',generated:false});
 }return images;
}
document.addEventListener("submit",async e=>{
 if(e.target.id==="new-project-form"){
  e.preventDefault();const submit=e.submitter;if(submit)submit.disabled=true;
  try{
   const text=$("#new-copy").value,brief=$("#new-brief").value.slice(0,6000),stylePresetId=validateStylePresetId($('[name="style-preset"]:checked')?.value),mode=projectImageMode({stylePresetId}),allowWebImages=webImagesForMode(mode,$("#new-web-images").checked),pages=parseManuscript(text,{preserveText:true});
   if(mode==='upload'&&!$("#new-photos").files.length)throw Error('请先上传至少一张图片，再使用预案一。');
   const assets=['auto','upload'].includes(mode)?await readImageFiles($("#new-photos").files):[];
   const p={id:uid(),name:(pages[0].copy[0]?.text||"新的图文").slice(0,80),brief,stylePresetId,allowWebImages,pages,assets,history:[],redo:[],createdAt:Date.now(),updatedAt:Date.now()};
   S.projects.unshift(p);S.activeId=p.id;S.pageId=p.pages[0].id;S.tab="copy";S.zoom=1;S.audit=null;closeModal();render();scheduleSave();await Cloud.startDesign();
  }catch(err){toast(err.message);if(submit?.isConnected)submit.disabled=false;}
 }
});
document.addEventListener("input",e=>{
 const el=e.target;
 if(el.matches("[data-copy-field]")){
  const pg=current(),c=pg.copy.find(x=>x.id===el.dataset.copyField);if(!c)return;
  if(S.editing!==c.id){remember("修改文案 · "+(pg.copy.indexOf(c)===0?"标题":"内容"));S.editing=c.id;}
  c.text=el.value;S.audit=null;const label=$('[data-count="'+c.id+'"]');if(label)label.textContent=c.text.length+" 字";
  scheduleSave();clearTimeout(previewTimer);previewTimer=setTimeout(updatePreview,320);
 }else if(el.id==="design-notes"){
  current().requirements=el.value.slice(0,5000);scheduleSave();Cloud.updateBadge();
 }else if(el.matches("[data-setting]")){
  const setting=el.dataset.setting;
  if(S.editing!==setting){remember("调整画面 · "+({fontScale:"文字大小",photoZoom:"照片缩放",photoX:"水平裁切",photoY:"垂直裁切"})[setting]);S.editing=setting;}
  current().settings[setting]=Number(el.value)/(setting==="fontScale"||setting==="photoZoom"?100:1);
  el.nextElementSibling.textContent=el.value+(setting==="fontScale"||setting==="photoZoom"?"%":"");
  scheduleSave();clearTimeout(previewTimer);previewTimer=setTimeout(updatePreview,120);S.audit=null;
 }
});
document.addEventListener("focusout",e=>{if(e.target.matches("[data-copy-field],[data-setting]"))S.editing=null;});
document.addEventListener("change",e=>{if(e.target.name==='style-preset'){showSelectedPreset();}else if(e.target.id==="new-photos"){const label=$("#new-photo-count");if(label)label.textContent=e.target.files.length?"已选 "+e.target.files.length+" 张图片":"最多 8 张，AI 自行判断用途与摆放";}else if(e.target.id==='project-web-images'){project().allowWebImages=e.target.checked;scheduleSave();toast(e.target.checked?'已允许 AI 联网寻找实景配图，下次设计时生效。':'已关闭联网搜图，下次设计仅使用现有素材。');}});
$("#file-images").addEventListener("change",async e=>{
 try{
  const files=[...e.target.files];if(!files.length)return;if(files.length+project().assets.length>100)throw Error("项目素材已满，请另建项目。");
  const entries=await readImageFiles(files);project().assets.push(...entries);scheduleSave();if($("dialog"))showAssets();toast("已添加"+entries.length+"张图片，下次设计时由AI自行安排。");
 }catch(err){toast(err.message);}finally{e.target.value="";}
});
$("#file-project").addEventListener("change",async e=>{
 try{
  const f=e.target.files[0];if(!f)return;if(f.size>120*1024*1024)throw Error("项目超过120MB，请减少素材后再导入。");
  const p=validateProject(JSON.parse(await f.text()));S.projects.unshift(p);S.activeId=p.id;S.pageId=p.pages[0].id;S.audit=null;S.zoom=1;closeModal();render();scheduleSave();toast("项目已导入，可以继续编辑。");
 }catch(err){toast(err instanceof SyntaxError?"项目文件不是有效的JSON，请重新选择。":err.message);}finally{e.target.value="";}
});
window.addEventListener("message",e=>{
 if(e.origin!==location.origin||e.source!==$("#canvas-frame")?.contentWindow||!e.data||e.data.type!=="tuxu-select")return;
 const c=current().copy.find(c=>c.id===e.data.id);if(!c)return;S.tab="copy";S.selectedCopy=c.id;renderInspector();
 const field=$('[data-copy-field="'+c.id+'"]');field?.scrollIntoView({block:"center",behavior:"smooth"});field?.focus({preventScroll:true});
});
document.addEventListener("keydown",e=>{
 if(S.authLocked||!project())return;
 if((e.ctrlKey||e.metaKey)&&e.key==="Enter"&&e.target.id==="design-notes"&&!e.isComposing){e.preventDefault();const send=$('[data-action="ai-page"]');if(send&&!send.disabled)Cloud.startPageDesign();return;}
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="s"){e.preventDefault();persist();toast("已保存到此浏览器。");}
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="z"&&!["TEXTAREA","INPUT"].includes(document.activeElement?.tagName)&&!S.busy){e.preventDefault();actions[e.shiftKey?"redo":"undo"]();}
});
window.addEventListener("resize",fitCanvas);
window.addEventListener("beforeunload",()=>{clearTimeout(saveTimer);if(S.db)persist();});
function freezeWorkspace(){S.authLocked=true;clearTimeout(saveTimer);clearTimeout(previewTimer);Cloud.dispose();closeModal();S.db?.close();S.db=null;S.projects=[];S.jobs=[];S.activeId=null;S.pageId=null;dataURLCache.clear();delete window.TuXu;$("#file-images").value='';$("#file-project").value='';$("#app").innerHTML='<div class="boot"><p>正在更新登录状态…</p></div>';}
const Cloud=createCloud({S,project,current,modal,closeModal,toast,render,remember,persist,button,baseCSS:()=>S.baseCSS,auditProposal,onAuthLost:()=>Accounts.onAuthLost()});
const Accounts=createAccounts({S,request:Cloud.request,modal,toast,freeze:freezeWorkspace,persist});
async function legacyProjects(name="tuxu-studio"){return new Promise(resolve=>{const r=indexedDB.open(name,1);r.onupgradeneeded=()=>{r.transaction.abort();resolve([]);};r.onerror=()=>resolve([]);r.onsuccess=()=>{try{const q=r.result.transaction("workspace").objectStore("workspace").get("state");q.onsuccess=()=>{resolve(q.result?.projects||[]);r.result.close();};q.onerror=()=>resolve([]);}catch{resolve([]);}};});}
async function boot(){
 try{
  await Cloud.init();
  if(S.authLocked)return;
  if(S.session.serviceError)throw Error(S.session.serviceError);
  if(S.session.accessMode==='accounts'&&!S.session.user){Accounts.login();return;}
  if(S.session.accessMode==='accounts'&&location.pathname==='/login')history.replaceState(null,'','/');
  S.baseCSS=await (await fetch("sample/poster.css")).text();S.baseCSS=S.baseCSS.replace(/\\.ttf/g,".woff2").replace(/format\\("truetype"\\)/g,'format("woff2")');
  try{S.db=await openDB();const saved=await dbRead();if(saved?.projects?.length){S.projects=saved.projects;S.activeId=saved.activeId;}}catch{toast("本机缓存暂时不可用，请及时备份作品。");}
  let remote=[];try{remote=await Cloud.pull();}catch{toast("云端项目暂时无法载入，可继续使用本机缓存。");}
  if(S.authLocked)return;
  for(const p of remote){const local=S.projects.find(x=>x.id===p.id);if(!local)S.projects.push(p);else if(!local._cloudDirty&&p.cloudRevision>(local.cloudRevision||0))S.projects[S.projects.indexOf(local)]=p;}
  if(!S.projects.length&&S.session.isAdmin&&S.session.accessMode!=='accounts')S.projects=await legacyProjects();
  if(!S.projects.length&&S.session.accessMode==='visitor'){S.projects=await legacyProjects('tuxu-studio-guest');for(const p of S.projects){delete p.cloudRevision;delete p._syncConflict;p._cloudDirty=true;}}
  if(!S.projects.length){const p={id:uid(),name:"从文案开始",pages:parseManuscript("让好内容，被看见\n把你的完整文案放在右侧，也可以上传本次图片。\n画面、分页和设计检查，交给 AI 自行完成。",{preserveText:true}),assets:[],history:[],redo:[],createdAt:Date.now(),updatedAt:Date.now()};S.projects=[p];}
  if(!project())S.activeId=S.projects[0].id;S.pageId=project().pages[0].id;render();Cloud.updateBadge();await persist({skipCloud:!project()._cloudDirty&&!!project().cloudRevision});Cloud.startPolling();
  window.TuXu={getState:()=>clone({projects:S.projects,activeId:S.activeId,pageId:S.pageId,user:S.session.user,jobs:S.jobs}),auditCurrent:()=>auditPage($("#canvas-frame").contentDocument,current(),project()),version:"0.5.1"};
 }catch(e){$("#app").innerHTML='<div class="boot"><h1>工作台暂时未能打开</h1><p>'+esc(e.message)+'</p><button class="btn primary" onclick="location.reload()">重新打开</button></div>';}
}
boot();


