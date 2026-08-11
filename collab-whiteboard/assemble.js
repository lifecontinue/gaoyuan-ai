// Assembly script: splice the 4 fragment files into collab-whiteboard.html
// and apply all behavioral patches needed for the Notion-style redesign +
// Frame tool + auto-switch-to-select. Deterministic; throws if any anchor missing.
const fs = require('fs');
const path = require('path');
const D = __dirname;
const F = 'collab-whiteboard.html';
let html = fs.readFileSync(path.join(D, F), 'utf8');

const read = f => fs.readFileSync(path.join(D, f), 'utf8');
let NEW_CSS = read('_new_css.txt');
let NEW_CSS2 = read('_new_css2.txt');
let NEW_BODY = read('_new_body.txt');
let NEW_JS = read('_new_js_ui.txt');

// ---- transform fragment internals ----
// restorePrefs: IIFE -> plain function (avoid TDZ on lsGet/lsSet defined later)
NEW_JS = NEW_JS.replace('  (function restorePrefs(){', '  function restorePrefs(){');
NEW_JS = NEW_JS.replace("    }catch(_){}\n  })();", "    }catch(_){}\n  }");
// propMode: plain notes -> 'text' panel
NEW_JS = NEW_JS.replace(
  "    return k==='note'?'note':k==='stroke'?'pen':k==='shape'?'shape':\n           k==='connection'?'connect':k==='frame'?'frame':'multi';",
  "    return k==='note'?(sel[0]&&sel[0].plain?'text':'note'):k==='stroke'?'pen':k==='shape'?'shape':\n           k==='connection'?'connect':k==='frame'?'frame':'multi';"
);
// applyProp: textColor / textSize apply to plain notes
NEW_JS = NEW_JS.replace(
  "      case 'textColor':  textColor=v;   break;\n      case 'textSize':   textSize=v;    break;",
  "      case 'textColor':  textColor=v;   each(o=>{ if(o.kind==='note'&&o.plain&&o.el){ o.color=v; const tx=o.el.querySelector('.txt'); if(tx) tx.style.color=v; } }); break;\n      case 'textSize':   textSize=v;    each(o=>{ if(o.kind==='note'&&o.plain&&o.el){ const tx=o.el.querySelector('.txt'); if(tx) tx.style.fontSize=v+'px'; } }); break;"
);
// append plain-note CSS
NEW_CSS += "\n  .note.plain{background:transparent!important;box-shadow:none;border:1px dashed var(--border-2);}\n  .note.plain .palette{display:none;}\n  .note.plain .txt{outline:none;}\n";

// ---- helper ----
function rep(find, repl, label){
  if(!html.includes(find)) throw new Error('NOT FOUND: '+label);
  html = html.replace(find, repl);
}
function sliceRep(start, end, repl, label){
  const i = html.indexOf(start);
  if(i < 0) throw new Error('START NOT FOUND: '+label);
  const j = html.indexOf(end, i + start.length);
  if(j < 0) throw new Error('END NOT FOUND: '+label);
  html = html.slice(0, i) + repl + html.slice(j);
}

// ===== 1. Top bar CSS: replace old block with new css + css2 =====
sliceRep(
  '  /* ---------- Top Bar — Notion 3-zone layout ---------- */',
  '  /* ---------- Board ---------- */',
  NEW_CSS + '\n' + NEW_CSS2,
  'topbar-css'
);

// ===== 2. Remove old propBar/botbar/frame/responsive CSS (avoid dup) =====
sliceRep(
  '  /* ---------- Left Property Sidebar (GoBoardcast-style) ---------- */',
  '</style>',
  '</style>',
  'propbar-css-remove'
);

// ===== 3. Replace body HTML =====
sliceRep(
  '<div id="topbar">',
  '<script>',
  NEW_BODY + '\n',
  'body'
);

// ===== 4. Replace BUILD UI / PROPERTY PANEL / BOTTOM BAR JS block =====
sliceRep(
  '  // ===================== BUILD UI =====================',
  "  document.getElementById('bbZoomFit').onclick=()=>zoomToFit();",
  NEW_JS,
  'js-ui'
);

