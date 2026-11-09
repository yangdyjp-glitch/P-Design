import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';
const {outputFiles}=await build({entryPoints:['server/artifacts.ts'],bundle:true,write:false,platform:'node',format:'esm'});
const {selectArtifacts,artifactBatches,transferArtifacts}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const file=(name,size=10)=>({path:'/workspace/outputs/'+name,size_bytes:size});
test('new designs avoid redundant font/archive delivery while legacy downloadable files remain available',()=>{
 const files=[file('result.json'),file('render-manifest.json'),file('image.png'),file('editable.html'),file('NotoSansSC-Regular.woff2',4e6),file('project.zip',17e6),file('OFL.txt')];
 assert.equal(selectArtifacts(files).length,6);
 assert.deepEqual(selectArtifacts(files,{sharedFonts:true}).map(f=>f.path.split('/').pop()),['render-manifest.json','image.png','editable.html','OFL.txt']);
 assert(!selectArtifacts([file('outside.exe'),{...file('image.png'),path:'/workspace/input/private.png'}]).length);
});
test('bounded copying preserves byte/file limits and keeps single-page audit evidence first',()=>{
 const files=[file('big.zip',20*1024*1024),file('second.zip',20*1024*1024),file('revision-after-phone.png'),file('page-revision-audit.json'),file('render-manifest.json')];
 const chosen=selectArtifacts(files,{pageRevision:true});assert.equal(chosen.length,4);assert.match(chosen[0].path,/render-manifest/);
 const batches=artifactBatches([file('one',7e6),file('two',7e6),file('three',2e6),file('big',20e6),file('small',1e6)]);
 assert.deepEqual(batches.map(batch=>batch.length),[1,2,1,1]);assert(batches.every(batch=>batch.length===1||batch.reduce((sum,a)=>sum+a.size_bytes,0)<=12*1024*1024));
 assert.equal(selectArtifacts(Array.from({length:30},(_,i)=>file(i+'.png'))).length,24);
});
test('small artifact copies overlap but never exceed two simultaneous downloads',async()=>{
 let current=0,maximum=0;
 const files=Array.from({length:5},(_,i)=>file(i+'.png'));
 const copied=await transferArtifacts(files,async a=>{current++;maximum=Math.max(maximum,current);await new Promise(resolve=>setTimeout(resolve,5));current--;return a.path;},async()=>assert.fail('unexpected rollback'));
 assert.equal(maximum,2);assert.deepEqual(copied,files.map(a=>a.path));
});
test('a failed concurrent batch waits for its partner and removes every completed copy',async()=>{
 const copied=[],rolled=[];
 await assert.rejects(transferArtifacts([file('one.png'),file('bad.png'),file('never.png')],async a=>{if(a.path.includes('bad'))throw Error('download failed');await new Promise(resolve=>setTimeout(resolve,5));copied.push(a.path);return a.path;},async path=>rolled.push(path)),/download failed/);
 assert.deepEqual(copied,[file('one.png').path]);assert.deepEqual(rolled,copied);
});
