import {Buffer} from 'node:buffer';
import {pbkdf2,randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import type {Database} from '../db/postgres';
import {discardRequestBody} from './visitor-session';
import {initialAdminHash as BOOTSTRAP_HASH} from './account-bootstrap';

type AccountEnv={ACCESS_MODE?:string;APP_ORIGIN?:string;DB:Database};
type AccountRow={id:string;username:string;display_name:string;password_hash:string;role:'admin'|'user';disabled:number;created_at:number;updated_at:number};
type AccountContext={request:Request};
const SESSION_TTL=7*24*60*60;
const ITERATIONS=600000;
const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
const derive=(password:string,salt:Uint8Array,iterations:number)=>new Promise<Buffer>((resolve,reject)=>pbkdf2(password,salt,iterations,32,'sha256',(error,key)=>error?reject(error):resolve(key)));
export async function passwordHash(password:string){const salt=randomBytes(16);return ['pbkdf2-sha256',ITERATIONS,salt.toString('base64url'),(await derive(password,salt,ITERATIONS)).toString('base64url')].join('$');}
export async function passwordMatches(password:string,encoded:string){
  const match=/^pbkdf2-sha256\$(600000)\$([A-Za-z0-9_-]{22})\$([A-Za-z0-9_-]{43})$/.exec(encoded);
  if(!match||typeof password!=='string'||password.length>128)return false;
  const candidate=await derive(password,Buffer.from(match[2],'base64url'),Number(match[1]));
  return timingSafeEqual(candidate,Buffer.from(match[3],'base64url'));
}
function response(value:unknown,status=200,cookie?:string){const headers:Record<string,string>={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Vary':'Cookie'};if(cookie)headers['Set-Cookie']=cookie;return Response.json(value,{status,headers});}
class AccountError extends Error{constructor(public status:number,message:string,public code?:string){super(message);}}
const reject=(status:number,message:string,code?:string):never=>{throw new AccountError(status,message,code);};
function username(value:unknown){if(typeof value!=='string')return '';return value.trim().toLowerCase();}
function validUsername(value:string){return /^[a-z0-9][a-z0-9_.-]{2,31}$/.test(value);}
function validPassword(value:unknown):value is string{return typeof value==='string'&&value.length>=8&&value.length<=128;}
function displayName(value:unknown,fallback:string){if(value===undefined||value==='')return fallback;if(typeof value!=='string'||!value.trim()||value.trim().length>60)reject(400,'显示名称最多 60 个字。');return (value as string).trim();}
async function readBody(request:Request){
  const reader=request.body?.getReader();if(!reader)reject(400,'请填写账户信息。');let size=0;const chunks:Uint8Array[]=[];
  try{for(;;){const part=await reader!.read();if(part.done)break;size+=part.value.byteLength;if(size>4096){await reader!.cancel();reject(413,'账户信息过长。');}chunks.push(part.value);}}finally{reader!.releaseLock();}
  try{const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!value||Array.isArray(value)||typeof value!=='object')throw Error();return value as Record<string,unknown>;}catch{reject(400,'账户信息格式不正确。');}
}
function cookieName(url:URL){return url.protocol==='https:'?'__Host-tuxu-account':'tuxu-account';}
function sessionCookie(url:URL,token='',ttl=0){return `${cookieName(url)}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${ttl}${url.protocol==='https:'?'; Secure':''}`;}
function readToken(request:Request,url:URL){const name=cookieName(url)+'=',parts=(request.headers.get('cookie')||'').split(';').map(x=>x.trim()).filter(x=>x.startsWith(name));const value=parts.length===1?parts[0].slice(name.length):'';return /^[A-Za-z0-9_-]{43}$/.test(value)?value:'';}
export function publicAccount(account:AccountRow){return {id:account.id,username:account.username,name:account.display_name,role:account.role,disabled:!!account.disabled,createdAt:account.created_at};}
export async function accountById(db:Database,id:string){return db.prepare('SELECT * FROM accounts WHERE id=? AND disabled=0').bind(id).first<AccountRow>();}
async function bootstrap(db:Database){const now=Date.now();await db.prepare("INSERT INTO accounts(id,username,display_name,password_hash,role,disabled,created_at,updated_at) VALUES(?,?,?,?,'admin',0,?,?) ON CONFLICT(username) DO NOTHING").bind('account_admin','admin','管理员',BOOTSTRAP_HASH,now,now).run();}
async function sessionAccount(db:Database,token:string){return token?db.prepare('SELECT a.* FROM accounts a JOIN account_sessions s ON s.account_id=a.id WHERE s.token_hash=? AND s.expires_at>? AND a.disabled=0').bind(digest(token),Date.now()).first<AccountRow>():null;}
async function loginLimit(db:Database,name:string){
  const now=Date.now(),cutoff=now-15*60*1000;
  const buckets=[['global',180],['name:'+digest(name),10]] as const;
  const results=await db.batch([
    db.prepare('INSERT INTO login_attempts(bucket,window_start,attempts) VALUES(?,?,1) ON CONFLICT(bucket) DO UPDATE SET attempts=CASE WHEN login_attempts.window_start<=? THEN 1 ELSE login_attempts.attempts+1 END,window_start=CASE WHEN login_attempts.window_start<=? THEN ? ELSE login_attempts.window_start END RETURNING attempts').bind('global',now,cutoff,cutoff,now),
    db.prepare("INSERT INTO login_attempts(bucket,window_start,attempts) SELECT ?,?,1 WHERE (SELECT attempts FROM login_attempts WHERE bucket='global')<=180 ON CONFLICT(bucket) DO UPDATE SET attempts=CASE WHEN login_attempts.window_start<=? THEN 1 ELSE login_attempts.attempts+1 END,window_start=CASE WHEN login_attempts.window_start<=? THEN ? ELSE login_attempts.window_start END RETURNING attempts").bind(buckets[1][0],now,cutoff,cutoff,now),
    db.prepare('DELETE FROM login_attempts WHERE window_start<?').bind(now-24*60*60*1000),
  ]);
  if(results.slice(0,2).some((result,index)=>Number(result.results[0]?.attempts)>buckets[index][1]))reject(429,'登录尝试过于频繁，请 15 分钟后重试。');
}
async function accountRoute(request:Request,url:URL,db:Database,account:AccountRow|null,token:string):Promise<Response|null>{
  const path=url.pathname,method=request.method;
  if(path==='/api/auth/login'&&method==='POST'){
    const data=await readBody(request),name=username(data!.username);
    await loginLimit(db,name.slice(0,128));await bootstrap(db);
    const row=validUsername(name)?await db.prepare('SELECT * FROM accounts WHERE username=?').bind(name).first<AccountRow>():null;
    const valid=await passwordMatches(typeof data!.password==='string'?data!.password:'',row?.password_hash||BOOTSTRAP_HASH);
    if(!row||!valid||row.disabled)reject(401,'账户名或密码不正确。','LOGIN_FAILED');
    const newToken=randomBytes(32).toString('base64url'),now=Date.now();
    const [inserted]=await db.batch([
      db.prepare('INSERT INTO account_sessions(token_hash,account_id,expires_at,created_at) SELECT ?,id,?,? FROM accounts WHERE id=? AND password_hash=? AND disabled=0').bind(digest(newToken),now+SESSION_TTL*1000,now,row!.id,row!.password_hash),
      db.prepare('DELETE FROM account_sessions WHERE expires_at<=? OR token_hash=?').bind(now,token?digest(token):''),
    ]);
    if(!inserted.meta.changes)reject(401,'账户状态已变化，请重新登录。','AUTH_REQUIRED');
    return response({user:publicAccount(row!)},200,sessionCookie(url,newToken,SESSION_TTL));
  }
  if(path==='/api/auth/logout'&&method==='POST'){
    if(token)await db.prepare('DELETE FROM account_sessions WHERE token_hash=?').bind(digest(token)).run();
    return response({signedOut:true},200,sessionCookie(url));
  }
  if(!account)return null;
  if(path==='/api/auth/password'&&method==='POST'){
    const data=await readBody(request);
    if(!validPassword(data!.password))reject(400,'新密码需为 8–128 个字符。');
    if(!await passwordMatches(typeof data!.currentPassword==='string'?data!.currentPassword:'',account.password_hash))reject(400,'当前密码不正确。');
    const hash=await passwordHash(data!.password as string);
    const [updated]=await db.batch([
      db.prepare('UPDATE accounts SET password_hash=?,updated_at=? WHERE id=? AND password_hash=? AND disabled=0').bind(hash,Date.now(),account.id,account.password_hash),
      db.prepare('DELETE FROM account_sessions WHERE account_id=? AND EXISTS(SELECT 1 FROM accounts WHERE id=? AND password_hash=?)').bind(account.id,account.id,hash),
    ]);
    if(!updated.meta.changes)reject(409,'账户状态已变化，请重新登录。','AUTH_REQUIRED');
    return response({changed:true,signInRequired:true},200,sessionCookie(url));
  }
  if(path==='/api/accounts'||path.startsWith('/api/accounts/')){
    if(account.role!=='admin')reject(403,'仅管理员可以管理账户。');
    if(path==='/api/accounts'&&method==='GET'){const list=await db.prepare('SELECT * FROM accounts ORDER BY created_at,id LIMIT 500').all<AccountRow>();return response({accounts:list.results.map(publicAccount)});}
    if(path==='/api/accounts'&&method==='POST'){
      const data=await readBody(request),name=username(data!.username);
      if(!validUsername(name))reject(400,'账户名需为 3–32 位英文、数字、点、横线或下划线，并以英文或数字开头。');
      if(!validPassword(data!.password))reject(400,'密码需为 8–128 个字符。');
      const label=displayName(data!.name,name),id='account_'+crypto.randomUUID(),now=Date.now(),hash=await passwordHash(data!.password as string);
      const [inserted]=await db.batch([db.prepare("INSERT INTO accounts(id,username,display_name,password_hash,role,disabled,created_at,updated_at) SELECT ?,?,?,?,'user',0,?,? WHERE (SELECT count(*) FROM accounts)<500 ON CONFLICT(username) DO NOTHING").bind(id,name,label,hash,now,now)]);
      if(!inserted.meta.changes){if(await db.prepare('SELECT id FROM accounts WHERE username=?').bind(name).first())reject(409,'这个账户名已存在。');reject(400,'账户数量已达上限。');}
      return response({account:publicAccount((await accountById(db,id))!)},201);
    }
    const target=/^\/api\/accounts\/(account_[a-zA-Z0-9_-]+)$/.exec(path);
    if(target&&method==='PATCH'){
      const data=await readBody(request);if(typeof data!.disabled!=='boolean')reject(400,'请选择账户状态。');
      const [updated]=await db.batch([
        db.prepare("UPDATE accounts SET disabled=?,updated_at=? WHERE id=? AND role='user'").bind(data!.disabled?1:0,Date.now(),target![1]),
        db.prepare("DELETE FROM account_sessions WHERE account_id=? AND EXISTS(SELECT 1 FROM accounts WHERE id=? AND disabled=1 AND role='user')").bind(target![1],target![1]),
      ]);
      if(!updated.meta.changes)reject(404,'找不到可管理的普通账户。');return response({updated:true});
    }
    reject(404,'没有这个账户管理功能。');
  }
  return null;
}

// The public host never accepts caller-supplied Sites identity headers. The
// account ID sent by the editor also binds writes to the workspace it loaded.
export async function accountContext(request:Request,env:AccountEnv):Promise<AccountContext|Response|null>{
  if(env.ACCESS_MODE!=='accounts')return null;
  const url=new URL(request.url);if(env.APP_ORIGIN){const origin=new URL(env.APP_ORIGIN);url.protocol=origin.protocol;url.host=origin.host;url.port=origin.port;}
  const normalized=new Request(url,request);normalized.headers.set('host',url.host);
  for(const key of [...normalized.headers.keys()])if(key.toLowerCase().startsWith('oai-authenticated-user-'))normalized.headers.delete(key);
  if(!url.pathname.startsWith('/api/')||url.pathname==='/api/health')return {request:normalized};
  try{
    if(!['GET','HEAD'].includes(normalized.method)&&normalized.headers.get('origin')!==url.origin)reject(403,'请求来源不匹配，请刷新网页后重试。');
    const token=readToken(normalized,url),account=await sessionAccount(env.DB,token),expected=normalized.headers.get('x-tuxu-account');
    if(expected&&expected!==account?.id)reject(401,'登录状态已变化，请重新打开工作台。','AUTH_CHANGED');
    if(account&&!['GET','HEAD'].includes(normalized.method)&&url.pathname!=='/api/auth/login'&&expected!==account.id)reject(401,'请刷新工作台后重试。','AUTH_CHANGED');
    const handled=await accountRoute(normalized,url,env.DB,account,token);
    if(handled){await discardRequestBody(normalized);return handled;}
    if(!account&&url.pathname!=='/api/session')reject(401,'请先登录，再使用工作台。','AUTH_REQUIRED');
    if(account){normalized.headers.set('oai-authenticated-user-id',account.id);normalized.headers.set('oai-authenticated-user-email',account.username+'@accounts.invalid');normalized.headers.set('oai-authenticated-user-full-name',encodeURIComponent(account.display_name));normalized.headers.set('oai-authenticated-user-full-name-encoding','percent-encoded-utf-8');}
    return {request:normalized};
  }catch(error){await discardRequestBody(normalized);return response({error:error instanceof AccountError?error.message:'账户服务暂时不可用，请稍后重试。',...(error instanceof AccountError&&error.code?{code:error.code}:{})},error instanceof AccountError?error.status:500);}
}
