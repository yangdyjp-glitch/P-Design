export const skills = [
 {id:'xiaohongshu-design',name:'小红书设计主流程',group:'设计统筹',description:'原文保真、分页、制作与交付'},
 {id:'victor-design',name:'Victor 视觉设计',group:'设计统筹',description:'主题判断、视觉证据与设计审查'},
 {id:'xhs-reference-contract',name:'参考图分析',group:'设计判断',description:'把参考图片转成可执行的视觉规范'},
 {id:'xhs-cover-lab',name:'封面实验室',group:'设计判断',description:'封面重点、视觉证明与停留理由'},
 {id:'xhs-poster-composition',name:'海报构图',group:'设计制作',description:'主视觉、图文分区与系列节奏'},
 {id:'xhs-design-polish',name:'中文排版精修',group:'检查精修',description:'阅读顺序、对齐、疏密与照片裁切'},
 {id:'baoyu-cover-image',name:'Baoyu 生成式封面',group:'插画素材',description:'封面视觉方向与 AI 图像生成'},
 {id:'baoyu-xhs-images',name:'Baoyu 插画组图',group:'插画素材',description:'小红书插画风格与组图结构'},
 {id:'baoyu-infographic',name:'Baoyu 信息图',group:'插画素材',description:'流程、对比与层级信息的视觉表达'},
 {id:'xhs-images-design',name:'Tensorslab 插画卡片',group:'插画素材',description:'原创插画、卡通与手绘图解'},
 {id:'auto-redbook',name:'Auto-Redbook 主题制图',group:'模板制作',description:'主题、封面布局与 Markdown 分页'},
 {id:'xhs-note-creator',name:'文字卡片',group:'模板制作',description:'九套主题、中文字体与知识卡片'},
 {id:'blcaptain-style-skill',name:'BLCaptain 图文风格',group:'模板制作',description:'静纸、实证与跨平台视觉语言'},
 {id:'xhs-writer',name:'小红书内容策划',group:'内容创作',description:'根据本次素材策划图文与配文'},
] as const;
export const kinds=['design','revise','reference','cover','polish','write','image','template'] as const;
export function routeSkills(kind:string,primary?:string,automatic=false):string[]{if(automatic)return skills.map(s=>s.id);const chosen=primary&&skills.some(s=>s.id===primary)?primary:({reference:'xhs-reference-contract',cover:'xhs-cover-lab',polish:'xhs-design-polish',write:'xhs-writer',image:'baoyu-cover-image',template:'auto-redbook'} as Record<string,string>)[kind]||'xiaohongshu-design';return [...new Set(['xiaohongshu-design',chosen,...(['design','revise','cover','polish','template'].includes(kind)?['victor-design','xhs-poster-composition','xhs-design-polish']:[]),...(['design','revise','cover','template'].includes(kind)?['xhs-reference-contract','xhs-cover-lab']:[])])];}
