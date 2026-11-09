import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {previewFontCSS,previewFontManifest as manifest} from '../src/preview-fonts.js';

test('preview subsets retain licensed complete-font fallbacks and use hashed, verified assets',async()=>{
 assert.equal(manifest.fonts.length,4);assert.equal(manifest.characters,6356);
 let bytes=0,fullBytes=0;
 for(const font of manifest.fonts){const data=await fs.readFile('public'+font.url);assert.equal(data.length,font.bytes);assert.equal(createHash('sha256').update(data).digest('hex'),font.sha256);assert(font.url.includes(font.sha256.slice(0,12)));assert.equal((await fs.stat('public'+font.fullURL)).size,font.fullBytes);bytes+=font.bytes;fullBytes+=font.fullBytes;}
 assert(bytes<fullBytes*.21);assert.match(await fs.readFile('public/assets/fonts/preview/OFL.txt','utf8'),/SIL OPEN FONT LICENSE/);
 const css=previewFontCSS('@font-face{font-family:"TY Sans";src:url("assets/fonts/NotoSansSC-Regular.ttf")}body{font-family:"TY Sans"}');
 assert.equal((css.match(/@font-face/g)||[]).length,8);assert.doesNotMatch(css,/\.ttf/);assert.match(css,/unicode-range:U\+/);assert.match(css,/body\{font-family/);
 for(const font of manifest.fonts){assert(css.indexOf(font.fullURL)<css.indexOf(font.url));}
});
