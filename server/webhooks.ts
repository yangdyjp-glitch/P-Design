import {Buffer} from 'node:buffer';
import {runtime,body,json,HttpError} from './core';
import {advanceJob} from './agent';
import {databaseProvider} from '../db/context';
export async function webhook(req:Request,ctx?:Pick<ExecutionContext,'waitUntil'>){
 if(req.method!=='POST')return new Response('Method not allowed',{status:405});const e=runtime();if(!e.OPENAI_WEBHOOK_SECRET)return new Response('Not configured',{status:503});
 const id=req.headers.get('webhook-id'),stamp=req.headers.get('webhook-timestamp'),signatures=req.headers.get('webhook-signature');if(!id||!stamp||!signatures||Math.abs(Date.now()/1000-Number(stamp))>300)return new Response('Invalid signature',{status:401});
 const raw=new TextDecoder().decode(await body(req,100000));const secret=e.OPENAI_WEBHOOK_SECRET;const keyBytes=secret.startsWith('whsec_')?Buffer.from(secret.slice(6),'base64'):new TextEncoder().encode(secret);const key=await crypto.subtle.importKey('raw',keyBytes,{name:'HMAC',hash:'SHA-256'},false,['verify']);let valid=false;for(const candidate of signatures.split(' ')){const [version,b64]=candidate.split(',');if(version!=='v1'||!b64)continue;try{if(await crypto.subtle.verify('HMAC',key,Buffer.from(b64,'base64'),new TextEncoder().encode(id+'.'+stamp+'.'+raw)))valid=true;}catch{}}if(!valid)return new Response('Invalid signature',{status:401});
 let event:any;try{event=JSON.parse(raw);}catch{return new Response('Invalid JSON',{status:400});}const supported=['agent.session.action_required','agent.session.idle','agent.session.failed','response.completed','response.failed','response.incomplete','response.cancelled'];if(!supported.includes(event.type))return json({received:true});
 const sid=event.data?.id;if(typeof sid!=='string')return json({received:true});const previous=await e.DB.prepare('SELECT done FROM webhook_inbox WHERE id=?').bind(id).first<any>();if(previous?.done)return json({received:true});
 const job=event.type.startsWith('agent.session.')?await e.DB.prepare('SELECT * FROM jobs WHERE session_id=?').bind(sid).first<any>():await e.DB.prepare(databaseProvider()==='postgresql'?"SELECT * FROM jobs WHERE image_state::jsonb->>'responseId'=? OR snapshot::jsonb#>>'{_visualReview,responseId}'=?":"SELECT * FROM jobs WHERE json_extract(image_state,'$.responseId')=? OR json_extract(snapshot,'$._visualReview.responseId')=?").bind(sid,sid).first<any>();if(!job)return json({received:true});
 await e.DB.prepare('INSERT INTO webhook_inbox(id,session_id,done,created_at) VALUES(?,?,0,?) ON CONFLICT(id) DO NOTHING').bind(id,job.session_id,Date.now()).run();
 const processing=(async()=>{try{await advanceJob(job);await e.DB.prepare('UPDATE webhook_inbox SET done=1 WHERE id=?').bind(id).run();return true;}catch{return false;}})();if(ctx)ctx.waitUntil(processing);
 const completed=await Promise.race([processing,new Promise<boolean>(r=>setTimeout(()=>r(false),8000))]);return json({received:completed},completed?200:503);
}