// ===== 5. Fix broken BG_COLORS hex =====
rep('#F0FDF4EFF6', '#F0FDF4', 'bg-colors-hex');

// ===== 6. Inject new STATE vars + frames =====
rep(
  'const state = { notes:[], shapes:[], strokes:[], connections:[], order:[], groups:[] };',
  "const state = { notes:[], shapes:[], strokes:[], connections:[], order:[], groups:[] };\n" +
  "  state.frames = [];\n" +
  "  let locked=false, darkMode=false, bgPicked=false;\n" +
  "  let textColor=PEN_COLORS[0], textSize=18, noteFont=16, noteAlign='left';\n" +
  "  let shapeStroke='#2B2925', shapeFill='#ECE5D6', shapeSW=2, shapeStyle='solid';\n" +
  "  let connArrowSize=12, connColor='#8A8275';\n" +
  "  let frameBg='none', frameRx=8;",
  'state-vars'
);

// ===== 7. Crash fixes: zoomPct -> bbZoomPct =====
rep(
  "    document.getElementById('zoomPct').textContent=Math.round(camera.scale*100)+'%';",
  "    const _zp=document.getElementById('bbZoomPct'); if(_zp) _zp.textContent=Math.round(camera.scale*100)+'%';",
  'applyCamera-zoom'
);
rep(
  "    const zp=document.getElementById('zoomPct'), bzp=document.getElementById('bbZoomPct');",
  "    const bzp=document.getElementById('bbZoomPct');",
  'requestRender-zp-decl'
);
rep(
  "    if(zp)zp.textContent=pct; if(bzp)bzp.textContent=pct;",
  "    if(bzp)bzp.textContent=pct;",
  'requestRender-zp-use'
);
rep(
  "  document.getElementById('zoomPct').onclick=()=>zoomToFit();",
  "  document.getElementById('bbZoomPct').onclick=()=>zoomToFit();",
  'line1529-zoom'
);
// Old body used #zoomIn/#zoomOut; new body uses #bbZoomIn/#bbZoomOut (wired in the new UI block).
// Remove the leftover bare references so they don't crash on null.
rep(
`  document.getElementById('zoomIn').onclick=()=>zoomBy(1.2);
  document.getElementById('zoomOut').onclick=()=>zoomBy(1/1.2);`,
`  // zoomIn/zoomOut wiring moved to the new UI block (bbZoomIn/bbZoomOut)`,
  'old-zoom-bare'
);

// ===== 8. setTool rewrite (remove hand + old panels, call renderProps) =====
rep(
`  function setTool(t){
    tool=t;
    document.querySelectorAll('.tool').forEach(b=>b.classList.toggle('active',b.dataset.tool===t));
    document.getElementById('panel-note').classList.toggle('show',t==='note');
    document.getElementById('panel-pen').classList.toggle('show',t==='pen');
    document.getElementById('panel-eraser').classList.toggle('show',t==='eraser');
    document.getElementById('panel-shape').classList.toggle('show',t==='shape');
    board.className='';
    if(t==='pen') board.classList.add('penmode');
    else if(t==='eraser') board.classList.add('erasermode');
    else if(t==='connect') board.classList.add('connectmode');
    else if(t==='note') board.classList.add('notemode');
    else if(t==='shape') board.classList.add('shapemode');
    else if(t==='hand' || spaceDown) board.classList.add('panmode');
    syncConnPanel();
    hideCtx();
  }`,
`  function setTool(t){
    tool=t;
    document.querySelectorAll('.tool').forEach(b=>b.classList.toggle('active',b.dataset.tool===t));
    board.className='';
    if(t==='pen') board.classList.add('penmode');
    else if(t==='eraser') board.classList.add('erasermode');
    else if(t==='connect') board.classList.add('connectmode');
    else if(t==='note') board.classList.add('notemode');
    else if(t==='shape') board.classList.add('shapemode');
    else if(t==='frame') board.classList.add('framemode');
    else if(spaceDown) board.classList.add('panmode');
    renderProps(); syncSelUI(); hideCtx();
  }`,
  'setTool'
);

