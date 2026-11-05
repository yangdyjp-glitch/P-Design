import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';

const usage = 'node render.mjs <cards.html or http URL> --out <dir> [--copy-file copy.json] [--width 1080 --height 1440 --scale 2 --selector .xhs-card --browser <path>]';
const sha = value => createHash('sha256').update(value).digest('hex');
const clean = value => String(value).replace(/\s+/gu, '');
const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const exists = async value => { try { await fs.access(value); return true; } catch { return false; } };

function argsFor(argv) {
  if (!argv.length || argv.includes('--help')) { console.log(usage); process.exit(argv.length ? 0 : 1); }
  const out = { input: argv[0], out: 'exports', width: 1080, height: 1440, scale: 2, selector: '.xhs-card' };
  const flags = new Map([['--out','out'],['--copy-file','copyFile'],['--width','width'],['--height','height'],['--scale','scale'],['--selector','selector'],['--browser','browser']]);
  for (let i = 1; i < argv.length; i += 2) {
    if (!flags.has(argv[i]) || argv[i + 1] === undefined) throw Error('Invalid arguments. ' + usage);
    out[flags.get(argv[i])] = argv[i + 1];
  }
  for (const key of ['width','height','scale']) {
    out[key] = Number(out[key]);
    if (!Number.isFinite(out[key]) || out[key] <= 0) throw Error(key + ' must be positive.');
  }
  if (!Number.isInteger(out.width) || !Number.isInteger(out.height) || out.scale > 4) throw Error('Use integer canvas dimensions and scale <= 4.');
  return out;
}

