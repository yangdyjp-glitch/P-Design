import fs from "node:fs/promises";
import assert from "node:assert/strict";
import JSZip from "jszip";
import {chromium} from "playwright";
import {fileURLToPath} from "node:url";
const root=fileURLToPath(new URL("..",import.meta.url));
const browser=await chromium.launch({channel:"chrome",headless:true});
const context=await browser.newContext({viewport:{width:1600,height:1050},acceptDownloads:true});
const page=await context.newPage(),errors=[],checks=[];
page.on("pageerror",e=>errors.push(e.message));page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});
page.setDefaultTimeout(15000);
const wait=async()=>{await page.locator(".canvas-loading").waitFor({state:"hidden",timeout:45000});};
const state=()=>page.evaluate(()=>window.TuXu.getState());
const act=async name=>{const q='[data-action="'+name+'"]',inside=page.locator("dialog[open]").locator(q);await ((await inside.count())?inside.first():page.locator(q).first()).click();};
const checkpoint=name=>{checks.push(name);console.log("PASS "+name);};
const download=async(action,file)=>{
 const [d]=await Promise.all([page.waitForEvent("download",{timeout:180000}),act(action)]);assert.equal(await d.failure(),null);await d.saveAs(root+"/qa/"+file);return root+"/qa/"+file;
};
try{
 await fs.mkdir(root+"/qa",{recursive:true});
 await page.goto("http://127.0.0.1:4173",{waitUntil:"networkidle"});await page.waitForFunction(()=>window.TuXu);await wait();
 let s=await state();const demoId=s.activeId,seed=s.projects[0];assert.equal(seed.pages.length,6);assert.equal(seed.pages.flatMap(p=>p.copy).length,42);assert.deepEqual(await page.evaluate(()=>TuXu.auditCurrent()),[]);
 await page.screenshot({path:root+"/qa/desktop.png"});checkpoint("six-page sample and locked copy");
 if(!process.argv.includes("--continue-exports")){
 const title=page.locator('textarea[data-copy-field]').first(),old=await title.inputValue();await title.fill(old.replace("EJU","JLPT"));
 await page.waitForTimeout(600);await wait();
 assert.equal(await page.frameLocator("#canvas-frame").locator(".cover-exam").innerText(),"JLPT");assert.ok(!(await page.evaluate(()=>TuXu.auditCurrent())).some(x=>x.severity==="error"));
 await act("undo");await wait();assert.equal(await page.frameLocator("#canvas-frame").locator(".cover-exam").innerText(),"EJU");checkpoint("edit retains styled title and undo restores copy");
 const before=await state();await page.locator("#quick-input").fill("第4页照片放大20%");await page.locator('#quick-form button').click();await wait();
 s=await state();const changed=s.projects.find(p=>p.id===demoId);assert.equal(changed.pages[3].settings.photoZoom,1.2);
 for(const i of [0,1,2,4,5])assert.deepEqual(changed.pages[i],before.projects.find(p=>p.id===demoId).pages[i]);
 await page.waitForTimeout(800);await page.reload({waitUntil:"networkidle"});await page.waitForFunction(()=>window.TuXu);await wait();s=await state();assert.equal(s.projects.find(p=>p.id===demoId).pages[3].settings.photoZoom,1.2);checkpoint("single-page command and persistent reload");
 await act("undo");await wait();
 await act("new");await page.locator("#new-name").fill("网页流程验收");
 await page.locator("#new-copy").fill("（1P）\n城市散步计划\n从街角的小店开始，慢慢认识一座城。\n（2P）\n带上这份清单\n水杯、相机、舒服的鞋。");
 await page.locator('[form="new-project-form"]').click();await wait();s=await state();const newId=s.activeId;assert.equal(s.projects[0].pages.length,2);assert.equal(s.projects[0].pages[0].copy[0].text,"城市散步计划");checkpoint("create arbitrary-product project and manual pagination");
 await page.locator('[data-action="tab"][data-tab="visual"]').click();await page.locator("#file-images").setInputFiles(root+"/dist/assets/photos/toyoung-conversation.jpg");await page.waitForTimeout(400);
 await page.locator('[data-action="choose-photo"]').last().click();await wait();s=await state();assert.equal(s.projects[0].pages[0].layout,"photo");assert.ok(s.projects[0].pages[0].photoAssetId);checkpoint("upload real photo and replace current page");
 await page.locator('[data-action="tab"][data-tab="copy"]').click();
 const para=page.locator('textarea[data-copy-field]').nth(1);await para.fill("测试超长内容。".repeat(250));await page.waitForTimeout(600);await wait();
 assert.ok((await page.evaluate(()=>TuXu.auditCurrent())).some(i=>i.severity==="error"));
 await act("undo");await wait();checkpoint("overflow is detected and undo recovers content");
 await page.locator('[data-action="switch-project"][data-id="'+demoId+'"]').click();await wait();
 await act("audit");await page.locator("dialog").waitFor({state:"detached",timeout:90000});
 assert.ok(await page.getByText("本页结构检查通过").count());checkpoint("all six pages pass delivery audit");
 await act("export");await download("export-one","sample-page1.png");
 const png=await fs.readFile(root+"/qa/sample-page1.png");assert.equal(png.readUInt32BE(16),2160);assert.equal(png.readUInt32BE(20),2880);assert.ok(png.length>30000);checkpoint("real 2160x2880 PNG download");
 await act("export");await download("export-all","sample-six.zip");
 const zip=await JSZip.loadAsync(await fs.readFile(root+"/qa/sample-six.zip"));const names=Object.keys(zip.files);assert.equal(names.length,6);
 for(const name of names){const b=await zip.file(name).async("nodebuffer");assert.equal(b.readUInt32BE(16),2160);assert.equal(b.readUInt32BE(20),2880);}checkpoint("batch ZIP contains six valid high-resolution PNGs");
 }else{const prior=JSON.parse(await fs.readFile(root+"/qa/results.json","utf8"));checks.push(...prior.checks.filter(x=>!checks.includes(x)));}
 await act("export");await download("backup","sample.tuxu.json");await act("close");
 const backup=JSON.parse(await fs.readFile(root+"/qa/sample.tuxu.json","utf8"));assert.equal(backup.project.pages.length,6);assert.ok(backup.project.assets.every(a=>a.url.startsWith("data:image")));
 await page.locator("#file-project").setInputFiles(root+"/qa/sample.tuxu.json");await page.waitForTimeout(600);await wait();
 s=await state();assert.equal(s.projects[0].pages.length,6);assert.notEqual(s.activeId,demoId);assert.deepEqual(s.projects[0].pages.map(p=>p.copy),backup.project.pages.map(p=>p.copy));assert.equal(await page.frameLocator("#canvas-frame").locator(".cover-exam").innerText(),"EJU");assert.deepEqual(await page.evaluate(()=>TuXu.auditCurrent()),[]);checkpoint("portable backup and full project reimport");
 await act("export");await download("export-source","editable-source.zip");
 const source=await JSZip.loadAsync(await fs.readFile(root+"/qa/editable-source.zip"));assert.ok(source.file("index.html"));assert.ok(source.file("project.tuxu.json"));assert.ok(source.file("assets/fonts/OFL.txt"));assert.ok(source.file("page-6.html"));checkpoint("editable source archive includes pages, fonts and licence");
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(350);await page.screenshot({path:root+"/qa/mobile.png",fullPage:true});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));checkpoint("mobile layout without horizontal overflow");
 assert.deepEqual(errors,[]);checkpoint("no browser runtime errors");
 await fs.writeFile(root+"/qa/results.json",JSON.stringify({status:"passed",checks:[...new Set(checks)],errors,at:new Date().toISOString()},null,2));
}catch(e){await page.screenshot({path:root+"/qa/failure.png",fullPage:true});console.error(e.stack);await fs.writeFile(root+"/qa/results.json",JSON.stringify({status:"failed",checks,errors,failure:e.message},null,2));process.exitCode=1;}finally{await browser.close();}

