import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { configureToolEnvironment } from "./tool-environment.mjs";

export const projectRoot = fileURLToPath(new URL("../", import.meta.url));
configureToolEnvironment(projectRoot);

process.chdir(projectRoot);
for (const directory of [
  path.dirname(process.env.WRANGLER_LOG_PATH),
  process.env.WRANGLER_REGISTRY_PATH,
  process.env.MINIFLARE_REGISTRY_PATH,
]) {
  mkdirSync(directory, { recursive: true });
}

// Compatibility with the diagnostic command previously entered in Railway.
// Run the same initializer as npm start before exposing the Worker publicly.
const legacyRailwayCommand=(process.env.RAILWAY_ENVIRONMENT_ID||process.env.TUXU_RUNTIME==='railway')
  &&!process.env.TUXU_RAILWAY_BOOTSTRAPPED
  &&/[/\\]wrangler[/\\]bin[/\\]wrangler\.js$/.test(process.argv[1]||'')
  &&process.argv[2]==='dev';
if(legacyRailwayCommand){
  const {spawn}=await import('node:child_process');
  const args=process.argv.slice(3),portIndex=args.indexOf('--port');
  const inlinePort=args.find(arg=>arg.startsWith('--port='))?.slice(7);
  const explicitPort=portIndex>=0?args[portIndex+1]:inlinePort;
  const env={...process.env,TUXU_RAILWAY_BOOTSTRAPPED:'true',...(explicitPort?{PORT:explicitPort}:{})};
  const child=spawn(process.execPath,[fileURLToPath(new URL('./start-railway.mjs',import.meta.url))],{cwd:projectRoot,env,stdio:'inherit'});
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>child.kill(signal));
  const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>resolve(code??1));});
  process.exit(code);
}
