import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';
import {sanitizeCSS} from '../src/engine.js';
import {styleIssue} from '../src/style-safety.js';

const {outputFiles}=await build({entryPoints:['server/design-result.ts'],bundle:true,write:false,platform:'node',format:'esm'});
const {validateDesignResult,DesignValidationError}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const copy=[{id:'title-1',text:'周末，去公园走走'},{id:'body-1',text:'给自己 30 分钟，看树、看风、看天空。'}];
const job={kind:'design',skill_ids:JSON.stringify(['xiaohongshu-design','xhs-poster-composition']),snapshot:JSON.stringify({pages:[{id:'page-1',copy}],assets:[]})};
const html='<section class="xhs-card"><h1 data-copy="title-1">周末，去公园走走</h1><p data-copy="body-1">给自己 30 分钟，看树、看风、看天空。</p></section>';
const result=(change={})=>({summary:'已设计',report:'按原文排版',usedSkills:['xiaohongshu-design'],pages:[{id:'page-1',html,css:'.xhs-card > h1 { font-size: 96px; } .xhs-card > p { line-height: 1.6; }',...change}]});
function denied(raw,code,pattern){assert.throws(()=>validateDesignResult(raw,job),error=>error instanceof DesignValidationError&&error.code===code&&pattern.test(error.message));}

test('ordinary CSS child combinators pass both backend validation and browser preview/export',()=>{
 const raw=result(),css=raw.pages[0].css;
 assert.match(css,/>/);
 assert.equal(validateDesignResult(raw,job).pages[0].css,css);
 assert.equal(sanitizeCSS(css),css);
 assert.equal(sanitizeCSS('.xhs-card > p::after { content: ">"; }'),'.xhs-card > p::after { content: ">"; }');
});
test('vector namespace does not count as an external resource',()=>{
 const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M1 1 L9 9" stroke="currentColor" /></svg>';
 assert.equal(validateDesignResult(result({html:html.replace('</section>',svg+'</section>')}),job).pages.length,1);
 denied(result({html:html.replace('</section>','<img src="https://untrusted.test/pixel.png"></section>')}),'HTML_RESOURCE',/第 1 页/);
});
test('style rejection explains the page and cause while blocking external and active CSS',()=>{
 for(const [css,code]of [
  ['.xhs-card{color:red}</style><script>alert(1)</script>','CSS_MARKUP'],
  ['@import "https://untrusted.test/font.css";','CSS_IMPORT'],
  ['.xhs-card{background:url(/api/files/photo)}','CSS_URL'],
  ['@font-face{font-family:test;src:local(test)}','CSS_FONT'],
  ['.xhs-card{width:expression(alert(1))}','CSS_ACTIVE'],
  ['.xhs-card{background:u\\72l(/api/files/photo)}','CSS_URL'],
  ['.xhs-card{background:u/**/rl(/api/files/photo)}','CSS_URL'],
  ['.xhs-card{behavior:evil}','CSS_ACTIVE'],
 ]){
  assert.equal(styleIssue(css).code,code);
  assert.throws(()=>sanitizeCSS(css));
  denied(result({css}),code,/第 1 页/);
 }
});
test('script, embedded styles, events and data resources remain rejected with a specific reason',()=>{
 for(const [addition,code,pattern]of [
  ['<script>alert(1)</script>','HTML_TAG',/script/],
  ['<style>.xhs-card{color:red}</style>','HTML_TAG',/独立样式字段/],
  ['<img src="/api/files/photo" onerror="alert(1)">','HTML_EVENT',/交互代码/],
  ['<img src="data:image/png;base64,aGVsbG8=">','HTML_RESOURCE',/内嵌资源/],
  ['<div style="background:url(/api/files/photo)"></div>','CSS_URL',/局部样式/],
 ])denied(result({html:html.replace('</section>',addition+'</section>')}),code,pattern);
});
test('copy IDs, exact characters and page scope still protect existing work',()=>{
 denied(result({html:html.replace('30 分钟','40 分钟')}),'LOCKED_COPY',/锁定原文/);
 denied(result({html:html.replace('data-copy="title-1"','class="title"')}),'LOCKED_COPY',/锁定原文/);
 denied(result({html:html.replace('</section>','<p data-copy="body-1">重复</p></section>')}),'LOCKED_COPY',/重复/);
 denied(result({id:'page-not-selected'}),'PAGE_SCOPE',/范围外/);
 const duplicate=result();duplicate.pages.push({...duplicate.pages[0]});denied(duplicate,'PAGE_DUPLICATE',/重复/);
 const wrapped=result({html:html.replace('周末，去公园走走','周末，<br>去公园走走')});
 assert.equal(validateDesignResult(wrapped,job).pages.length,1);
});
test('writing tasks cannot modify the existing layout and unselected skills are not credited',()=>{
 assert.throws(()=>validateDesignResult(result(),{...job,kind:'write'}),error=>error.code==='ANALYSIS_SCOPE');
 const raw={...result(),pages:[],manuscript:'周末散步',usedSkills:['xiaohongshu-design','invented-skill']};
 const checked=validateDesignResult(raw,{...job,kind:'write'});
 assert.deepEqual(checked.pages,[]);
 assert.deepEqual(checked.usedSkills,['xiaohongshu-design']);
 assert.equal(checked.manuscript,'周末散步');
});
