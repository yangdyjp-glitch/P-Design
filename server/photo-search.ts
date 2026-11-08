import {api,runtime,uploadProviderFile,imageMime} from './core';
import {assetMetadata} from './asset-metadata';
import {Buffer} from 'node:buffer';

const IMAGE_HOSTS=new Set(['images.unsplash.com','images.pexels.com','cdn.pixabay.com','upload.wikimedia.org']);
const SOURCE_HOSTS=['unsplash.com','pexels.com','pixabay.com','commons.wikimedia.org','wikipedia.org'];
export function publicPhotoURL(value:unknown,image=false):string|null{
 if(typeof value!=='string'||value.length>3000)return null;
 try{const url=new URL(value),host=url.hostname.toLowerCase();if(url.protocol!=='https:'||url.username||url.password||url.port&&url.port!=='443')return null;
  if(image?!IMAGE_HOSTS.has(host):!SOURCE_HOSTS.some(domain=>host===domain||host==='www.'+domain||domain==='wikipedia.org'&&/^[a-z-]+\.wikipedia\.org$/.test(host)))return null;
  return url.href;
 }catch{return null;}
}
export function photoCandidates(response:any){
 const found:any[]=[];
 const add=(image:unknown,source:unknown,caption:unknown)=>{const imageUrl=publicPhotoURL(image,true),sourceUrl=publicPhotoURL(source);if(imageUrl&&sourceUrl&&!found.some(item=>item.imageUrl===imageUrl))found.push({imageUrl,sourceUrl,name:String(caption||'网络实景配图').slice(0,110)});};
 for(const call of response.output||[])if(call.type==='web_search_call'&&call.status==='completed')for(const result of call.results||[]){
  if(result.type==='image_result')add(result.image_url,result.source_website_url,result.caption);
 }
 // Some searches return source-page results instead of image_result items. Accept only URL pairs actually visited/cited by the search tool.
 const verified=new Set<string>(),texts:string[]=[];
 for(const item of response.output||[]){
  if(item.type==='web_search_call'){if(item.action?.url)verified.add(item.action.url);for(const source of item.action?.sources||[])if(source.url)verified.add(source.url);}
  for(const content of item.content||[]){if(content.type==='output_text'&&typeof content.text==='string')texts.push(content.text);for(const annotation of content.annotations||[])if(annotation.type==='url_citation'&&annotation.url)verified.add(annotation.url);}
 }
 const witnessed=(image:unknown,source:unknown,caption:unknown)=>{if(typeof image==='string'&&typeof source==='string'&&verified.has(image)&&verified.has(source))add(image,source,caption);};
 for(const text of texts){
  try{const data=JSON.parse(text.match(/\{[\s\S]*\}/)?.[0]||'null');for(const photo of data?.photos||[])witnessed(photo.image_url,photo.source_website_url,photo.caption);}catch{}
  for(const line of text.split('\n')){const urls=line.match(/https:\/\/[^\s<>"\]\)]+/g)||[],images=urls.filter(url=>publicPhotoURL(url,true)),sources=urls.filter(url=>publicPhotoURL(url));for(const image of images)for(const source of sources)witnessed(image,source,line.split('|')[1]?.replace(/[*_]/g,'').trim());}
 }
 return found.slice(0,12);
}
export function webPhotosAllowed(job:{kind:string;snapshot:string}){const snapshot=JSON.parse(job.snapshot);return snapshot.allowWebImages===true&&!snapshot.repairOf&&['design','revise','cover','template'].includes(job.kind);}
const save=async(job:any,state:any)=>{job.search_state=JSON.stringify(state);await runtime().DB.prepare('UPDATE jobs SET search_state=?,updated_at=? WHERE id=?').bind(job.search_state,Date.now(),job.id).run();};
async function toolResult(job:any,state:any,photos:any[],error?:string,persist=true){
 if(photos.length)await api('/agents/environments/'+job.environment_id+'/files',{method:'POST',idempotencyKey:job.id+'-web-photo-metadata',body:{type:'inline',data:Buffer.from(JSON.stringify({assets:photos.map(photo=>({...photo,localPath:photo.path}))})).toString('base64'),path:'/workspace/input/web-photos.json'}});
 await api('/agents/sessions/'+job.session_id+'/events',{method:'POST',idempotencyKey:job.id+'-photos-'+state.callId,body:{events:[{type:'agent.session.input.tool_result',turn_id:state.turnId,call_id:state.callId,success:photos.length>0,...(photos.length?{output:JSON.stringify({photos,instruction:'Inspect these actual files before use. They are web reference photos, not evidence of this user’s facilities, people or services. Use img data-asset-id with the supplied assetId. Web photos are exempt from the uploaded-photo 20% cropping cap. Cite each used source.'})}:{error:error||'No usable real photographs were retrieved. Finish honestly with existing assets or a text/vector layout; do not invent a photograph.'})}]}});
 if(persist)await save(job,{...state,phase:'done'});
}
export async function startPhotoSearch(job:any,call:any){
 let args=call.arguments;try{if(typeof args==='string')args=JSON.parse(args);}catch{args=null;}
 const state={callId:call.call_id,turnId:call.turn_id};
 if(!webPhotosAllowed(job)||!args||typeof args.query!=='string'||!args.query.trim()||args.query.length>1500||args.count!==undefined&&(!Number.isInteger(args.count)||args.count<1||args.count>4)){await toolResult(job,state,[],'Web image search is not enabled for this job, or its query/count is invalid.',false);return;}
 if(job.search_state){const previous=JSON.parse(job.search_state);if(previous.callId!==call.call_id)await api('/agents/sessions/'+job.session_id+'/events',{method:'POST',idempotencyKey:job.id+'-photos-limit-'+call.call_id,body:{events:[{type:'agent.session.input.tool_result',turn_id:call.turn_id,call_id:call.call_id,success:false,error:'One photo search is available per design job. Reuse the already retrieved photos.'}]}});return;}
 const response:any=await api('/responses',{method:'POST',idempotencyKey:job.id+'-photo-search',body:{model:runtime().AGENT_MODEL||'gpt-6-astra',reasoning:{effort:'low'},background:true,store:true,tools:[{type:'web_search',search_content_types:['image','text'],image_settings:{max_results:8,caption:true},filters:{allowed_domains:['commons.wikimedia.org','unsplash.com','pexels.com','pixabay.com']}}],tool_choice:'required',include:['web_search_call.results','web_search_call.action.sources'],input:'Find relevant real photographic images for a Xiaohongshu visual design. Prefer actual scenes, locations, objects and documentary photography, with useful resolution. Exclude illustrations, AI-generated images, screenshots, collages, text-heavy posters and obvious watermarks. Do not infer they depict the user or the user’s actual team/facilities. Use image search. If image results are unavailable, search the source webpages and open the actual original photographs as well as their webpages. Return at least '+(args.count||3)+' candidates as a JSON object {"photos":[{"image_url":"canonical original image URL","source_website_url":"actual webpage","caption":"short caption"}]}. Both URLs in each pair MUST be actually visited or cited tool sources: cite both original image and source webpage; never guess or invent URLs. Subject: '+args.query,max_output_tokens:2400}});
 await save(job,{...state,responseId:response.id,phase:'pending',count:args.count||3,assets:[],next:0});
}
export async function downloadPhoto(initialURL:string){
 let url=publicPhotoURL(initialURL,true);if(!url)throw Error('unsupported photo URL');
 for(let redirects=0;redirects<4;redirects++){
  const response:Response=await fetch(url,{redirect:'manual',headers:{Accept:'image/jpeg,image/png,image/webp','User-Agent':'TuXuDesign/0.4 (+https://p-design.up.railway.app)'},signal:AbortSignal.timeout(12000)});
  if([301,302,303,307,308].includes(response.status)){await response.body?.cancel();const redirectTarget:string|null=response.headers.get('location');url=redirectTarget?publicPhotoURL(new URL(redirectTarget,url).href,true):null;if(!url)throw Error('unsupported photo redirect');continue;}
  if(!response.ok){await response.body?.cancel();throw Error('photo download failed');}
  if(Number(response.headers.get('content-length'))>8*1024*1024){await response.body?.cancel();throw Error('photo exceeds size limit');}
  const reader=response.body?.getReader();if(!reader)throw Error('empty photo');const chunks:Uint8Array[]=[];let size=0;
  try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>8*1024*1024)throw Error('photo exceeds size limit');chunks.push(part.value);}}catch(error){await reader.cancel().catch(()=>{});throw error;}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  const mime=imageMime(bytes);if(!mime)throw Error('photo is not PNG, JPG or WebP');return {bytes,mime,imageUrl:url};
 }
 throw Error('too many photo redirects');
}
export async function advancePhotoSearch(job:any){
 const e=runtime(),state=JSON.parse(job.search_state);if(state.phase==='done')return false;
 if(state.phase==='pending'){
  const response:any=await api('/responses/'+state.responseId);
  if(['failed','cancelled','incomplete'].includes(response.status)){await toolResult(job,state,[],'Photo search did not finish. Continue with existing assets or text/vector design and report this limitation.');return true;}
  if(response.status!=='completed')return true;
  const candidates=photoCandidates(response);await save(job,{...state,phase:'downloading',candidates});return true;
 }
 if(state.phase==='attaching'){
  const asset=state.attaching;
  if(!asset.fileId){const object=await e.BUCKET.get(asset.objectKey);if(!object)throw Error('Searched photo file unavailable');asset.fileId=await uploadProviderFile(await object.arrayBuffer(),asset.id+asset.extension,asset.mime);const files=[...new Set([...JSON.parse(job.provider_files||'[]'),asset.fileId])];job.provider_files=JSON.stringify(files);await e.DB.prepare('UPDATE jobs SET provider_files=? WHERE id=?').bind(job.provider_files,job.id).run();await save(job,state);}
  await api('/agents/environments/'+job.environment_id+'/files',{method:'POST',idempotencyKey:job.id+'-attach-'+asset.id,body:{type:'file_id',file_id:asset.fileId,path:asset.localPath}});
  const row=await e.DB.prepare('SELECT * FROM assets WHERE id=? AND user_id=? AND project_id=?').bind(asset.id,job.user_id,job.project_id).first<any>(),metadata=assetMetadata(row);
  const snapshot=JSON.parse(job.snapshot);if(!snapshot.assets.some((item:any)=>item.id===asset.id))snapshot.assets.push({...metadata,localPath:asset.localPath,loaded:true});job.snapshot=JSON.stringify(snapshot);await e.DB.prepare('UPDATE jobs SET snapshot=? WHERE id=?').bind(job.snapshot,job.id).run();
  state.assets.push({...metadata,assetId:asset.id,path:asset.localPath});delete state.attaching;state.phase='downloading';await save(job,state);return true;
 }
 if(state.assets.length>=state.count||state.next>=state.candidates.length){await toolResult(job,state,state.assets);return true;}
 const candidate=state.candidates[state.next],index=state.next++,id='web-'+job.id+'-'+index,objectKey=job.user_id+'/web/'+id;
 const usage=await e.DB.prepare('SELECT count(*) AS count,coalesce(sum(size),0) AS bytes,sum(CASE WHEN project_id=? THEN 1 ELSE 0 END) AS projectCount FROM assets WHERE user_id=?').bind(job.project_id,job.user_id).first<any>();
 if(usage.count>=400||usage.bytes>342*1024*1024||usage.projectCount>=100){state.next=state.candidates.length;await save(job,state);return true;}
 try{
  let row=await e.DB.prepare('SELECT * FROM assets WHERE id=? AND user_id=? AND project_id=?').bind(id,job.user_id,job.project_id).first<any>();
  if(!row){const photo=await downloadPhoto(candidate.imageUrl);await e.BUCKET.put(objectKey,photo.bytes,{httpMetadata:{contentType:photo.mime}});try{await e.DB.prepare("INSERT INTO assets(id,user_id,project_id,object_key,name,mime,size,generated,source,source_url,image_url,created_at) VALUES(?,?,?,?,?,?,?,0,'web',?,?,?)").bind(id,job.user_id,job.project_id,objectKey,candidate.name,photo.mime,photo.bytes.length,candidate.sourceUrl,photo.imageUrl,Date.now()).run();}catch(error){await e.BUCKET.delete(objectKey);throw error;}row={mime:photo.mime};}
  const extension=row.mime==='image/png'?'.png':row.mime==='image/webp'?'.webp':'.jpg';state.phase='attaching';state.attaching={id,objectKey,extension,mime:row.mime,localPath:'/workspace/input/'+id+extension};
 }catch{state.downloadFailures=(state.downloadFailures||0)+1;}
 await save(job,state);return true;
}
export async function cleanupPhotoSearch(job:any){if(!job.search_state)return;const state=JSON.parse(job.search_state);if(!state.responseId)return;if(state.phase==='pending')await api('/responses/'+state.responseId+'/cancel',{method:'POST'}).catch(()=>{});await api('/responses/'+state.responseId,{method:'DELETE'}).catch(()=>{});}
