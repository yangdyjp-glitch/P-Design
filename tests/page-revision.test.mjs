import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';
import {pageRevisionContract,revisionReviewIssue,revisionMeasurementIssue,lastPageRevision} from '../src/page-revision.js';
import {automaticMessage} from '../src/ai-workflow.js';
async function bundle(entry){const {outputFiles}=await build({entryPoints:[entry],bundle:true,write:false,platform:'node',format:'esm'});return import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));}
const {validateDesignResult}=await bundle('server/design-result.ts');
const {renderAudit}=await bundle('server/automatic-workflow.ts');
const page={id:'page-a',copy:[{id:'copy-a',text:'本图正文'}],html:'<section class="xhs-card"><p data-copy="copy-a">本图正文</p></section>',css:'.xhs-card p{font-size:40px}',layout:'original',photoAssetId:null};
const contract=pageRevisionContract('page',[page],'正文增大到48像素，并保持左对齐');
const review={pageId:page.id,request:contract.request,outcome:'updated',checks:[{requirement:'正文增大到48像素并左对齐',status:'met',change:'正文从40px调至48px，保持左对齐。',evidence:'修改前后实际渲染正文计算字号分别为40px和48px；手机预览无越界。'}]};
const job={kind:'revise',skill_ids:'[]',snapshot:JSON.stringify({workflow:'automatic',scope:'page',pages:[page],assets:[],pageRevision:contract})};
const raw={summary:'本图已调整',report:'实际查看前后画面',pages:[{...page,css:'.xhs-card p{font-size:48px}'}],revisionReview:review};
const measurement={version:1,pageId:page.id,request:contract.request,status:'passed',baselineAvailable:true,before:{width:1080,height:1440},after:{width:1080,height:1440},visualDifference:{changedPixels:100,totalPixels:1080*1440}};
const manifest={status:'passed',pages:[{id:page.id}],issues:[],networkFailures:[],pageRevision:measurement};

test('page revision freezes the submitted request and preserves the original contract during repair',()=>{
 assert.equal(pageRevisionContract('project',[page],'全套设计'),null);
 assert.deepEqual(contract,{version:1,pageId:page.id,request:'正文增大到48像素，并保持左对齐'});
 const original={pageRevision:contract};const child=pageRevisionContract('page',[page],'自动纠错提示',original);
 assert.deepEqual(child,contract);child.request='不能覆盖父任务';assert.notEqual(child.request,contract.request);
 assert.equal(pageRevisionContract('page',[page],'旧任务修正',{scope:'page'}),null);
});
test('passing copy and layout validation cannot substitute for checking the current page request',()=>{
 assert.equal(validateDesignResult(raw,job).revisionReview.request,contract.request);
 for(const invalid of [null,{...review,pageId:'page-b'},{...review,request:'旧要求'},{...review,checks:[]},{...review,checks:[{...review.checks[0],evidence:''}]},{...review,checks:[{...review.checks[0],status:'unmet'}]}])assert.throws(()=>validateDesignResult({...raw,revisionReview:invalid},job),error=>error.code==='PAGE_REQUIREMENTS');
 assert.throws(()=>validateDesignResult({...raw,pages:[page]},job),error=>error.code==='PAGE_UNCHANGED');
 assert.equal(revisionReviewIssue(review,contract),null);
});
test('actual unchanged pixels cannot be reported as a completed visual modification',()=>{
 const policy={pageRevision:contract,revisionReview:review};
 assert.equal(renderAudit(manifest,1,raw.pages,[],policy).status,'passed');
 for(const invalid of [undefined,{...measurement,request:'旧要求'},{...measurement,pageId:'page-b'},{...measurement,visualDifference:{changedPixels:0,totalPixels:1080*1440}},{...measurement,visualDifference:{changedPixels:1080*1440+1,totalPixels:1080*1440}}])assert.throws(()=>renderAudit({...manifest,pageRevision:invalid},1,raw.pages,[],policy));
 assert.equal(revisionMeasurementIssue(measurement,contract,review),null);
});
test('an already satisfied request is allowed only with honest unchanged rendering feedback',()=>{
 const unchanged={...review,outcome:'already_satisfied'},noChange={...measurement,visualDifference:{changedPixels:0,totalPixels:1080*1440}};
 assert.equal(validateDesignResult({...raw,pages:[page],revisionReview:unchanged},job).revisionReview.outcome,'already_satisfied');
 assert.equal(revisionMeasurementIssue(noChange,contract,unchanged),null);
 assert.match(revisionMeasurementIssue(measurement,contract,unchanged),/不一致/);
 assert.match(revisionMeasurementIssue({...noChange,baselineAvailable:false},contract,unchanged),/没有原图/);
 const applied={id:'job-a',scope:'page',pageIds:[page.id],status:'completed',result:{revisionReview:unchanged}},project={pages:[{...page,lastAIJobId:applied.id}]};
 assert.match(automaticMessage(applied,project),/原本已满足.*未改动/);
});
test('legacy jobs remain readable and whole-set work never impersonates a sent single-page request',()=>{
 const legacy={...job,snapshot:JSON.stringify({workflow:'automatic',scope:'page',pages:[page],assets:[]})};
 const accepted=validateDesignResult({...raw,revisionReview:undefined},legacy);assert.equal(accepted.revisionReview,undefined);
 const original={id:'page-job',projectId:'project-a',scope:'page',pageIds:[page.id],prompt:'本图正文更清晰'},child={...original,id:'child',repairOf:original.id,prompt:'修正网页检查'},whole={...original,id:'whole',scope:'project',prompt:'整套重做'},other={...original,id:'other',projectId:'project-b'};
 assert.deepEqual(lastPageRevision([whole,other,child,original],'project-a',page.id),{job:child,request:original.prompt});
 assert.equal(lastPageRevision([whole,other,child,original],'project-a','page-b'),null);
 assert.equal(revisionMeasurementIssue(undefined,undefined,undefined),null);
});
