import {build} from "esbuild";
await build({entryPoints:["src/app.js"],bundle:true,minify:true,format:"esm",target:"es2022",outfile:"public/editor.js",legalComments:"linked"});
console.log("图序工作台已生成。");
