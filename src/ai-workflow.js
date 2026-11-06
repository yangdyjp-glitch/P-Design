export function canApplyAutomatic(job,project){
 return !!project&&job.projectId===project.id&&!project._cloudDirty&&!project._syncConflict&&project.cloudRevision===job.baseRevision;
}
export function hasAuditErrors(reports){return reports.some(page=>page.issues.some(issue=>issue.severity==='error'));}
export function automaticMessage(job,project){
 if(project?._aiState&&project._aiState.jobId===job?.id)return project._aiState.message;
 if(!job)return '文案与素材准备好后，交给 AI 完成设计和检查。';
 if(job.status==='queued'||job.status==='starting')return '正在准备设计，文案已保留。';
 if(job.status==='running'||job.status==='generating')return job.result?.repairing?'AI 正在自动修正检查发现的问题。':'AI 正在判断视觉方案、制作画面并自动检查。';
 if(job.status==='failed')return '本轮设计未完成，文案仍已保留，可稍后重试。';
 if(project?.lastAIJobId===job.id)return '设计已呈现，AI 渲染检查与网页检查均已通过。';
 return '方案已保留；有新文案时可让 AI 重新设计。';
}
