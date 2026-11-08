// Keep the three site-wide slots stable. Fill each direction only after its style is confirmed.
export const STYLE_PRESETS=Object.freeze([
 Object.freeze({id:'preset-1',name:'预案一',version:1,summary:'',direction:''}),
 Object.freeze({id:'preset-2',name:'预案二',version:1,summary:'',direction:''}),
 Object.freeze({id:'preset-3',name:'预案三',version:1,summary:'',direction:''}),
]);

export function resolveStylePreset(id,catalog=STYLE_PRESETS){
 const preset=catalog.find(preset=>preset.id===id);
 return preset&&preset.direction.trim()?{...preset}:null;
}

export function validateStylePresetId(id,catalog=STYLE_PRESETS){
 if(id===undefined||id===null||id==='')return null;
 if(typeof id!=='string'||!catalog.some(preset=>preset.id===id))throw Error('风格预案不存在，请重新选择。');
 if(!resolveStylePreset(id,catalog))throw Error('此预案的风格尚未设定，请先使用 AI 自行判断。');
 return id;
}

export function jobStylePreset(project,parentSnapshot){
 // A correction must use the exact recipe captured by its original job.
 return parentSnapshot?structuredClone(parentSnapshot.stylePreset||null):resolveStylePreset(project.stylePresetId);
}
