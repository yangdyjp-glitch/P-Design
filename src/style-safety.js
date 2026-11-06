// Shared by result validation, preview and export. `>` is a valid CSS combinator.
export function styleIssue(value) {
 const css=String(value||'');
 if(css.length>80000)return {code:'CSS_SIZE',message:'页面样式超过大小限制'};
 if(css.includes('<'))return {code:'CSS_MARKUP',message:'样式字段包含 HTML 标记，请将页面结构与样式分开'};
 const inspected=css.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\\(?:([\da-f]{1,6})[ \t\r\n\f]?|([^\r\n\f]))/gi,(_,hex,char)=>hex?String.fromCodePoint(Math.min(parseInt(hex,16),0x10ffff)):char);
 if(/@import\b/i.test(inspected))return {code:'CSS_IMPORT',message:'页面样式包含外部样式导入，请使用网站现有样式资源'};
 if(/url\s*\(/i.test(inspected))return {code:'CSS_URL',message:'页面样式包含资源地址，请通过本项目素材图片排版'};
 if(/@font-face\b/i.test(inspected))return {code:'CSS_FONT',message:'页面样式重复定义字体，请使用网站现有字体'};
 if(/expression\s*\(|javascript\s*:|-moz-binding\s*:|behavior\s*:/i.test(inspected))return {code:'CSS_ACTIVE',message:'页面样式包含不能执行的动态内容'};
 return null;
}