// ===== 9. connPanel guard + remove bindSeg init =====
rep(
`    const show = tool==='connect' || (tool==='select' && conns.length>0);
    connPanel.classList.toggle('show', show);`,
`    const show = tool==='connect' || (tool==='select' && conns.length>0);
    if(!connPanel) return;
    connPanel.classList.toggle('show', show);`,
  'connPanel-guard'
);
rep(
`  bindSeg('connRoute','r',v=>{ connRoute=v; applyConnPatch({route:v}); });
  bindSeg('connDash','d', v=>{ connDash=v;  applyConnPatch({dash:v}); });
  bindSeg('connArrow','a',v=>{ connArrow=v; applyConnPatch({arrow:v}); });`,
  "  // connection style is now handled by the dynamic property panel",
  'bindSeg-remove'
);

// ===== 10. syncSelUI -> renderProps =====
rep(
`  function syncSelUI(){ state.notes.forEach(n=>{ if(n.el) n.el.classList.toggle('sel',selection.has(n.id)); });
    syncConnPanel(); requestRender(); }`,
`  function syncSelUI(){ state.notes.forEach(n=>{ if(n.el) n.el.classList.toggle('sel',selection.has(n.id)); });
    syncConnPanel(); renderProps(); requestRender(); }`,
  'syncSelUI'
);

// ===== 11. getItem / removeItem / bboxOf -> frames =====
rep(
`  function getItem(id){
    for(const k of ['notes','shapes','strokes','connections']){
      const f = state[k].find(x=>x.id===id); if(f) return f;
    }
    return null;
  }`,
`  function getItem(id){
    for(const k of ['notes','shapes','strokes','connections']){
      const f = state[k].find(x=>x.id===id); if(f) return f;
    }
    const fr=state.frames.find(x=>x.id===id); if(fr) return fr;
    return null;
  }`,
  'getItem'
);
rep(
`  function removeItem(id){
    for(const k of ['notes','shapes','strokes','connections']){
      const i = state[k].findIndex(x=>x.id===id);
      if(i>=0){ if(k==='notes'){ const n=state[k][i]; n.el && n.el.remove(); } state[k].splice(i,1); }
    }
    const o = state.order.indexOf(id); if(o>=0) state.order.splice(o,1);
  }`,
`  function removeItem(id){
    for(const k of ['notes','shapes','strokes','connections']){
      const i = state[k].findIndex(x=>x.id===id);
      if(i>=0){ if(k==='notes'){ const n=state[k][i]; n.el && n.el.remove(); } state[k].splice(i,1); }
    }
    const fi=state.frames.findIndex(x=>x.id===id); if(fi>=0) state.frames.splice(fi,1);
    const o = state.order.indexOf(id); if(o>=0) state.order.splice(o,1);
  }`,
  'removeItem'
);
rep(
`      return {x:Math.min(ba.x,bb.x),y:Math.min(ba.y,bb.y),w:Math.abs(ba.x-bb.x),h:Math.abs(ba.y-bb.y)}; }
    return null;
  }
  function centerOf(it){ const b=bboxOf(it); return {x:b.x+b.w/2,y:b.y+b.h/2}; }`,
`      return {x:Math.min(ba.x,bb.x),y:Math.min(ba.y,bb.y),w:Math.abs(ba.x-bb.x),h:Math.abs(ba.y-bb.y)}; }
    if(it.kind==='frame'){ const x=Math.min(it.x,it.x+it.w), y=Math.min(it.y,it.y+it.h); return {x,y,w:Math.abs(it.w),h:Math.abs(it.h)}; }
    return null;
  }
  function centerOf(it){ const b=bboxOf(it); return {x:b.x+b.w/2,y:b.y+b.h/2}; }`,
  'bboxOf'
);

