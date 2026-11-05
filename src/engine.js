
export const uid=()=>crypto.randomUUID();
export const clean=s=>String(s??"").replace(/\s+/gu,"");
export const escape=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
export const clone=o=>structuredClone(o);
export const LAYOUTS={original:"保留当前构图",cover:"大字封面",editorial:"编辑式正文",photo:"图文分区",list:"信息清单",timeline:"步骤路径",closing:"行动结尾"};
export const PALETTES=[{name:"海盐蓝",color:"#214BE1"},{name:"森林绿",color:"#3F6552"},{name:"朱砂红",color:"#B44235"},{name:"鸢尾紫",color:"#665090"},{name:"近墨黑",color:"#252C33"}];
export function parseManuscript(text){
 text=String(text).replace(/\r\n?/g,"\n").trim();
 if(!text)throw Error("请先输入需要制作的文案。");
 let chunks=text.split(/\n\s*---+\s*\n/g);
 if(chunks.length===1)chunks=text.split(/(?:^|\n)\s*(?:[（(【\[]\s*)?\d+\s*[pP页]\s*(?:[）)】\]]\s*)?[：:]?\s*(?:\n|(?=[^\n]))/).filter(s=>s.trim());
 if(!chunks.length)chunks=[text];
 if(chunks.length>20)throw Error("一套作品最多20页，请分成两个项目。");
 const pages=chunks.map((chunk,i)=>{
  const lines=chunk.trim().split("\n").map(s=>s.trim()).filter(Boolean);
  const title=(lines.shift()||"").replace(/^#{1,3}\s+/,"");
  const paragraphs=lines.map(s=>s.replace(/^[-*]\s+/,""));
  const id=uid(),copy=[{id:id+"-title",text:title},...paragraphs.map((text,j)=>({id:id+"-body-"+j,text}))];
  const layout=i===0?"cover":/阶段|步骤|路径/.test(title)?"timeline":/咨询|报名|联系|回复/.test(title)?"closing":"editorial";
  return {id,label:title.slice(0,24),layout,copy,originalCopy:clone(copy),html:"",settings:{accent:"#214BE1",fontScale:1,photoZoom:1,photoX:50,photoY:50},photoAssetId:null};
 });
 return pages;
}
export function genericCard(p,assetUrl){
 const title=p.copy[0],rest=p.copy.slice(1);
 const h=title?'<h1 data-copy="'+escape(title.id)+'">'+escape(title.text).replace(/\n/g,"<br>")+'</h1>':"";
 const paragraph=c=>'<p data-copy="'+escape(c.id)+'">'+escape(c.text).replace(/\n/g,"<br>")+'</p>';
 const photo=p.photoAssetId&&assetUrl?'<figure class="generic-photo"><img alt="本次项目上传的照片" src="'+escape(assetUrl)+'"></figure>':"";
 let body="";
 if(p.layout==="timeline")body='<div class="generic-timeline">'+rest.map((c,i)=>'<div class="generic-step"><i aria-hidden="true">'+(i+1)+'</i>'+paragraph(c)+'</div>').join("")+'</div>';
 else if(p.layout==="list")body='<div class="generic-list">'+rest.map(c=>'<div>'+paragraph(c)+'</div>').join("")+'</div>';
 else body='<div class="generic-body">'+rest.map(paragraph).join("")+'</div>';
 return '<section class="xhs-card generic generic-'+escape(p.layout)+'" data-page="'+escape(p.label)+'">'+h+photo+body+'</section>';
}
export function sanitizeCSS(value){const s=String(value||"");if(s.length>80000||/[<>]|@import|url\s*\(|expression\s*\(|javascript:|@font-face/i.test(s))throw Error("页面样式包含不支持的内容。");return s;}
export function sanitizeHTML(value){
 const d=new DOMParser().parseFromString(value,"text/html");
 const allowed=new Set("SECTION HEADER FOOTER ARTICLE MAIN ASIDE DIV P H1 H2 H3 SPAN STRONG EM B I BR FIGURE IMG SVG PATH RECT LINE CIRCLE POLYLINE UL OL LI SMALL".split(" "));
 for(const el of [...d.body.querySelectorAll("*")]){
  if(!allowed.has(el.tagName.toUpperCase())){el.remove();continue;}
  for(const a of [...el.attributes]){
   if(!/^(class|data-copy|data-page|data-vds-role|data-vds-cause|aria-hidden|alt|src|style|data-asset-id|viewbox|d|x|y|x1|y1|x2|y2|width|height|rx|ry|cx|cy|r|points|fill|stroke|stroke-width|stroke-linecap|stroke-linejoin)$/i.test(a.name))el.removeAttribute(a.name);
  }
  if(el.hasAttribute("style")&&/[<>]|url\s*\(|expression\s*\(|javascript:|@import/i.test(el.getAttribute("style")))el.removeAttribute("style");
  if(el.tagName==="IMG"){
   const s=el.getAttribute("src")||"";
   if(!/^(assets\/photos\/[^?#]+|\/api\/files\/[a-zA-Z0-9_-]+|data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+)$/.test(s))el.removeAttribute("src");
  }
 }
 return d.body.innerHTML;
}
export function pageMarkup(p,project){
 const asset=project.assets.find(a=>a.id===p.photoAssetId);
 let html=p.layout==="original"&&p.html?p.html:genericCard(p,asset?.url);
 const d=new DOMParser().parseFromString(html,"text/html");
 for(const c of p.copy){
  const el=[...d.querySelectorAll("[data-copy]")].find(e=>e.dataset.copy===c.id);
  if(el&&clean(el.textContent)!==clean(c.text))replaceStyledText(el,c.text);
 }
 for(const img of d.querySelectorAll("img")){const specific=project.assets.find(a=>a.id===img.dataset.assetId);if(specific)img.setAttribute("src",specific.url);else if(asset)img.setAttribute("src",asset.url);}
 return d.body.innerHTML;
}
export function frameDocument(p,project,css,{interactive=false,fontCSS="",portable=false}={}){
 const s=p.settings||{};
 const extra=(p.layout==="original"&&p.css?"":genericCSS)+':root{--blue:'+safeColor(s.accent,"#214BE1")+';} .xhs-card{width:1080px!important;height:1440px!important;margin:0!important;} body{margin:0!important;padding:0!important;background:transparent!important;} figure{overflow:hidden;} figure img{object-position:'+clamp(s.photoX??50,0,100)+'% '+clamp(s.photoY??50,0,100)+'%!important;transform:scale('+clamp(s.photoZoom??1,1,2)+');transform-origin:center;}'+(s.background?'.xhs-card{background:'+safeColor(s.background,"#F5F2EB")+'!important;}':"");
 const markup=pageMarkup(p,project);
 const nonce=crypto.randomUUID().replaceAll("-","");
 const policy=portable?'':'<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src \'self\' data:; font-src \'self\' data:; style-src \'unsafe-inline\'; script-src \'nonce-'+nonce+'\'; base-uri \'self\'; form-action \'none\'">';
 const script=interactive?'<script nonce="'+nonce+'">document.addEventListener("click",e=>{const t=e.target.closest("[data-copy]");if(t)parent.postMessage({type:"tuxu-select",id:t.dataset.copy},"'+location.origin+'")});document.fonts.ready.then(()=>parent.postMessage({type:"tuxu-ready"},"'+location.origin+'"));<\/script>':"";
 return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">'+policy+(!portable?'<base href="'+location.origin+'/">':"")+'<style>'+css+extra+sanitizeCSS(p.css||'')+fontCSS+' [data-copy]{cursor:'+(interactive?"text":"default")+'} '+(interactive?'[data-copy]:hover{outline:2px dashed #86a993;outline-offset:6px}.exporting [data-copy]{outline:none!important}':"")+'</style></head><body>'+markup+script+'</body></html>';
}
export const clamp=(n,a,b)=>Math.max(a,Math.min(b,Number(n)||a));
export const safeColor=(s,f)=>/^#[a-f\d]{6}$/i.test(s||"")?s:f;
function replaceStyledText(el,text){
 const walker=el.ownerDocument.createTreeWalker(el,NodeFilter.SHOW_TEXT),nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
 const old=nodes.map(n=>n.textContent).join(""),next=String(text);
 let start=0;while(start<old.length&&start<next.length&&old[start]===next[start])start++;
 let end=old.length,nextEnd=next.length;while(end>start&&nextEnd>start&&old[end-1]===next[nextEnd-1]){end--;nextEnd--;}
 if(!nodes.length||(start===0&&end===old.length)){
  el.textContent=next;
  if(/^H[1-3]$/.test(el.tagName)){el.style.fontSize=el.tagName==="H3"?"48px":"78px";el.style.lineHeight="1.35";}
  el.style.whiteSpace="pre-wrap";return;
 }
 let offset=0,inserted=false;
 for(let i=0;i<nodes.length;i++){
  const n=nodes[i],t=n.textContent,a=offset,b=a+t.length;offset=b;
  const isInsertion=!inserted&&((start>=a&&start<b)||(i===nodes.length-1&&start===b));
  if(b<=start&&!isInsertion)continue;
  if(a>=end&&!isInsertion)continue;
  const before=t.slice(0,Math.max(0,start-a)),after=t.slice(Math.max(0,end-a));
  n.textContent=before+(isInsertion?next.slice(start,nextEnd):"")+after;
  if(isInsertion)inserted=true;
 }
}
export function applyFontScale(doc,scale){
 const sizes=[...doc.querySelectorAll("[data-copy],[data-copy] *")].filter(el=>el.tagName!=="BR").map(el=>[el,parseFloat(doc.defaultView.getComputedStyle(el).fontSize)]);
 for(const [el,size]of sizes)if(size)el.style.fontSize=(size*scale)+"px";
}
export function auditPage(doc,p){
 const root=doc.querySelector(".xhs-card"),issues=[];
 if(!root)return [{severity:"error",message:"没有可用的页面。"}];
 const box=root.getBoundingClientRect(),marks=[...root.querySelectorAll("[data-copy]")];
 for(const c of p.copy){
  const el=marks.find(e=>e.dataset.copy===c.id);
  if(!el||clean(el.innerText)!==clean(c.text))issues.push({severity:"error",message:"文案缺失或与编辑内容不一致",id:c.id});
 }
 const walker=doc.createTreeWalker(root,NodeFilter.SHOW_TEXT),lines=[];
 while(walker.nextNode()){
  const n=walker.currentNode,e=n.parentElement;if(!n.textContent.trim())continue;
  const id=e.closest("[data-copy]")?.dataset.copy;if(!id)continue;
  const range=doc.createRange();range.selectNodeContents(n);
  for(const r of range.getClientRects()){
   if(!r.width||!r.height)continue;
   if(r.left<box.left-1||r.right>box.right+1||r.top<box.top-1||r.bottom>box.bottom+1)issues.push({severity:"error",message:"文字超出版面，请调整字号、版式或分页。",id});
   let a=e;
   while(a&&root.contains(a)){
    const s=doc.defaultView.getComputedStyle(a),b=a.getBoundingClientRect();
    if(/hidden|clip|auto|scroll/.test(s.overflowY)&&(r.top<b.top-1||r.bottom>b.bottom+1))issues.push({severity:"error",message:"文字被内部区域裁切。",id});
    a=a.parentElement;
   }
   lines.push({id,x:r.left,y:r.top,r:r.right,b:r.bottom});
  }
 }
 for(let a=0;a<lines.length;a++)for(let b=a+1;b<lines.length;b++){
  const x=lines[a],y=lines[b];if(x.id!==y.id&&Math.min(x.r,y.r)-Math.max(x.x,y.x)>2&&Math.min(x.b,y.b)-Math.max(x.y,y.y)>2)issues.push({severity:"error",message:"两处文字发生重叠。",id:x.id});
 }
 for(const img of root.querySelectorAll("img"))if(!img.complete||!img.naturalWidth)issues.push({severity:"error",message:"照片未加载，请重新选择。"});
 if(p.layout==="photo"&&!root.querySelector("img"))issues.push({severity:"error",message:"图文版式需要选择一张照片。"});
 const changed=p.copy.filter(c=>{const o=p.originalCopy.find(x=>x.id===c.id);return o&&clean(o.text)!==clean(c.text);}).length;
 if(changed)issues.push({severity:"info",message:"手动修改了"+changed+"处原文。"});
 return [...new Map(issues.map(x=>[x.message+(x.id||""),x])).values()];
}
export function routeSkills(p){
 const list=[["xiaohongshu-design","原文保真与主流程"],["xhs-poster-composition","当前页构图"],["xhs-design-polish","排版与导出检查"]];
 if(p.layout==="cover"||/封面/.test(p.label))list.splice(1,0,["xhs-cover-lab","封面重点"]);
 if(p.layout==="timeline"||/路径/.test(p.label))list.push(["baoyu-infographic","顺序与节点方法"]);
 if(p.photoAssetId)list.push(["xhs-reference-contract","真实素材与裁切"]);
 return list;
}
export function quickAdjustment(project,current,command){
 const target=command.match(/第\s*(\d+)\s*页/);const index=target?Number(target[1])-1:project.pages.findIndex(p=>p.id===current.id);
 const p=project.pages[index];if(!p)throw Error("找不到指定页面，请检查页码。");
 const scale=command.match(/(?:字号|字体).*?(放大|增大|加大|缩小|减小)\s*(\d+)?/);
 const photo=command.match(/(?:照片|图片).*?(放大|缩小)\s*(\d+)?\s*%?/);
 const colors=command.match(/(?:主色|强调色|标题).*?(蓝|绿|红|紫|黑)/);
 const layouts=Object.entries(LAYOUTS).find(([k,v])=>k!=="original"&&command.includes(v));
 if(scale){p.settings.fontScale=clamp((p.settings.fontScale||1)*(scale[1].includes("小")?.9:1.1),.75,1.3);}
 else if(photo){if(!p.photoAssetId&&!p.html.includes("<img"))throw Error("这一页没有照片，请先添加照片。");p.settings.photoZoom=clamp((p.settings.photoZoom||1)*(1+(photo[1]==="缩小"?-1:1)*Number(photo[2]||10)/100),1,2);}
 else if(colors){p.settings.accent=({蓝:"#214BE1",绿:"#3F6552",红:"#B44235",紫:"#665090",黑:"#252C33"})[colors[1]];}
 else if(layouts){p.layout=layouts[0];}
 else if(/照片.*(向上|上移)/.test(command)){p.settings.photoY=clamp((p.settings.photoY??50)-10,0,100);}
 else if(/照片.*(向下|下移)/.test(command)){p.settings.photoY=clamp((p.settings.photoY??50)+10,0,100);}
 else throw Error("这条要求需要AI设计服务。快捷调整支持字号、强调色、照片缩放和版式切换。");
 return {pageId:p.id,label:"快捷调整 · 第"+(index+1)+"页"};
}
export function validateProject(value){
 if(!value||value.schema!=="tuxu-project-v1"||!value.project||!Array.isArray(value.project.pages)||!value.project.pages.length||value.project.pages.length>20)throw Error("请选择由图序导出的项目文件。");
 const p=value.project;
 if(!Array.isArray(p.assets)||p.assets.length>100)throw Error("素材数据不完整。");
 const assetIds=new Map();p.assets=p.assets.map(a=>{
  if(!a||typeof a.url!=="string"||!(/^(assets\/photos\/|\/api\/files\/|data:image\/(png|jpeg|webp);base64,)/.test(a.url)))throw Error("素材格式不支持，请使用PNG、JPG或WebP。");
  const nextId=uid();assetIds.set(String(a.id),nextId);return {id:nextId,name:String(a.name||"照片").slice(0,120),url:a.url,generated:!!a.generated};
 });
 p.pages=p.pages.map(pg=>{
  if(!Array.isArray(pg.copy)||pg.copy.length>100||pg.copy.some(c=>typeof c.text!=="string"||c.text.length>15000))throw Error("页面文案格式不完整。");
  let html=sanitizeHTML(pg.html||"");for(const [a,b]of assetIds)html=html.replaceAll('data-asset-id="'+escape(a)+'"','data-asset-id="'+b+'"');
  return {...pg,id:uid(),photoAssetId:assetIds.get(pg.photoAssetId)||null,label:String(pg.label||"图文页面").slice(0,100),layout:LAYOUTS[pg.layout]?pg.layout:"editorial",html,css:sanitizeCSS(pg.css||""),settings:{accent:safeColor(pg.settings?.accent,"#214BE1"),fontScale:clamp(pg.settings?.fontScale||1,.75,1.3),photoZoom:clamp(pg.settings?.photoZoom||1,1,2),photoX:clamp(pg.settings?.photoX??50,0,100),photoY:clamp(pg.settings?.photoY??50,0,100)},copy:pg.copy.map(c=>({id:String(c.id),text:c.text})),originalCopy:Array.isArray(pg.originalCopy)?pg.originalCopy.map(c=>({id:String(c.id),text:String(c.text)})):clone(pg.copy)};
 });
 return {...p,id:uid(),name:String(p.name||"导入的作品").slice(0,100),history:[],redo:[],createdAt:Date.now(),updatedAt:Date.now()};
}
export const genericCSS=`
.generic{padding:76px;background:#F5F2EB;color:#142A57;display:flex;flex-direction:column;gap:46px}
.generic h1{font-size:78px;line-height:1.3;font-weight:900;letter-spacing:-1px}
.generic p{font-size:38px;line-height:1.65;white-space:pre-wrap}
.generic-body{display:flex;flex-direction:column;gap:27px}
.generic-cover h1{font-size:112px;line-height:1.24;color:var(--blue);padding:40px 0 36px;border-bottom:4px solid var(--blue)}
.generic-cover .generic-body p:first-child{font-size:46px;font-weight:700}
.generic-closing{background:#102654;color:white}
.generic-closing h1{color:#E5F29E;font-size:94px}
.generic-closing .generic-body p:last-child{background:#E5F29E;color:#142A57;padding:35px;margin-top:26px;font-size:44px;font-weight:700}
.generic-photo{margin:0 -76px;width:1080px;height:460px;flex:none}
.generic-photo img{width:100%;height:100%;object-fit:cover;display:block}
.generic-photo h1{font-size:70px}
.generic-list>h1{color:var(--blue)}
.generic-list .generic-list>div{padding:25px 0;border-bottom:2px solid #CBD3D0}
.generic-timeline{gap:44px;background:#EBEFD9}
.generic-timeline>h1{color:var(--blue)}
.generic-timeline .generic-timeline{display:flex;flex-direction:column;gap:32px;background:transparent}
.generic-step{display:flex;gap:28px;align-items:flex-start}
.generic-step i{font-style:normal;width:70px;height:70px;line-height:66px;text-align:center;border:2px solid var(--blue);border-radius:50%;flex:none;font-size:38px;font-weight:700;color:var(--blue)}
.generic-step p{padding-top:4px}
`;

