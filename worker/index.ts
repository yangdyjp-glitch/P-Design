import handler from "vinext/server/fetch-handler";
import { runWithConnectorBinding } from "../lib/connector-context";
import type { ConnectorBinding } from "../lib/connector-contract.mjs";
import {webhook} from '../server/webhooks';
import {visitorContext,visitorResponse} from '../server/visitor-session';
import {withPostgres} from '../server/database';

const worker = {
  async fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext<{ CONNECTORS?: ConnectorBinding }>) {
    if(env.DATABASE_URL&&new URL(request.url).pathname.startsWith('/api/')){
      try{return await withPostgres({DATABASE_URL:env.DATABASE_URL,DATABASE_CA_CERT:env.DATABASE_CA_CERT},ctx.waitUntil.bind(ctx),waitUntil=>dispatch(request,env,ctx,waitUntil));}
      catch(error){const value=(error as {code?:string})?.code,code=/^[A-Z0-9_]{2,40}$/.test(value||'')?value:'REQUEST_FAILED';console.error('POSTGRES_REQUEST_FAILURE',code);const health=new URL(request.url).pathname==='/api/health';return Response.json({error:'数据库连接暂时不可用，请检查 Supabase 连接配置。',...(health?{status:'error',databaseProvider:'postgresql',databaseConnected:false,errorCode:code}:{})},{status:503,headers:{'Cache-Control':'no-store'}});}
    }
    return dispatch(request,env,ctx,ctx.waitUntil.bind(ctx));
  },
};

async function dispatch(request:Request,env:Cloudflare.Env,ctx:ExecutionContext<{ CONNECTORS?: ConnectorBinding }>,waitUntil:(promise:Promise<unknown>)=>void){
    if(new URL(request.url).pathname==='/api/openai/webhook')return webhook(request,{waitUntil});
    const visitor=await visitorContext(request,env as unknown as Parameters<typeof visitorContext>[1]);
    if(visitor instanceof Response)return visitor;
    if(visitor)request=visitor.request;
    let binding = ctx.props?.CONNECTORS;
    // Local preview emulates the same request-scoped capability. This branch and
    // the auxiliary service binding are absent from production builds.
    if (import.meta.env.DEV && !binding && env.CONNECTORS) {
      const preview = env.CONNECTORS;
      const expiresAt = Date.now() + 60_000;
      binding = {
        async getContext() {
          if (Date.now() >= expiresAt) return { status: "request_context_expired" };
          return preview.getContext?.() ?? { status: "binding_unavailable" };
        },
        async invoke(connectorId, actionName, args) {
          if (Date.now() >= expiresAt) {
            return { status: "request_context_expired", message: "This request has expired. Please try again." };
          }
          return preview.invoke(connectorId, actionName, args);
        },
      };
    }
    return visitorResponse(await runWithConnectorBinding(binding, () => handler.fetch(request, env, ctx)),visitor);
}

export default worker;
