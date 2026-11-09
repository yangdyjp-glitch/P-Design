import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';

const plugins=[{name:'isolated-runtime',setup(builder){
 builder.onResolve({filter:/^(?:cloudflare:workers|\.\.\/app\/chatgpt-auth|\.\.\/db\/context|\.\/accounts)$/},args=>({path:args.path,namespace:'isolated-runtime'}));
 builder.onLoad({filter:/.*/,namespace:'isolated-runtime'},args=>({loader:'js',contents:args.path==='cloudflare:workers'?'export const env={OPENAI_API_KEY:"test-only-not-a-real-key"};':args.path.endsWith('chatgpt-auth')?'export const getChatGPTUser=async()=>null;':args.path.endsWith('context')?'export const currentDatabase=()=>null;':'export const accountById=async()=>null;'}));
}}];
const {outputFiles}=await build({entryPoints:['server/core.ts'],bundle:true,write:false,platform:'node',format:'esm',define:{'import.meta.env.DEV':'false'},plugins});
const {api,HttpError}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));

test('only a transport failure on an idempotent provider read permits bounded job resumption',async()=>{
 const previous=globalThis.fetch;try{
  globalThis.fetch=async()=>{throw Error('simulated connection loss');};
  for(const method of ['GET','POST','DELETE'])await assert.rejects(api('/agents/sessions/test',{method}),error=>error instanceof HttpError&&error.status===502&&error.retryableRead===(method==='GET'));
  globalThis.fetch=async()=>Response.json({error:{code:'provider_failure'}},{status:502});await assert.rejects(api('/agents/sessions/test'),error=>error instanceof HttpError&&error.retryableRead===false);
  globalThis.fetch=async()=>Response.json({error:{code:'insufficient_quota'}},{status:429});await assert.rejects(api('/agents/sessions/test'),error=>error instanceof HttpError&&error.status===503&&error.retryableRead===false);
 }finally{globalThis.fetch=previous;}
});