// ===== 12. makeFrame + drawFrame =====
rep(
`  function normalizeShape(s){ return {x:Math.min(s.x,s.x+s.w),y:Math.min(s.y,s.y+s.h),w:Math.abs(s.w),h:Math.abs(s.h)}; }`,
`  function makeFrame(x,y,w,h){ const f={id:uid(),kind:'frame',x:Math.min(x,x+w),y:Math.min(y,y+h),w:Math.abs(w),h:Math.abs(h),bg:frameBg==='none'?null:frameBg,rx:frameRx}; state.frames.push(f); return f; }
  function drawFrame(ctx,f){ const sel=selection.has(f.id); ctx.save(); if(f.bg){ ctx.globalAlpha=.5; ctx.fillStyle=f.bg; rr(ctx,f.x,f.y,f.w,f.h,f.rx); ctx.fill(); ctx.globalAlpha=1; } ctx.lineWidth=sel?2:1.5; ctx.strokeStyle=sel?'#2383E2':'rgba(35,131,226,.5)'; ctx.setLineDash(sel?[]:[6,4]); rr(ctx,f.x,f.y,f.w,f.h,f.rx); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle=sel?'#2383E2':'rgba(35,131,226,.7)'; ctx.font='12px '+getCss('--sans'); ctx.textBaseline='alphabetic'; ctx.fillText('Frame', f.x+6, f.y-6); ctx.restore(); }
  function normalizeShape(s){ return {x:Math.min(s.x,s.x+s.w),y:Math.min(s.y,s.y+s.h),w:Math.abs(s.w),h:Math.abs(s.h)}; }`,
  'makeFrame'
);

// ===== 13. drawMain: draw frames + live preview =====
rep(
`    mctx.setTransform(camera.scale*dpr,0,0,camera.scale*dpr,camera.x*dpr,camera.y*dpr);`,
`    mctx.setTransform(camera.scale*dpr,0,0,camera.scale*dpr,camera.x*dpr,camera.y*dpr);
    state.frames.forEach(f=>drawFrame(mctx,f));`,
  'drawMain-frames'
);
rep(
`    // shapes (in order)
    state.order.forEach(id=>{ const it=getItem(id); if(it&&it.kind==='shape') drawShape(mctx,it); });
  }`,
`    if(drag&&drag.type==='frame'){ const fx=Math.min(drag.x,drag.x+drag.w),fy=Math.min(drag.y,drag.y+drag.h),fw=Math.abs(drag.w),fh=Math.abs(drag.h);
      mctx.save(); mctx.strokeStyle='#2383E2'; mctx.lineWidth=1.5; mctx.setLineDash([6,4]); rr(mctx,fx,fy,fw,fh,8); mctx.stroke(); mctx.setLineDash([]); mctx.restore(); }
    // shapes (in order)
    state.order.forEach(id=>{ const it=getItem(id); if(it&&it.kind==='shape') drawShape(mctx,it); });
  }`,
  'drawMain-preview'
);

// ===== 14. hitTest: detect frames (lowest priority) =====
rep(
`    if(c.label && Math.abs(wx-g.mid.x)<28 && Math.abs(wy-g.mid.y)<12) return c; }
    return null;
  }`,
`    if(c.label && Math.abs(wx-g.mid.x)<28 && Math.abs(wy-g.mid.y)<12) return c; }
    for(let i=state.frames.length-1;i>=0;i--){ const f=state.frames[i];
      if(wx>=f.x && wx<=f.x+f.w && wy>=f.y && wy<=f.y+f.h) return f; }
    return null;
  }`,
  'hitTest'
);

// ===== 15. drawSel: single selected frame box =====
rep(
`      sctx.strokeRect(s1.x,s1.y,s2.x-s1.x,s2.y-s1.y); sctx.setLineDash([]);
    }
  }`,
`      sctx.strokeRect(s1.x,s1.y,s2.x-s1.x,s2.y-s1.y); sctx.setLineDash([]);
    } else if(ids.length===1){ const it=getItem(ids[0]); if(it&&it.kind==='frame'){ const b=bboxOf(it); const s=toScreen({x:b.x,y:b.y}); sctx.strokeStyle='#A9694A'; sctx.lineWidth=1.5; sctx.setLineDash([5,3]); sctx.strokeRect(s.x,s.y,b.w*camera.scale,b.h*camera.scale); sctx.setLineDash([]); } }
  }`,
  'drawSel'
);

