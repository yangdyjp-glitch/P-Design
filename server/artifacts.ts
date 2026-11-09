type Artifact={path:string;size_bytes:number;[key:string]:any};
export function selectArtifacts(artifacts:Artifact[],{pageRevision=false,sharedFonts=false}={}){
 const selected=artifacts.filter(a=>a.path.startsWith('/workspace/outputs/')&&a.path!=='/workspace/outputs/result.json'&&/\.(png|jpe?g|webp|html|css|zip|json|txt|md|woff2?|ttf|otf)$/i.test(a.path)&&(!sharedFonts||!/\.(zip|woff2?|ttf|otf)$/i.test(a.path)));
 if(pageRevision){const first=['render-manifest.json','page-revision-audit.json','revision-before-phone.png','revision-after-phone.png','revision-before.png','revision-after.png'];const rank=(a:Artifact)=>{const n=first.indexOf(a.path.split('/').pop()!);return n<0?first.length:n;};selected.sort((a,b)=>rank(a)-rank(b));}
 let bytes=0;return selected.slice(0,24).filter(a=>{if(a.size_bytes<0||a.size_bytes>25*1024*1024||bytes+a.size_bytes>35*1024*1024)return false;bytes+=a.size_bytes;return true;});
}
export function artifactBatches(artifacts:Artifact[]){
 const batches:Artifact[][]=[];let batch:Artifact[]=[],bytes=0;
 for(const artifact of artifacts){if(batch.length&&(batch.length>=2||bytes+artifact.size_bytes>12*1024*1024)){batches.push(batch);batch=[];bytes=0;}batch.push(artifact);bytes+=artifact.size_bytes;}
 if(batch.length)batches.push(batch);return batches;
}
export async function transferArtifacts<T>(artifacts:Artifact[],copy:(a:Artifact)=>Promise<T>,rollback:(copied:T)=>Promise<unknown>){
 const copied:T[]=[];try{for(const batch of artifactBatches(artifacts)){const results=await Promise.allSettled(batch.map(copy));for(const result of results)if(result.status==='fulfilled')copied.push(result.value);const failure=results.find(result=>result.status==='rejected');if(failure?.status==='rejected')throw failure.reason;}return copied;}
 catch(error){await Promise.allSettled(copied.map(rollback));throw error;}
}
