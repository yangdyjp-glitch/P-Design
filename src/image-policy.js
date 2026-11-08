export const MIN_UPLOADED_VISIBLE = 0.8;

export function imageSource(asset) {
  return asset?.source === 'web' ? 'web' : asset?.source === 'upload' ? 'upload' : asset?.generated || asset?.source === 'generated' ? 'generated' : 'upload';
}

// Fraction of the original image retained after object-fit and rectangular clipping.
export function imageVisibility({naturalWidth, naturalHeight, box, fit = 'fill', position = ['50%', '50%'], clips = [], roundedLoss = 0, scaleX = 1, scaleY = 1}) {
  if (![naturalWidth, naturalHeight, box?.width, box?.height].every(n => Number.isFinite(n) && n > 0)) return 0;
  let width = box.width / scaleX, height = box.height / scaleY;
  if (fit !== 'fill') {
    let scale = fit === 'cover' ? Math.max(width / naturalWidth, height / naturalHeight) : Math.min(width / naturalWidth, height / naturalHeight);
    if (fit === 'none') scale = 1;
    if (fit === 'scale-down') scale = Math.min(1, scale);
    width = naturalWidth * scale; height = naturalHeight * scale;
  }
  width *= scaleX; height *= scaleY;
  const offset = (value, free, scale) => String(value).endsWith('%') ? free * parseFloat(value) / 100 : (parseFloat(value) || 0) * scale;
  const painted = {left: box.left + offset(position[0], box.width - width, scaleX), top: box.top + offset(position[1], box.height - height, scaleY), width, height};
  let left = painted.left, top = painted.top, right = left + width, bottom = top + height;
  for (const clip of [box, ...clips]) {
    if (clip.x !== false) { left = Math.max(left, clip.left); right = Math.min(right, clip.left + clip.width); }
    if (clip.y !== false) { top = Math.max(top, clip.top); bottom = Math.min(bottom, clip.top + clip.height); }
  }
  return Math.max(0, Math.min(1, (Math.max(0, right - left) * Math.max(0, bottom - top) - roundedLoss) / (width * height)));
}

// Runs both in the workbench and in the hosted renderer. Source comes from project metadata, never authored HTML.
export function auditImagePolicy(root, assets = []) {
  const view = root.ownerDocument.defaultView, results = [];
  for (const image of root.querySelectorAll('img')) {
    const assetId = image.dataset.assetId || '', asset = assets.find(item => item.id === assetId), source = imageSource(asset);
    const style = view.getComputedStyle(image), rect = image.getBoundingClientRect();
    let unsupported = '', roundedLoss = 0;
    const clips = [], scaleX = rect.width / (image.offsetWidth || rect.width || 1), scaleY = rect.height / (image.offsetHeight || rect.height || 1);
    const box = {left: rect.left + (parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft)) * scaleX, top: rect.top + (parseFloat(style.borderTopWidth) + parseFloat(style.paddingTop)) * scaleY,
      width: Math.max(0, rect.width - (parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth) + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight)) * scaleX),
      height: Math.max(0, rect.height - (parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth) + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)) * scaleY)};
    for (let element = image; element && (element === root || root.contains(element)); element = element.parentElement) {
      const s = view.getComputedStyle(element), r = element.getBoundingClientRect(), self = element === image;
      if (s.clipPath !== 'none' || s.maskImage && s.maskImage !== 'none' || s.clip && s.clip !== 'auto' || s.rotate && s.rotate !== 'none' && s.rotate !== '0deg') unsupported = '遮罩或旋转无法确认原图保留比例';
      if (s.transform !== 'none') {
        const m = new view.DOMMatrixReadOnly(s.transform);
        if (!m.is2D || Math.abs(m.b) > 0.00001 || Math.abs(m.c) > 0.00001 || m.a <= 0 || m.d <= 0) unsupported = '旋转或透视无法确认原图保留比例';
      }
      if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) unsupported = '图片不可见或透明';
      const clipX = self || element === root || /hidden|clip|auto|scroll/.test(s.overflowX), clipY = self || element === root || /hidden|clip|auto|scroll/.test(s.overflowY);
      if (clipX || clipY) {
        const sx=r.width/(element.offsetWidth||r.width||1),sy=r.height/(element.offsetHeight||r.height||1);
        clips.push({left:r.left+parseFloat(s.borderLeftWidth)*sx,top:r.top+parseFloat(s.borderTopWidth)*sy,width:Math.max(0,r.width-(parseFloat(s.borderLeftWidth)+parseFloat(s.borderRightWidth))*sx),height:Math.max(0,r.height-(parseFloat(s.borderTopWidth)+parseFloat(s.borderBottomWidth))*sy),x:clipX,y:clipY});
        if (clipX && clipY) for (const corner of ['TopLeft', 'TopRight', 'BottomLeft', 'BottomRight']) {
          const radius = s['border' + corner + 'Radius'].split(/\s+/), rx = radius[0].endsWith('%') ? r.width * parseFloat(radius[0]) / 100 : parseFloat(radius[0]) * r.width / (element.offsetWidth || r.width || 1), ryValue = radius[1] || radius[0], ry = ryValue.endsWith('%') ? r.height * parseFloat(ryValue) / 100 : parseFloat(ryValue) * r.height / (element.offsetHeight || r.height || 1);
          roundedLoss += Math.min(rx || 0, r.width / 2) * Math.min(ry || 0, r.height / 2) * (1 - Math.PI / 4);
        }
      }
    }
    let position = style.objectPosition.trim().split(/\s+/);
    const keyword = {left:'0%', top:'0%', center:'50%', right:'100%', bottom:'100%'};
    position = position.map(value => keyword[value] || value);
    if (position.length === 1) position.push('50%');
    if (position.length !== 2 || position.some(value => !/^-?\d*\.?\d+(?:px|%)$/.test(value))) unsupported = '图片定位无法确认原图保留比例';
    const visibleFraction = imageVisibility({naturalWidth:image.naturalWidth, naturalHeight:image.naturalHeight, box, fit:style.objectFit, position, clips, roundedLoss, scaleX, scaleY});
    const loaded = image.complete && image.naturalWidth > 0;
    results.push({assetId, source, visibleFraction, loaded, passed:loaded && (source !== 'upload' || !unsupported && visibleFraction + 0.000001 >= MIN_UPLOADED_VISIBLE), ...(source === 'upload' && unsupported ? {reason:unsupported} : {})});
  }
  return results;
}
