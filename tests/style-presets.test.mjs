import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';
import {STYLE_PRESETS,resolveStylePreset,validateStylePresetId,jobStylePreset} from '../src/style-presets.js';

const confirmed=[{id:'preset-1',name:'测试专用预案',version:2,summary:'仅用于验证',direction:'使用已确认的测试风格。'}];

test('three independent, stable preset slots require confirmed directions before selection',()=>{
 assert.deepEqual(STYLE_PRESETS.map(preset=>preset.id),['preset-1','preset-2','preset-3']);
 const pending=STYLE_PRESETS.map(preset=>({...preset,direction:''}));
 for(const preset of pending){assert.equal(resolveStylePreset(preset.id,pending),null);assert.throws(()=>validateStylePresetId(preset.id,pending),/尚未设定/);}
 for(const value of [undefined,null,''])assert.equal(validateStylePresetId(value),null);
 for(const value of ['not-a-preset',{},1])assert.throws(()=>validateStylePresetId(value),/不存在/);
});

test('configured recipes resolve to independent versioned copies and do not mix slots',()=>{
 assert.equal(validateStylePresetId('preset-1',confirmed),'preset-1');
 const resolved=resolveStylePreset('preset-1',confirmed);assert.deepEqual(resolved,confirmed[0]);
 resolved.direction='changed locally';assert.equal(confirmed[0].direction,'使用已确认的测试风格。');
 assert.equal(resolveStylePreset('preset-2',confirmed),null);
});

test('jobs ignore client-supplied recipe contents and corrections keep the original saved recipe',()=>{
 const project={stylePresetId:null,stylePreset:{direction:'untrusted client recipe'}};
 assert.equal(jobStylePreset(project),null);
 const original={stylePreset:confirmed[0]},child=jobStylePreset(project,original);
 assert.deepEqual(child,confirmed[0]);child.direction='changed child';assert.equal(original.stylePreset.direction,confirmed[0].direction);
 assert.equal(jobStylePreset(project,{}),null);
 assert.equal(jobStylePreset(project,{stylePreset:null}),null);
});

const environment={name:'isolated-core',setup(build){
 build.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'core-test'}));
 build.onResolve({filter:/chatgpt-auth$/},()=>({path:'auth',namespace:'core-test'}));
 build.onLoad({filter:/.*/,namespace:'core-test'},args=>({loader:'js',contents:args.path==='env'?'export const env={};':'export async function getChatGPTUser(){return null;}'}));
}};
const {outputFiles}=await build({entryPoints:['server/core.ts'],bundle:true,write:false,platform:'node',format:'esm',plugins:[environment]});
const {validateProject}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const project={id:'test-project',name:'预案验证',pages:[{id:'test-page',copy:[{id:'title',text:'原文保持不变'}]}],assets:[]};

test('server preserves older projects while rejecting unavailable or forged preset selections',()=>{
 const old=validateProject(project);assert.equal(old.stylePresetId,null);assert.deepEqual(old.pages,project.pages);
 assert.equal(validateProject({...project,stylePresetId:null}).stylePresetId,null);
 for(const value of [...STYLE_PRESETS.filter(preset=>!resolveStylePreset(preset.id)).map(preset=>preset.id),'unknown',{},7])assert.throws(()=>validateProject({...project,stylePresetId:value}),error=>error.status===400);
});

test('published style selections survive project saving and resolve to server-owned recipes',()=>{
 for(const preset of STYLE_PRESETS.filter(preset=>resolveStylePreset(preset.id))){
  const saved=validateProject({...project,stylePresetId:preset.id,stylePreset:{direction:'untrusted replacement'}});
  const restored=JSON.parse(JSON.stringify(saved));assert.equal(restored.stylePresetId,preset.id);
  assert.deepEqual(jobStylePreset(restored),preset);assert.notEqual(jobStylePreset(restored).direction,saved.stylePreset.direction);
  assert.deepEqual(restored.pages,project.pages);assert.equal(restored.allowWebImages,undefined);
 }
});