// ===== 16. Interaction: frame + text tools + one-click auto-switch =====
rep(
`    if(tool==='connect'){ const it=hitTest(w.x,w.y);
      if(it && (it.kind==='note'||it.kind==='shape')){ drag={type:'connect',from:it.id,to:w}; } else { startPan(e); }
      return; }

    // --- select tool ---`,
`    if(tool==='connect'){ const it=hitTest(w.x,w.y);
      if(it && (it.kind==='note'||it.kind==='shape')){ drag={type:'connect',from:it.id,to:w}; } else { startPan(e); }
      return; }
    if(tool==='frame'){ drag={type:'frame',x:w.x,y:w.y,w:0,h:0}; return; }
    if(tool==='text'){ pushHistory(); const n=makeText(w.x-100,w.y-30); selectOnly(n.id); enterEdit(n); setTool('select'); return; }

    // --- select tool ---`,
  'pointerdown-frame-text'
);
rep(
`    if(tool==='note'){ pushHistory(); const n=makeNote(w.x-92,w.y-76,noteColor,''); selectOnly(n.id); return; }
    if(tool==='shape'){ pushHistory(); const s=makeShape(w.x,w.y,curShape); selectOnly(s.id); return; }`,
`    if(tool==='note'){ pushHistory(); const n=makeNote(w.x-92,w.y-76,noteColor,''); selectOnly(n.id); setTool('select'); return; }
    if(tool==='shape'){ pushHistory(); const s=makeShape(w.x,w.y,curShape); selectOnly(s.id); setTool('select'); return; }`,
  'note-shape-autoswitch'
);

// ===== 17. pointermove: frame drag =====
rep(
`    else if(drag.type==='marquee'){ ensureCapture(e); const p=getPos(e);
      drag.rect={x:Math.min(drag.rx,p.x),y:Math.min(drag.ry,p.y),w:Math.abs(p.x-drag.rx),h:Math.abs(p.y-drag.ry)};
      requestRender(); }
  });`,
`    else if(drag.type==='marquee'){ ensureCapture(e); const p=getPos(e);
      drag.rect={x:Math.min(drag.rx,p.x),y:Math.min(drag.ry,p.y),w:Math.abs(p.x-drag.rx),h:Math.abs(p.y-drag.ry)};
      requestRender(); }
    else if(drag.type==='frame'){ ensureCapture(e); const ww=wpt(e); drag.w=ww.x-drag.x; drag.h=ww.y-drag.y; requestRender(); }
  });`,
  'pointermove-frame'
);

// ===== 18. finishDrag: frame create + connect/eraser auto-switch =====
rep(
`    if(drag.type==='connect'){ const w=toWorld(getPos(e)); const tgt=hitTest(w.x,w.y);
      if(tgt && tgt.id!==drag.from && (tgt.kind==='note'||tgt.kind==='shape')){ pushHistory(); makeConnection(drag.from,tgt.id); } }`,
`    if(drag.type==='connect'){ const w=toWorld(getPos(e)); const tgt=hitTest(w.x,w.y);
      if(tgt && tgt.id!==drag.from && (tgt.kind==='note'||tgt.kind==='shape')){ pushHistory(); makeConnection(drag.from,tgt.id); setTool('select'); } }
    else if(drag.type==='frame'){ const x=Math.min(drag.x,drag.x+drag.w), y=Math.min(drag.y,drag.y+drag.h), w=Math.abs(drag.w), h=Math.abs(drag.h);
      if(w>12&&h>12){ pushHistory(); const f=makeFrame(x,y,w,h); selectOnly(f.id); setTool('select'); } }`,
  'finishDrag-connect-frame'
);
rep(
`    else if(drag.type==='move'){ document.querySelectorAll('.note.dragging').forEach(el=>el.classList.remove('dragging')); }
    drag=null; requestRender(); checkDirty();`,
`    else if(drag.type==='move'){ document.querySelectorAll('.note.dragging').forEach(el=>el.classList.remove('dragging')); }
    else if(drag.type==='erase'){ setTool('select'); }
    drag=null; requestRender(); checkDirty();`,
  'finishDrag-erase'
);

