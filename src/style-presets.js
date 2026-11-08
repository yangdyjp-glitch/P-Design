// Keep the three site-wide slots stable. Each version is copied into the job snapshot.
export const STYLE_PRESETS=Object.freeze([
 Object.freeze({
  id:'preset-1',name:'预案一 · 实景编辑',version:2,
  summary:'真实照片、清晰大字与杂志式排版',
  description:'暖白与深墨为底，少量苔绿强调；优先真实照片，以清晰的大标题和编辑式分区组织信息。封面、正文、清单和步骤页随内容变化，保留整套的统一气质。没有合适照片时，使用同风格的文字排版。',
  direction:`预案一：实景编辑。面向通用小红书封面与组图，气质清晰、自然、可信，有编辑设计感。具体主题、行业、品牌与产品均来自本次内容；不预置任何机构、考试、课程或促销元素。

视觉系统：以暖白 #F5F1E8 为主要底色，深墨绿 #24342D 为主要文字色，苔绿 #607C62 为少量强调色；浅灰绿 #DCE2D6 仅用于必要分隔。照片保留自然色彩。大面积正文保持高对比，苔绿不承担小号连续正文。有明确品牌规范时优先保留本次品牌色，再按相同明暗与克制的用色关系调整；不要把本预案配色变成其他预案的全局规则。

字体与层级：使用真正加载的 TY Sans 中文字体，400/500/700/900 字重。每张图一个主要视觉焦点，靠字号、字重、位置与留白分组。1080×1440 母版试排：封面标题约 96–144px，内页主标题约 72–100px，次级标题约 44–60px，连续正文约 38–48px，正文行距约 1.45–1.65；这些是试排起点，须看实际字形和 360px 阅读预览。必要辅助信息才可更小。优先增页、重分区，避免把连续正文缩到 36px 以下。中文按语义断行，保留原文，不逐字拉伸、旋转或堆叠，不套用英文负字距。

构图：以清晰的编辑网格、自然对齐、完整的文字区与有分量的照片区组织信息。页边留量约 64–88px，从 8px 间距节奏起排，再做光学校正。封面优先用原有主题词形成醒目标题，与一张有内容依据的照片建立主次；根据原文与图像选择上文下图、侧向图文或照片旁的大字构成，不强制同一分割比例。长正文用清楚的段落和宽窄关系；清单、对比、步骤和路径仅在内容确实存在相应关系时使用。区分封面、解释、证据、清单和步骤的阅读任务，不为套版补写标题、标签、英文刊头、页脚、口号或结尾页。

系列节奏：整套共享字体、配色角色、对齐与间距。随内容改变主图位置、图文比例、文字区宽度和信息结构；三张及以上作品至少应有两种有理由的构图。避免连续三页复制同一版式，避免每页都堆相同的圆角卡片、相同尺寸的照片或固定编号徽章。可少量使用深墨底与暖白字作为内容转折，但避免连续深底长正文。统一气质，变化用于解释不同信息。

素材处理：优先使用内容相关的用户实景照片，保留人物身份、环境与事实；照片不加重滤镜，不拉伸、不重绘，不用生成图冒充实拍。上传图每次应用至少保留 80% 原图面积，要求完整显示时保留 100%；通过近原比例的图框、contain 或独立插图安排解决构图，不以裁剪、遮罩、叠字或重新编码绕过底层约束。仅在用户已开启联网配图时搜索补充真实场景，保存真实来源；网络图裁切豁免仍遵守主体完整和事实边界。没有合适照片时用同样的暖白、深墨、文字层级与线条完成编辑式文字构图，不能为了本风格强制搜图、生图或虚构纪录素材。

装饰与检查：优先靠内容和照片建立层次，只在有用途时使用细分隔线、色块或原文已有的关键数字；不把泛滥的贴纸、渐变、阴影、玻璃拟态与装饰图标当作主视觉。AI 自行择用相关的已安装设计技能，无需用户选择字号或排版参数。完成后实际查看整套总览、180px 缩略图与 360px 阅读图；逐字核对全部原文、阅读顺序、真实字体、边界、重叠、图像加载、上传图裁剪和邻页变化。技术检查通过后再判断层级与审美，不伪造检查记录。原文保真、素材真实性、单图修改范围、搜图授权及图片底层规则始终优先于本预案。`,
 }),
 Object.freeze({id:'preset-2',name:'预案二',version:1,summary:'',direction:''}),
 Object.freeze({id:'preset-3',name:'预案三',version:1,summary:'',direction:''}),
]);

export function resolveStylePreset(id,catalog=STYLE_PRESETS){
 const preset=catalog.find(preset=>preset.id===id);
 return preset&&preset.direction.trim()?{...preset}:null;
}

export function validateStylePresetId(id,catalog=STYLE_PRESETS){
 if(id===undefined||id===null||id==='')return null;
 if(typeof id!=='string'||!catalog.some(preset=>preset.id===id))throw Error('风格预案不存在，请重新选择。');
 if(!resolveStylePreset(id,catalog))throw Error('此预案的风格尚未设定，请先使用 AI 自行判断。');
 return id;
}

export function jobStylePreset(project,parentSnapshot){
 // A correction must use the exact recipe captured by its original job.
 return parentSnapshot?structuredClone(parentSnapshot.stylePreset||null):resolveStylePreset(project.stylePresetId);
}
