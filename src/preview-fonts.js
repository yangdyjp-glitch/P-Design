import manifest from './preview-font-data.js';

export {manifest as previewFontManifest};
export function previewFontCSS(css){
 const faces=manifest.fonts.map(font=>'@font-face{font-family:"TY Sans";src:url("'+font.fullURL+'") format("woff2");font-weight:'+font.weight+';font-display:swap}@font-face{font-family:"TY Sans";src:url("'+font.url+'") format("woff2");font-weight:'+font.weight+';font-display:swap;unicode-range:'+manifest.unicodeRange+'}').join('');
 return String(css).replace(/@font-face\s*\{[^}]+\}/g,'')+faces;
}
