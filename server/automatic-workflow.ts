export function automaticJob(job:{snapshot:string;kind:string}){
 const snapshot=JSON.parse(job.snapshot);
 return snapshot.workflow==='automatic'&&['design','revise'].includes(job.kind);
}
export function imageAllowed(job:{snapshot:string;kind:string}){
 const snapshot=JSON.parse(job.snapshot);
 return job.kind==='image'||automaticJob(job)&&!snapshot.repairOf;
}
export function repairAllowed(job:{snapshot:string;kind:string;result?:string|null}){
 if(!automaticJob(job)||JSON.parse(job.snapshot).repairOf)return false;
 const state=job.result?JSON.parse(job.result):{};
 return !(Number(state.repairAttempts)>0);
}
export function renderAudit(manifest:any,pageCount:number){
 if(!manifest||manifest.status!=='passed'||!Array.isArray(manifest.pages)||manifest.pages.length!==pageCount||!Array.isArray(manifest.issues)||manifest.issues.length||!Array.isArray(manifest.networkFailures)||manifest.networkFailures.length)throw Error('AI 渲染记录未通过完整性、页面数量或资源检查');
 return {status:'passed',pageCount,warnings:Array.isArray(manifest.warnings)?manifest.warnings.slice(0,20).map((w:any)=>String(typeof w==='string'?w:w.message||'存在渲染提示').slice(0,200)):[],checkedAt:new Date().toISOString()};
}
