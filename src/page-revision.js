// Versioned only for new single-page jobs; old saved jobs keep their original contract.
export function pageRevisionContract(scope,pages,prompt,parent){
 if(parent)return parent.pageRevision?structuredClone(parent.pageRevision):null;
 return scope==='page'&&pages.length===1?{version:1,pageId:pages[0].id,request:String(prompt).trim()}:null;
}
export function revisionReviewIssue(review,contract){
 if(!contract)return null;
 if(contract.version!==1||!review||review.pageId!==contract.pageId||review.request!==contract.request||!['updated','already_satisfied'].includes(review.outcome)||!Array.isArray(review.checks)||!review.checks.length||review.checks.length>12)return 'AI 缺少针对本图本次要求的逐项复核';
 for(const check of review.checks){
  if(!check||!['met','unmet'].includes(check.status)||['requirement','change','evidence'].some(key=>typeof check[key]!=='string'||!check[key].trim()||check[key].length>3000))return 'AI 的本图要求复核记录不完整';
  if(check.status!=='met')return '本图仍有要求未落实：'+check.requirement.slice(0,100);
 }
 return null;
}
export function revisionMeasurementIssue(measurement,contract,review){
 if(!contract)return null;
 if(!measurement||measurement.version!==1||measurement.pageId!==contract.pageId||measurement.request!==contract.request||measurement.status!=='passed'||measurement.after?.width!==1080||measurement.after?.height!==1440)return 'AI 缺少本图修改前后的实际画面对照';
 if(!measurement.baselineAvailable){
  if(review.outcome==='already_satisfied')return '没有原图对照，不能判定本图已经满足要求';
  return null;
 }
 const diff=measurement.visualDifference;
 if(measurement.before?.width!==1080||measurement.before?.height!==1440||!diff||!Number.isInteger(diff.changedPixels)||diff.changedPixels<0||diff.changedPixels>1080*1440||diff.totalPixels!==1080*1440)return '本图修改前后的画面对照记录无效';
 if(review.outcome==='updated'&&diff.changedPixels===0)return '本图画面没有实际变化，不能报告修改完成';
 if(review.outcome==='already_satisfied'&&diff.changedPixels!==0)return '原图已满足要求的结论与实际画面变化不一致';
 return null;
}
export function lastPageRevision(jobs,projectId,pageId){
 const job=jobs?.find(job=>job.projectId===projectId&&job.scope==='page'&&job.pageIds?.length===1&&job.pageIds[0]===pageId);
 if(!job)return null;
 const parent=job.repairOf?jobs.find(parent=>parent.id===job.repairOf):null;
 return {job,request:job.result?.revisionReview?.request||parent?.result?.revisionReview?.request||parent?.prompt||job.prompt};
}
