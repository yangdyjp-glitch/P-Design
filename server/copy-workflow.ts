import {runtime,getProject,fail,json,readJSON,validateProject} from './core';
import {copyPolicy,copyHash,sourceText} from '../src/copy-workflow.js';
import {parseManuscript} from '../src/engine.js';
import {COPY_SKILLS} from '../src/copy-workflow.js';

export async function createCopyJob(uid:string,body:any){
 const stored=await getProject(uid,body.projectId),project=JSON.parse(stored.data),flow=project.copyFlow;
 if(Number(body.revision)!==stored.revision)fail(409,'文案已有新修改，请保存后重新优化。');
 if(flow?.version!==1||flow.phase!=='copy')fail(409,'请从文案准备步骤开始优化。');
 const original=sourceText(flow.sourceText);if(!original||original.length>60000)fail(400,'请输入需要优化的文案，最多六万字。');
 let pages;try{pages=parseManuscript(original,{preserveText:true});}catch(error){fail(400,(error as Error).message);}
 const manifest=JSON.parse(runtime().SKILL_FILES_JSON||'{}');if(COPY_SKILLS.some(id=>!manifest[id]?.fileId))fail(503,'文案技能尚未完整就绪。');
 const snapshot={workflow:'copy',scope:'project',pages,assets:[],imageMode:'none',paginationMode:copyPolicy(original).paginationMode,sourceText:original,sourceHash:await copyHash(original),copyOptimizationPolicy:copyPolicy(original)};
 const now=Date.now(),day=Math.floor(now/86400000)*86400000,id=crypto.randomUUID();
 const [inserted]=await runtime().DB.batch([runtime().DB.prepare("INSERT INTO jobs(id,user_id,project_id,request_id,kind,prompt,skill_ids,snapshot,base_revision,status,provider_files,lease_until,created_at,updated_at) SELECT ?,?,?,?,'copy',?,?,?,?,'queued','[]',0,?,? WHERE (SELECT count(*) FROM jobs WHERE user_id=? AND created_at>=?)<10 AND (SELECT count(*) FROM jobs WHERE created_at>=?)<60 AND (SELECT count(*) FROM jobs WHERE user_id=? AND status IN ('queued','starting','running','generating'))<1 AND (SELECT count(*) FROM jobs WHERE status IN ('queued','starting','running','generating'))<6 ON CONFLICT(user_id,request_id) DO NOTHING").bind(id,uid,project.id,body.requestId,'优化文案并核对原文事实、信息完整性与分页，等待用户确认后再设计。',JSON.stringify(COPY_SKILLS),JSON.stringify(snapshot),stored.revision,now,now,uid,day,day,uid)]);
 if(!inserted.meta.changes){const repeated=await runtime().DB.prepare('SELECT * FROM jobs WHERE user_id=? AND request_id=?').bind(uid,body.requestId).first<any>();if(repeated)return repeated;fail(429,'当前已有任务在运行，或今日任务额度已用完。');}
 return await runtime().DB.prepare('SELECT * FROM jobs WHERE id=? AND user_id=?').bind(id,uid).first<any>();
}
export async function confirmProjectCopy(uid:string,id:string,request:Request){
 const body=await readJSON(request),stored=await getProject(uid,id),project=JSON.parse(stored.data),flow=project.copyFlow;
 if(Number(body.revision)!==stored.revision)fail(409,'文案已有其他修改，请保存后重新确认。');
 if(!flow||flow.phase!=='copy'||typeof body.jobId!=='string'||typeof body.text!=='string'||!body.text.trim()||body.text.length>60000)fail(400,'请先完成文案优化，再确认稿件。');
 const job=await runtime().DB.prepare("SELECT * FROM jobs WHERE id=? AND user_id=? AND project_id=? AND kind='copy'").bind(body.jobId,uid,id).first<any>();
 if(!job||job.status!=='completed')fail(409,'文案优化及独立审校尚未完成。');const result=JSON.parse(job.result),snapshot=JSON.parse(job.snapshot),sourceHash=await copyHash(flow.sourceText);
 if(sourceHash!==snapshot.sourceHash||result.copyReview?.status!=='passed'||result.copyReview?.independent!==true||result.copyReview?.jobId!==job.id||result.copyReview?.sourceHash!==sourceHash||result.copyReview?.manuscriptHash!==await copyHash(result.manuscript))fail(409,'原稿已变化，或文案审校未通过，请重新优化。');
 let pages;try{pages=parseManuscript(body.text,{preserveText:true});}catch(error){fail(400,(error as Error).message);}
 if(snapshot.copyOptimizationPolicy.paginationMode==='fixed'&&pages!.length!==snapshot.copyOptimizationPolicy.sourcePages)fail(400,'明确分页的原稿需要保留原页数，请逐页编辑确认稿。');
 const now=Date.now();project.pages=pages;project.paginationMode='fixed';project.name=pages![0].label.slice(0,80)||project.name;project.updatedAt=now;project.copyFlow={...flow,phase:'assets',draftText:sourceText(body.text),jobId:job.id,proposalJobId:job.id,confirmation:{jobId:job.id,sourceHash,manuscriptHash:await copyHash(body.text),confirmedAt:now,manuallyEdited:sourceText(body.text)!==sourceText(result.manuscript)}};
 const data=validateProject(project),saved=await runtime().DB.prepare('UPDATE projects SET name=?,data=?,revision=revision+1,updated_at=? WHERE user_id=? AND id=? AND revision=?').bind(data.name,JSON.stringify(data),now,uid,id,stored.revision).run();if(!saved.meta.changes)fail(409,'项目已在其他窗口更新，请重新载入。');return json({project:{...data,cloudRevision:stored.revision+1},revision:stored.revision+1});
}
