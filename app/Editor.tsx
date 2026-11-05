'use client';
import {useEffect} from 'react';
export default function Editor(){useEffect(()=>{const script=document.createElement('script');script.type='module';script.src='/editor.js';document.body.appendChild(script);return()=>{script.remove();};},[]);return <>
 <div id="app"><div className="boot"><div className="boot-symbol">图</div><h1>图序 Studio</h1><p>正在打开你的设计工作台…</p></div></div>
 <div id="modal-root"/><div id="toast" role="status" aria-live="polite"/>
 <input id="file-images" type="file" accept="image/png,image/jpeg,image/webp" multiple hidden/>
 <input id="file-project" type="file" accept=".json,application/json" hidden/>
 </>;}
