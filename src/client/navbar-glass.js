// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NanoDuck Consulting Group contributors
// Full license: navbar-glass.LICENSE.txt
// A local, disposable optical surface. Only the narrow visible page strip is
// painted; form values are never sampled and no pixels leave this document.
export function createNavbarGlass({ allowed = () => true } = {}) {
  const sampleBleed = 24;
  const edgeBandLimit = 17;
  const displacementLimit = 15;
  const bar = document.querySelector('.navbar');
  if (!bar) return { clear() {} };
  const canvas = document.createElement('canvas');
  canvas.className = 'navbar-lens'; canvas.setAttribute('aria-hidden', 'true');
  bar.prepend(canvas);
  const target = canvas.getContext('2d');
  const source = document.createElement('canvas'); const ctx = source.getContext('2d', { willReadFrequently: true });
  if (!target || !ctx) {
    canvas.remove();
    bar.classList.add('navbar-glass-fallback');
    return { clear() { bar.classList.add('navbar-glass-fallback'); }, refresh() {} };
  }
  const reduced = matchMedia('(prefers-reduced-transparency: reduce)');
  const contrast = matchMedia('(forced-colors: active)');
  let frame = 0;
  const wipe = () => { cancelAnimationFrame(frame); frame = 0; target.clearRect(0, 0, canvas.width, canvas.height); ctx.clearRect(0, 0, source.width, source.height); };
  const clear = () => { wipe(); bar.classList.add('navbar-glass-fallback'); };
  const intersects = (a, b) => a.right > b.left && a.left < b.right && a.bottom > b.top && a.top < b.bottom;
  const paint = (element, strip) => {
    if (element.hidden || element.matches('script,style,canvas,video,[aria-hidden="true"]')) return;
    const box = element.getBoundingClientRect();
    if (!intersects(box, strip)) return;
    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility !== 'visible' || Number(style.opacity) === 0) return;
    ctx.save(); ctx.globalAlpha *= Number(style.opacity);
    if (style.backgroundColor !== 'rgba(0, 0, 0, 0)') {
      ctx.fillStyle = style.backgroundColor; ctx.beginPath();
      ctx.roundRect(box.left-strip.left, box.top-strip.top, box.width, box.height, Math.min(parseFloat(style.borderRadius)||0,box.width/2,box.height/2)); ctx.fill();
    }
    // Reconstruct control surfaces, but never read values, selected options or
    // textarea text. Omitting their entire boxes left holes in Settings glass.
    const borderWidth = parseFloat(style.borderTopWidth);
    if (borderWidth > 0 && style.borderTopStyle === 'solid' &&
        style.borderTopWidth === style.borderRightWidth && style.borderTopWidth === style.borderBottomWidth && style.borderTopWidth === style.borderLeftWidth) {
      ctx.strokeStyle = style.borderTopColor; ctx.lineWidth = borderWidth;
      ctx.beginPath(); ctx.roundRect(box.left-strip.left+borderWidth/2, box.top-strip.top+borderWidth/2,
        Math.max(0,box.width-borderWidth), Math.max(0,box.height-borderWidth),
        Math.max(0,Math.min(parseFloat(style.borderRadius)||0,box.width/2,box.height/2)-borderWidth/2)); ctx.stroke();
    }
    if (element.matches('input,textarea,select')) { ctx.restore(); return; }
    if (element instanceof HTMLImageElement && element.complete && element.naturalWidth) {
      const url = new URL(element.currentSrc || element.src, location.href);
      if (url.origin === location.origin || url.protocol === 'data:') {
        ctx.drawImage(element,box.left-strip.left,box.top-strip.top,box.width,box.height);
      }
    }
    // Render actual visible text with its computed font and browser-measured
    // positions. The centre is transparent; only this edge sample is refracted.
    ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    ctx.fillStyle = style.color; ctx.textBaseline = 'alphabetic';
    const range = document.createRange();
    for (const child of element.childNodes) {
      if (child.nodeType === Node.ELEMENT_NODE) { paint(child, strip); continue; }
      if (child.nodeType !== Node.TEXT_NODE || !child.textContent.trim()) continue;
      range.selectNodeContents(child);
      if (![...range.getClientRects()].some(rect => intersects(rect,strip))) continue;
      // Character ranges preserve wrapping, tables, links and mixed scripts.
      for (let index=0; index<child.length;) {
        const text = String.fromCodePoint(child.textContent.codePointAt(index));
        range.setStart(child,index); range.setEnd(child,index+text.length); index+=text.length;
        const rect = range.getBoundingClientRect(); if (!intersects(rect,strip) || !text.trim()) continue;
        const metrics=ctx.measureText(text); const ascent=metrics.fontBoundingBoxAscent ?? parseFloat(style.fontSize)*.8;
        const descent=metrics.fontBoundingBoxDescent ?? parseFloat(style.fontSize)*.2;
        ctx.fillText(text,rect.left-strip.left,rect.top-strip.top+(rect.height-ascent-descent)/2+ascent);
      }
    }
    ctx.restore();
  };
  const render = () => {
    frame=0;
    if (!allowed() || document.hidden || reduced.matches || contrast.matches) { clear(); return; }
    const box=bar.getBoundingClientRect(); const width=Math.round(box.width),height=Math.round(box.height);
    if (!width || !height) return;
    const bleed=sampleBleed;
    if (canvas.width!==width || canvas.height!==height) { canvas.width=width;canvas.height=height;source.width=width+bleed*2;source.height=height+bleed*2; }
    ctx.clearRect(0,0,source.width,source.height);
    ctx.fillStyle=getComputedStyle(document.documentElement).backgroundColor; ctx.fillRect(0,0,source.width,source.height);
    const strip={left:box.left-bleed,top:box.top-bleed,right:box.right+bleed,bottom:box.bottom+bleed};
    for (const root of document.querySelectorAll('.workspace-actions,#main')) paint(root,strip);
    const pixels=ctx.getImageData(0,0,source.width,source.height); const output=target.createImageData(width,height);
    const radius=Math.min(height/2,parseFloat(getComputedStyle(bar).borderRadius)||40);
    const band=Math.min(edgeBandLimit,height*.26);
    for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
      const cx=Math.max(radius,Math.min(width-radius,x+.5)),cy=Math.max(radius,Math.min(height-radius,y+.5));
      const dx=x+.5-cx,dy=y+.5-cy,len=Math.hypot(dx,dy);
      // Signed distance to a rounded rectangle and its outward normal.
      const depth=radius-len;
      if(depth<0 || depth>band || !len) continue;
      const t=1-depth/band;
      const bend=displacementLimit*Math.sin(t*Math.PI*.85);
      const sx=Math.max(0,Math.min(source.width-1.001,x+bleed-dx/len*bend));
      const sy=Math.max(0,Math.min(source.height-1.001,y+bleed-dy/len*bend));
      const ix=Math.floor(sx),iy=Math.floor(sy),fx=sx-ix,fy=sy-iy,to=(y*width+x)*4;
      const from=(iy*source.width+ix)*4;
      for(let channel=0;channel<3;channel++) output.data[to+channel]=
        pixels.data[from+channel]*(1-fx)*(1-fy)+pixels.data[from+4+channel]*fx*(1-fy)+
        pixels.data[from+source.width*4+channel]*(1-fx)*fy+pixels.data[from+source.width*4+4+channel]*fx*fy;
      output.data[to+3]=Math.round(255*Math.min(1,depth/1.5)*Math.min(1,(band-depth)/3));
    }
    target.putImageData(output,0,0);
    bar.classList.remove('navbar-glass-fallback');
  };
  const schedule=()=>{ if(!frame) frame=requestAnimationFrame(()=>{try{render();}catch{clear();}}); };
  window.addEventListener('scroll',schedule,{passive:true}); document.addEventListener('scroll',schedule,{passive:true,capture:true}); window.addEventListener('resize',schedule,{passive:true});
  document.addEventListener('visibilitychange',()=>{if(document.hidden) clear();else schedule();});
  const preferenceChange=()=>{if(reduced.matches||contrast.matches) clear();else schedule();};
  reduced.addEventListener('change',preferenceChange);contrast.addEventListener('change',preferenceChange);
  // Keep the previous frame until its replacement is ready. Clearing on every
  // mutation made unrelated status updates flash the glass off between frames.
  // Privacy transitions still call clear() synchronously through the app.
  const observer=new MutationObserver(()=>{if (!allowed()) clear(); else schedule();});
  for(const root of document.querySelectorAll('.workspace-actions,#main')) observer.observe(root,{subtree:true,childList:true,characterData:true,attributes:true});
  new ResizeObserver(schedule).observe(bar);
  document.fonts?.ready.then(schedule);schedule();
  return { clear, refresh:schedule };
}
