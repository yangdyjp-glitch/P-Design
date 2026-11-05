import fs from "node:fs/promises";
import {chromium} from "playwright";
import {fileURLToPath} from "node:url";
const root=fileURLToPath(new URL("..",import.meta.url));
await fs.mkdir(root+"/qa",{recursive:true});
const browser=await chromium.launch({channel:"chrome",headless:true});
const context=await browser.newContext({viewport:{width:1600,height:1050},acceptDownloads:true});
const page=await context.newPage(),errors=[];page.on("pageerror",e=>errors.push(e.message));page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});
try{
await page.goto("http://127.0.0.1:4173",{waitUntil:"networkidle"});
await page.waitForFunction(()=>window.TuXu,{timeout:30000});
await page.locator(".canvas-loading").waitFor({state:"hidden",timeout:40000});
await page.screenshot({path:root+"/qa/desktop.png"});
console.log(JSON.stringify({title:await page.title(),errors,pages:await page.locator(".page-item").count(),state:await page.evaluate(()=>({pages:TuXu.getState().projects[0].pages.length,issues:TuXu.auditCurrent()}))}));
}finally{await browser.close();}