// ===== 19. startMoveDrag: frame children move together =====
rep(
`    if(!orig.length) return;
    drag={type:'move',ids:orig.map(o=>o.id),orig,start:w,sp:p,moved:false};`,
`    const frameIds=[...expandGroups(selection)].map(id=>getItem(id)).filter(o=>o&&o.kind==='frame');
    frameIds.forEach(f=>{
      if(!f) return;
      const cb={x:f.x,y:f.y,w:f.w,h:f.h};
      ['notes','shapes','strokes'].forEach(k=>{
        state[k].forEach(o=>{
          if(o===f) return;
          const c=centerOf(o);
          if(c && c.x>=cb.x && c.x<=cb.x+cb.w && c.y>=cb.y && c.y<=cb.y+cb.h){
            const ex=orig.find(x=>x.id===o.id);
            if(!ex){
              if(o.kind==='stroke'){
                const _pts=o.points.map(pt=>({x:pt.x,y:pt.y}));
                orig.push({id:o.id,kind:'stroke',points:_pts});
              } else {
                orig.push({id:o.id,kind:o.kind,x:o.x,y:o.y});
              }
            }
          }
        });
      });
    });
    if(!orig.length) return;
    drag={type:'move',ids:orig.map(o=>o.id),orig,start:w,sp:p,moved:false};`,
  'startMoveDrag-frame'
);

// ===== 20. serialize / restore frames =====
rep(
`      connections:state.connections, order:state.order, groups:state.groups
    });`,
`      connections:state.connections, order:state.order, groups:state.groups, frames:state.frames.map(f=>({...f}))
    });`,
  'serialize'
);
rep(
`    state.order=o.order||[]; state.groups=o.groups||[];
    rebuildAllNotes(); selection.clear();`,
`    state.order=o.order||[]; state.groups=o.groups||[];
    state.frames=o.frames||[];
    rebuildAllNotes(); selection.clear();`,
  'restore'
);

// ===== 21. createNoteEl plain + updateNoteEl plain + makeText =====
rep(
`    el.className='note'; el.dataset.id=note.id;`,
`    el.className='note'+(note.plain?' plain':''); el.dataset.id=note.id;`,
  'createNoteEl-plain'
);
rep(
`  function updateNoteEl(n){
`,
`  function updateNoteEl(n){
    if(n.plain && n.el){ const tx=n.el.querySelector('.txt'); if(tx){ tx.style.color=n.color||textColor; tx.style.fontSize=textSize+'px'; } }
`,
  'updateNoteEl-plain'
);
rep(
`  function makeNote(x,y,color,rich){
    const n={id:uid(),kind:'note',x,y,w:184,h:152,color,rich:rich||'',el:null};
    addItem(n); createNoteEl(n); return n;
  }`,
`  function makeNote(x,y,color,rich){
    const n={id:uid(),kind:'note',x,y,w:184,h:152,color,rich:rich||'',el:null};
    addItem(n); createNoteEl(n); return n;
  }
  function makeText(x,y){ const n={id:uid(),kind:'note',x,y,w:200,h:54,color:textColor,plain:true,rich:'',el:null}; addItem(n); createNoteEl(n); updateNoteEl(n); return n; }`,
  'makeText'
);

// ===== 22. INIT: call restorePrefs =====
rep(
`  setTool('select');
  updateHistBtns();
  bootBoards();`,
`  setTool('select');
  updateHistBtns();
  restorePrefs();
  bootBoards();`,
  'init-restoreprefs'
);

fs.writeFileSync(path.join(D, F), html, 'utf8');
console.log('Assembly complete. New size: ' + html.length + ' bytes');
