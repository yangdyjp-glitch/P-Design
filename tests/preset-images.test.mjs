import assert from 'node:assert/strict';
import {test} from 'node:test';
import {projectImageMode,jobImageMode,webImagesForMode,assetsForMode,imageModeIssue,requiresPhoto,hasAllowedPhoto} from '../src/preset-images.js';
const assets=[{id:'upload',source:'upload'},{id:'web',source:'web'},{id:'generated',source:'generated',generated:true},{id:'legacy'}];
const page=id=>({html:'<section class="xhs-card">'+(id?'<img data-asset-id="'+id+'" src="/api/files/'+id+'">':'')+'</section>'});
test('three presets control image source while automatic mode preserves explicit opt-in',()=>{
 assert.deepEqual(['preset-1','preset-2','preset-3'].map(stylePresetId=>projectImageMode({stylePresetId})),['upload','web','none']);
 assert.equal(projectImageMode({}),'auto');
 for(const mode of ['upload','none'])assert.equal(webImagesForMode(mode,true),false);
 assert.equal(webImagesForMode('web',false),true);assert.equal(webImagesForMode('auto',true),true);assert.equal(webImagesForMode('auto',false),false);
});
test('forbidden assets are excluded from each preset input',()=>{
 assert.deepEqual(assetsForMode(assets,'upload').map(a=>a.id),['upload','legacy']);
 assert.deepEqual(assetsForMode(assets,'web').map(a=>a.id),['web']);assert.deepEqual(assetsForMode(assets,'none'),[]);assert.deepEqual(assetsForMode(assets,'auto'),assets);
});
test('pure typography rejects images and illustrations even when a legacy asset is present',()=>{
 assert.equal(imageModeIssue('none',[page()],assets),null);
 for(const entry of [page('upload'),page('web'),{html:'<svg><path/></svg>'},{html:'<canvas></canvas>'},{html:'<video poster="/api/files/upload"></video>'},{html:'<picture><source srcset="/api/files/web"></picture>'},{html:'<input type="image" src="/api/files/upload">'},{html:'',photoAssetId:'upload'}])assert(imageModeIssue('none',[entry],assets));
});
test('photographic sets require an actually rendered image from the selected source; text-only inner pages remain valid',()=>{
 for(const mode of ['upload','web']){
  assert.equal(imageModeIssue(mode,[page(mode),page()],assets,{requirePhoto:true}),null);
  assert(imageModeIssue(mode,[page()],assets,{requirePhoto:true}));
  assert(imageModeIssue(mode,[{...page(),photoAssetId:mode}],assets,{requirePhoto:true}));
  assert.equal(imageModeIssue(mode,[page()],assets),null);
  for(const id of ['upload','web','generated'].filter(id=>id!==mode))assert(imageModeIssue(mode,[page(id)],assets));
 }
});
test('corrections preserve source mode, including old automatic snapshots',()=>{
 assert.equal(jobImageMode({stylePresetId:'preset-3'},{imageMode:'web'}),'web');
 assert.equal(jobImageMode({stylePresetId:'preset-3'},{}),'auto');assert.equal(jobImageMode({stylePresetId:'preset-3'}),'none');
});
test('a single-page revision may be image-free only while another page retains a permitted photograph',()=>{
 assert.equal(requiresPhoto({imageMode:'web',scope:'page',otherPagesHavePhoto:true}),false);
 assert.equal(requiresPhoto({imageMode:'web',scope:'page',otherPagesHavePhoto:false}),true);
 assert.equal(requiresPhoto({imageMode:'none',scope:'page'}),false);
 assert.equal(hasAllowedPhoto([page('web')],assets,'web'),true);assert.equal(hasAllowedPhoto([page('upload')],assets,'web'),false);
 assert.equal(hasAllowedPhoto([{html:'',layout:'original',photoAssetId:'web'}],assets,'web'),false);
});
