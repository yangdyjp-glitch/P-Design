import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
const root=path.resolve("dist"),port=Number(process.env.PORT||4173);
const mime={".html":"text/html;charset=utf-8",".css":"text/css;charset=utf-8",".js":"text/javascript;charset=utf-8",".json":"application/json;charset=utf-8",".ttf":"font/ttf",".jpg":"image/jpeg",".png":"image/png",".svg":"image/svg+xml"};
http.createServer(async(req,res)=>{try{const url=new URL(req.url,"http://localhost");const p=path.resolve(root,"."+decodeURIComponent(url.pathname==="/"?"/index.html":url.pathname));if(!p.startsWith(root+path.sep))throw Error("forbidden");const body=await fs.readFile(p);res.writeHead(200,{"Content-Type":mime[path.extname(p)]||"application/octet-stream","Cache-Control":"no-cache"});res.end(body);}catch{res.writeHead(404);res.end("Not found");}}).listen(port,"127.0.0.1",()=>console.log("Local: http://127.0.0.1:"+port));