async function serveInput(input) {
  if (/^https?:\/\//i.test(input)) return { url: input, close: async () => {}, files: new Map(), local: null };
  const local = path.resolve(input);
  const root = path.dirname(local);
  await fs.access(local);
  const files = new Map();
  const mime = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.woff':'font/woff','.woff2':'font/woff2','.otf':'font/otf','.ttf':'font/ttf'};
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://127.0.0.1');
      if (url.pathname === '/favicon.ico') { response.writeHead(204); response.end(); return; }
      const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
      const target = path.resolve(root, relative);
      const check = path.relative(root, target);
      if (check.startsWith('..') || path.isAbsolute(check)) { response.writeHead(403); response.end(); return; }
      const data = await fs.readFile(target);
      files.set(target, sha(data));
      response.writeHead(200, {'Content-Type': mime[path.extname(target).toLowerCase()] || 'application/octet-stream', 'Cache-Control':'no-store'});
      response.end(data);
    } catch { response.writeHead(404); response.end('Not found'); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return {
    url: 'http://127.0.0.1:' + server.address().port + '/' + encodeURIComponent(path.basename(local)),
    local, files, close: () => new Promise(resolve => server.close(resolve))
  };
}

async function browserPath(explicit) {
  if (explicit) {
    if (!await exists(explicit)) throw Error('Browser does not exist: ' + explicit);
    return explicit;
  }
  for (const candidate of [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome',
    chromium.executablePath()
  ]) if (await exists(candidate)) return candidate;
  throw Error('No browser available. Install Chromium with npx playwright install chromium, or pass --browser.');
}

async function main() {
  const config = argsFor(process.argv.slice(2));
  const output = path.resolve(config.out);
  await fs.mkdir(output, { recursive: true });
  const expected = config.copyFile ? JSON.parse(await fs.readFile(path.resolve(config.copyFile), 'utf8')) : null;
  if (expected && (!Array.isArray(expected) || expected.some(x => !x || typeof x.id !== 'string' || !x.id || typeof x.text !== 'string') || new Set(expected.map(x => x.id)).size !== expected.length)) throw Error('copy-file must be an array of unique {id, text} records.');
  const input = await serveInput(config.input);
  let browser;
  try {
    const executable = await browserPath(config.browser);
    browser = await chromium.launch({ executablePath: executable, headless: true });
    const context = await browser.newContext({ viewport: { width: config.width + 160, height: config.height + 160 }, deviceScaleFactor: config.scale });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    const issues = [], warnings = [], networkFailures = [];
    page.on('pageerror', error => issues.push({ type:'page-error', message: error.message }));
    page.on('requestfailed', request => networkFailures.push({ url:request.url(), error:request.failure()?.errorText }));
    page.on('response', response => { if (response.status() >= 400 && !response.url().endsWith('/favicon.ico')) networkFailures.push({url:response.url(),status:response.status()}); });
    await page.goto(input.url, { waitUntil: 'load' });
    await page.waitForFunction(() => document.fonts.status === 'loaded' && [...document.images].every(image => image.complete));
    const cards = page.locator(config.selector);
    const count = await cards.count();
    if (!count) throw Error('No card matches ' + config.selector);
    const fontErrors = await page.evaluate(() => [...document.fonts].filter(font => font.status === 'error').map(font => ({family:font.family,weight:font.weight})));
    for (const font of fontErrors) issues.push({type:'font-load',...font});
    const cdp = await context.newCDPSession(page);
    await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
    const documentNode = await cdp.send('DOM.getDocument');
    const nodeIds = (await cdp.send('DOM.querySelectorAll', {nodeId:documentNode.root.nodeId,selector:config.selector})).nodeIds;
    const manifest = { generatedAt:new Date().toISOString(), input:input.local || input.url, canvas:{width:config.width,height:config.height,scale:config.scale}, browser:{executable,version:browser.version()}, checks:['font-load','image-load','canvas-size','text-bounds','text-clipping','copy-overlap','copy-ids',...(expected?['locked-copy']:[])], pages:[], issues,warnings,networkFailures };
    const allCopy = [];
    for (let index = 0; index < count; index++) {
      const card = cards.nth(index);
      const info = await card.evaluate(root => {
        const box = root.getBoundingClientRect();
        const issues = [], warnings = [], lines = [];
        const inside = (a,b) => a.left >= b.left-1.5 && a.right <= b.right+1.5 && a.top >= b.top-1.5 && a.bottom <= b.bottom+1.5;
        const visible = element => {
          const s = getComputedStyle(element), r = element.getBoundingClientRect();
          return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) !== 0 && r.width > 0 && r.height > 0;
        };
        const copy = [...root.querySelectorAll('[data-copy]')].map(element => {
          if (!visible(element) || element.closest('[hidden]')) issues.push({type:'hidden-copy',id:element.dataset.copy});
          if (element.parentElement?.closest('[data-copy]')) issues.push({type:'nested-copy',id:element.dataset.copy});
          return {id:element.dataset.copy,text:element.innerText};
        });
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          const node = walker.currentNode, element = node.parentElement;
          if (!node.textContent.trim() || !element || element.closest('[data-qa-ignore]') || !visible(element)) continue;
          const range = document.createRange(); range.selectNodeContents(node);
          const id = element.closest('[data-copy]')?.dataset.copy || null;
          if (!id) warnings.push({type:'unmarked-text',text:node.textContent.trim().slice(0,90)});
          for (const r of range.getClientRects()) {
            if (!r.width || !r.height) continue;
            if (!inside(r,box)) issues.push({type:'text-outside-canvas',id,text:node.textContent.trim().slice(0,90)});
            let ancestor = element;
            while (ancestor && root.contains(ancestor)) {
              const style = getComputedStyle(ancestor), a = ancestor.getBoundingClientRect();
              const clipX = /hidden|clip|auto|scroll/.test(style.overflowX);
              const clipY = /hidden|clip|auto|scroll/.test(style.overflowY);
              if ((clipX && (r.left < a.left-1.5 || r.right > a.right+1.5)) || (clipY && (r.top < a.top-1.5 || r.bottom > a.bottom+1.5))) {
                issues.push({type:'text-clipped',id,text:node.textContent.trim().slice(0,90)}); break;
              }
              ancestor = ancestor.parentElement;
            }
            if (id) lines.push({id,left:r.left,right:r.right,top:r.top,bottom:r.bottom});
          }
        }
        const overlaps = new Set();
        for (let a = 0; a < lines.length; a++) for (let b = a+1; b < lines.length; b++) {
          const x = lines[a], y = lines[b];
          if (x.id === y.id) continue;
          if (Math.min(x.right,y.right)-Math.max(x.left,y.left)>2 && Math.min(x.bottom,y.bottom)-Math.max(x.top,y.top)>2) overlaps.add([x.id,y.id].sort().join(' | '));
        }
        for (const ids of overlaps) issues.push({type:'copy-overlap',ids});
        for (const element of root.querySelectorAll('*')) {
          if (!visible(element) || element.closest('[data-qa-ignore],[data-allow-overflow]')) continue;
          if (!inside(element.getBoundingClientRect(),box)) issues.push({type:'element-outside-canvas',tag:element.tagName,className:typeof element.className==='string'?element.className:''});
        }
        const images = [...root.querySelectorAll('img')].map(image => ({source:image.currentSrc||image.src,loaded:image.complete&&image.naturalWidth>0}));
        for (const image of images) if (!image.loaded) issues.push({type:'image-load',source:image.source});
        const backgrounds = new Set();
        for (const element of [root,...root.querySelectorAll('*')]) {
          for (const match of getComputedStyle(element).backgroundImage.matchAll(/url\(["']?(.+?)["']?\)/g)) backgrounds.add(match[1]);
        }
        return {label:root.dataset.page||String(root.id||''),width:box.width,height:box.height,copy,images,backgrounds:[...backgrounds],issues,warnings};
      });
      for (const source of info.backgrounds) {
        const loaded = await page.evaluate(source => new Promise(resolve => {
          const image = new Image(); let timer;
          const finish = value => {clearTimeout(timer);resolve(value);};
          image.onload=()=>finish(true);image.onerror=()=>finish(false);timer=setTimeout(()=>finish(false),10000);image.src=source;
        }), source);
        if (!loaded) info.issues.push({type:'background-load',source});
      }
      if (Math.abs(info.width-config.width)>1 || Math.abs(info.height-config.height)>1) info.issues.push({type:'canvas-size',actual:[info.width,info.height],expected:[config.width,config.height]});
      const fonts = (await cdp.send('CSS.getPlatformFontsForNode',{nodeId:nodeIds[index]})).fonts;
      const stem = String(index+1).padStart(2,'0');
      const buffer = await card.screenshot({path:path.join(output,stem+'.png'),animations:'disabled'});
      const previews = await browser.newContext({viewport:{width:360,height:Math.ceil(360*info.height/info.width)},deviceScaleFactor:1});
      const preview = await previews.newPage();
      for (const width of [360,180]) {
        const height = Math.ceil(width*info.height/info.width);
        await preview.setViewportSize({width,height});
        await preview.setContent('<!doctype html><html><head><style>*{margin:0;padding:0}img{display:block;width:100%;height:auto}</style></head><body><img src="data:image/png;base64,'+buffer.toString('base64')+'"></body></html>');
        await preview.locator('img').evaluate(image=>image.decode());
        await preview.screenshot({path:path.join(output,stem+(width===360?'-phone.png':'-thumb.png'))});
      }
      await previews.close();
      allCopy.push(...info.copy);
      issues.push(...info.issues.map(item=>({page:index+1,...item})));
      warnings.push(...info.warnings.map(item=>({page:index+1,...item})));
      manifest.pages.push({number:index+1,label:info.label,width:info.width,height:info.height,fonts,copy:info.copy,images:info.images,backgrounds:info.backgrounds,files:{highResolution:stem+'.png',phone:stem+'-phone.png',thumbnail:stem+'-thumb.png'}});
    }
    const actual = new Map();
    for (const item of allCopy) {
      if (!item.id || actual.has(item.id)) issues.push({type:'duplicate-or-empty-copy-id',id:item.id});
      actual.set(item.id,item.text);
    }
    if (expected) {
      for (const item of expected) {
        if (!actual.has(item.id)) issues.push({type:'missing-copy',id:item.id});
        else if (clean(actual.get(item.id))!==clean(item.text)) issues.push({type:'copy-mismatch',id:item.id,expected:item.text,actual:actual.get(item.id)});
      }
      const ids = new Set(expected.map(item=>item.id));
      for (const id of actual.keys()) if (!ids.has(id)) issues.push({type:'unexpected-copy',id});
      manifest.copyFile={path:path.resolve(config.copyFile),sha256:sha(await fs.readFile(path.resolve(config.copyFile)))};
    } else warnings.push({type:'copy-not-compared',message:'No --copy-file supplied; text extracted but not compared with locked copy.'});
    for (const failure of networkFailures) issues.push({type:'network-asset',...failure});
    const overview = '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>组图总览</title><style>body{margin:24px;background:#e9eaed;font:16px sans-serif}.grid{display:grid;grid-template-columns:repeat('+Math.min(3,count)+',360px);gap:24px}figure{margin:0}img{display:block;width:360px;height:auto}figcaption{padding:8px 0}</style><div class="grid">'+manifest.pages.map(item=>'<figure><img src="'+item.files.phone+'"><figcaption>'+item.number+' '+escapeHtml(item.label)+'</figcaption></figure>').join('')+'</div></html>';
    await fs.writeFile(path.join(output,'overview.html'),overview,'utf8');
    const overviewServer = await serveInput(path.join(output,'overview.html'));
    const overviewContext = await browser.newContext({viewport:{width:Math.min(3,count)*384+24,height:Math.min(1500,Math.ceil(config.height/config.width*360)+90)},deviceScaleFactor:1});
    try {
      const overviewPage = await overviewContext.newPage();
      await overviewPage.goto(overviewServer.url,{waitUntil:'load'});
      await overviewPage.screenshot({path:path.join(output,'overview.png'),fullPage:true});
    } finally {await overviewContext.close();await overviewServer.close();}
    manifest.localSourceFiles=[...input.files].map(([file,hash])=>({path:file,sha256:hash}));
    manifest.status=issues.length?'failed':'passed';
    await fs.writeFile(path.join(output,'render-manifest.json'),JSON.stringify(manifest,null,2)+'\n','utf8');
    console.log(JSON.stringify({status:manifest.status,pages:count,issues:issues.length,warnings:warnings.length,output,manifest:path.join(output,'render-manifest.json')}));
    if (issues.length) process.exitCode=2;
  } finally {if(browser)await browser.close();await input.close();}
}

main().catch(error=>{console.error(error.message);process.exitCode=1;});
