// Explicit manuscript page markers are authoritative; plain text remains AI-paginated.
export function manuscriptParts(value){
 const text=String(value??'').replace(/\r\n?/g,'\n').trim();
 let chunks=text.split(/\n[ \t]*-{3,}[ \t]*(?:\n|$)/);
 if(chunks.length>1)return {chunks:chunks.filter(chunk=>chunk.trim()),paginationMode:'fixed'};
 const marker=/(?:^|\n)[ \t]*(?:[（(【\[][ \t]*)?(?:\d+[ \t]*[pP页]|[pP][ \t]*\d+|第[ \t]*\d+[ \t]*页)[ \t]*(?:[）)】\]][ \t]*)?[：:]?[ \t]*(?:\n|$|(?=[^\n]))/g;
 const explicit=marker.test(text);marker.lastIndex=0;
 chunks=explicit?text.split(marker).filter(chunk=>chunk.trim()):[text];
 return {chunks,paginationMode:explicit?'fixed':'auto'};
}
export const manuscriptPaginationMode=text=>manuscriptParts(text).paginationMode;

export function validatePaginationMode(value){
 // Legacy projects/backups already contain pages. Keep those boundaries conservatively.
 if(value===undefined||value===null)return 'fixed';
 if(value==='fixed'||value==='auto')return value;
 throw Error('文案分页规则不正确，请重新载入项目。');
}
export const projectPaginationMode=project=>validatePaginationMode(project?.paginationMode);
export function jobPaginationMode(project,parentSnapshot){
 // An existing correction retains its original contract, including pre-policy jobs.
 return parentSnapshot?parentSnapshot.paginationMode==='fixed'?'fixed':'auto':projectPaginationMode(project);
}

export function paginationIssue(sourcePages,resultPages,mode){
 if(mode!=='fixed')return null;
 if(!Array.isArray(resultPages)||resultPages.length!==sourcePages.length)return '已明确分页的文案必须保持原页数；让图片适配页面，不能为了放图新增、拆分或合并页面';
 for(let index=0;index<sourcePages.length;index++){
  const source=sourcePages[index],result=resultPages[index];
  if(result?.id!==source.id)return '第 '+(index+1)+' 页改变了原页面或顺序；已明确分页的文案必须保持原分页';
  if(!Array.isArray(result.copy)||result.copy.length!==source.copy.length||source.copy.some((copy,i)=>copy.id!==result.copy[i]?.id||('text' in copy&&copy.text!==result.copy[i]?.text)))return '第 '+(index+1)+' 页的文案被移至其他页或发生变动；必须保留本页全部原文，让图片适配页面';
 }
 return null;
}
