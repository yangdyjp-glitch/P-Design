export function removeLocalProject(state,id){
 const index=state.projects.findIndex(project=>project.id===id);if(index<0)return;
 state.projects=state.projects.filter(project=>project.id!==id);
 if(state.activeId===id){
  const next=state.projects[Math.min(index,state.projects.length-1)];
  state.activeId=next?.id||null;state.pageId=next?.pages[0]?.id||null;
  state.selectedCopy=null;state.editing=null;state.audit=null;state.zoom=1;
 }
}

export function reconcileProjects(local,remote){
 const byId=new Map(remote.map(project=>[project.id,project])),result=[];
 for(const project of local){
  const saved=byId.get(project.id);
  if(!saved&&project.cloudRevision){
   // Preserve unsynced edits for backup; never recreate a deleted cloud project.
   if(project._cloudDirty)result.push({...project,_syncConflict:true});
  }else result.push(saved&&!project._cloudDirty&&saved.cloudRevision>(project.cloudRevision||0)?saved:project);
  byId.delete(project.id);
 }
 return [...result,...byId.values()];
}
