import assert from 'node:assert/strict';
import {test} from 'node:test';
import {imageSource,imageVisibility,MIN_UPLOADED_VISIBLE} from '../src/image-policy.js';
const visible=(box,extra={})=>imageVisibility({naturalWidth:1000,naturalHeight:1000,box:{left:0,top:0,...box},fit:'cover',...extra});
test('uploaded images retain 80% at the exact boundary and reject a greater crop',()=>{
 assert.equal(visible({width:800,height:1000}),MIN_UPLOADED_VISIBLE);
 assert(visible({width:799,height:1000})<MIN_UPLOADED_VISIBLE);
 assert.equal(visible({width:800,height:1000},{fit:'contain'}),1);
});
test('crop calculation includes parent clipping, zoom and image positioning',()=>{
 assert.equal(visible({width:1000,height:1000},{clips:[{left:0,top:0,width:800,height:1000}]}),.8);
 assert(visible({left:-50,top:-50,width:1100,height:1100},{scaleX:1.1,scaleY:1.1,clips:[{left:0,top:0,width:800,height:1000}]})<.8);
 assert.equal(visible({width:1000,height:1000},{position:['500px','0%']}),.5);
 assert.equal(visible({width:2000,height:2000},{fit:'none',scaleX:2,scaleY:2}),1);
});
test('landscape photographs, circular masks and missing dimensions are treated conservatively',()=>{
 assert.equal(visible({width:800,height:800},{naturalWidth:1600,naturalHeight:900}),.5625);
 assert(visible({width:100,height:100},{roundedLoss:10000*(1-Math.PI/4)})<.8);
 assert.equal(visible({width:100,height:100},{naturalWidth:0}),0);
});
test('legacy uploads default to the crop limit; only labelled web/generated assets are exempt',()=>{
 assert.equal(imageSource({}), 'upload');assert.equal(imageSource({source:'upload',generated:true}), 'upload');
 assert.equal(imageSource({source:'web'}), 'web');assert.equal(imageSource({source:'generated',generated:true}), 'generated');
});
