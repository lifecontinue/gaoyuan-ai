/* [孩子]成长评价系统 — 星空总览（Constellation View）
 * 灵感来自 https://xiaoercamera.xyz/me 的 3D 星座图交互：
 * 中心 = 学生，臂 = 领域/学科，叶 = 子领域/主题/指标，拖拽旋转、滚轮缩放、悬停高亮、点击下钻。
 * 纯 Canvas，无外部依赖，离线可用。
 */
(function () {
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pct = v => (v == null || isNaN(v)) ? '–' : (v * 100).toFixed(1) + '%';

  const G = window.Galaxy = {
    active: false,
    canvas: null, ctx: null,
    W: 0, H: 0, DPR: 1,
    nodes: [], links: [], bgstars: [],
    yaw: 0.35, pitch: -0.18, autoYaw: 0, zoom: 1,
    mx: -9999, my: -9999, hover: null,
    dragging: false, lx: 0, ly: 0, moved: false,
    stage: 'k', rafId: 0,

    enter(stage) {
      this.stage = stage || 'k';
      document.body.classList.add('galaxy-mode');
      const gal = $('#galaxy'); if (gal) gal.setAttribute('aria-hidden', 'false');
      this.active = true;
      this.initCanvas();
      this.buildNodes(this.stage);
      this.updateHud();
      this.updateStageButtons();
      this.bindEvents();
      if (!this.rafId) this.loop();
      // 初始提示
      this.showInfo(null);
    },

    // 星系为唯一常驻主界面，无独立"返回"；保留隐藏能力供将来扩展
    exit() {
      this.active = false;
      const gal = $('#galaxy'); if (gal) gal.setAttribute('aria-hidden', 'true');
      if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = 0; }
      this.unbindEvents();
    },

    toggle() {
      if (this.active) this.exit(); else this.enter((window.TT && window.TT.state && window.TT.state.stage) || 'k');
    },

    initCanvas() {
      let c = $('#galCanvas');
      // 如果静态 HTML 里没有 canvas（理论上不应该），创建一个兜底容器
      if (!c) {
        const gal = $('#galaxy');
        if (!gal) return;
        gal.innerHTML = `
          <canvas id="galCanvas"></canvas>
          <div class="gal-mark"><div class="gal-zh">星空总览</div><div class="gal-en">CONSTELLATION VIEW</div></div>
          <button class="gal-back" id="galBack" aria-label="返回工作区">← 返回工作区</button>
          <div class="gal-stage" id="galStage">
            <button data-stage="k"><span>🧸</span>幼儿园</button>
            <button data-stage="p"><span>🎒</span>小学</button>
          </div>
          <div class="gal-hud" id="galHud"></div>
          <div class="gal-infocard" id="galInfo"></div>
          <div class="gal-toolbar">
            <button id="galReset" title="重置视角">◎</button>
            <button id="galAuto" title="暂停/继续自转">⏸</button>
            <button id="galLabels" title="显示全部标签">T</button>
          </div>
        `;
        c = $('#galCanvas');
      }
      this.canvas = c; this.ctx = c.getContext('2d');
      this.resize();
      window.addEventListener('resize', this._resize);

      // 控件事件（静态 HTML 已存在，避免重复绑定）
      const back = $('#galBack'); if (back && !back._galBound) { back.onclick = () => this.exit(); back._galBound = true; }
      const stage = $('#galStage'); if (stage && !stage._galBound) {
        stage.onclick = e => { const b = e.target.closest('button'); if (!b || !window.TT || !window.TT.setStage) return; window.TT.setStage(b.dataset.stage); };
        stage._galBound = true;
      }
      const reset = $('#galReset'); if (reset && !reset._galBound) { reset.onclick = () => { this.yaw = 0.35; this.pitch = -0.18; this.zoom = 1; }; reset._galBound = true; }
      const auto = $('#galAuto'); if (auto && !auto._galBound) { auto.onclick = (ev) => { this.autoRotate = !this.autoRotate; ev.currentTarget.textContent = this.autoRotate ? '⏸' : '▶'; }; auto._galBound = true; }
      const labels = $('#galLabels'); if (labels && !labels._galBound) { labels.onclick = (ev) => { this.forceLabels = !this.forceLabels; ev.currentTarget.classList.toggle('on', this.forceLabels); }; labels._galBound = true; }
    },

    autoRotate: true,
    forceLabels: false,

    resize() {
      if (!this.canvas) return;
      this.DPR = Math.min(window.devicePixelRatio || 1, 2);
      this.W = window.innerWidth; this.H = window.innerHeight;
      this.canvas.width = this.W * this.DPR; this.canvas.height = this.H * this.DPR;
      this.canvas.style.width = this.W + 'px'; this.canvas.style.height = this.H + 'px';
      this.ctx.setTransform(this.DPR, 0, 0, this.DPR, 0, 0);
      if (!this.bgstars.length) this.makeBgStars();
    },
    _resize: () => G.resize(),

    makeBgStars() {
      this.bgstars = [];
      for (let i = 0; i < 800; i++) {
        const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
        const R = 520 + Math.random() * 1500;
        this.bgstars.push({
          x: R * Math.sin(ph) * Math.cos(th), y: R * Math.cos(ph), z: R * Math.sin(ph) * Math.sin(th),
          b: 0.22 + Math.random() * 0.78, tw: Math.random() * 6.283, sz: Math.random() < 0.13 ? 2.0 : 1.05,
          warm: Math.random() < 0.16
        });
      }
    },

    /* ---------- 节点构建 ---------- */
    buildNodes(stage) {
      this.nodes = []; this.links = [];
      const D = window.TT_DATA || {};
      const child = D.child || { name: '林悠然', nickname: '[孩子]' };
      const center = {
        id: 'child', kind: 'center',
        label: child.nickname || child.name || '[孩子]',
        en: (child.name || 'TUANTUAN').toUpperCase(),
        sub: [child.grade, child.kindergarten, child.school].filter(Boolean).join(' · ').slice(0, 60),
        score: null, trend: null, desc: child.address || '',
        color: [255, 124, 58], r: 10, x: 0, y: 0, z: 0,
        data: child
      };
      this.nodes.push(center);

      if (stage === 'k') this._buildKindergarten(D, center);
      else this._buildPrimary(D, center);

      // 计算每个节点的连接邻居缓存，便于 hover 高亮
      this.nbrMap = new Map();
      for (const L of this.links) {
        this.nbrMap.set(L[0], (this.nbrMap.get(L[0]) || new Set()).add(L[1]));
        this.nbrMap.set(L[1], (this.nbrMap.get(L[1]) || new Set()).add(L[0]));
      }
    },

    _buildKindergarten(D, center) {
      const DOMS = (D.domains || []);
      const periods = (D.periods || []).filter(p => p.stage === 'k').sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      const latest = periods.slice().reverse().find(p => (D.indicators || {})[p.id]);
      const latestIdx = periods.findIndex(p => p === latest);
      const prev = latestIdx > 0 ? periods.slice(0, latestIdx).reverse().find(p => (D.indicators || {})[p.id]) : null;
      const indBank = latest ? (D.indicators || {})[latest.id] : null;

      // 计算整体最新得分
      if (latest && latest.domainScores) {
        const vals = Object.values(latest.domainScores).filter(v => v != null);
        center.score = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
        if (prev && prev.domainScores) {
          const pvals = Object.values(prev.domainScores).filter(v => v != null);
          const pavg = pvals.length ? pvals.reduce((a, b) => a + b, 0) / pvals.length : null;
          center.trend = (center.score != null && pavg != null) ? center.score - pavg : null;
        }
      }

      const R1 = 260;
      DOMS.forEach((dom, di) => {
        const d = this.fibSphere(di, DOMS.length);
        const dx = d[0] * R1, dy = d[1] * R1, dz = d[2] * R1;
        const dcolor = this.hexToRgb(dom.color) || [255, 150, 100];
        const dscore = latest && latest.domainScores ? latest.domainScores[dom.key] : null;
        let dtrend = null;
        if (prev && prev.domainScores && dscore != null && prev.domainScores[dom.key] != null) {
          dtrend = dscore - prev.domainScores[dom.key];
        }
        const dnode = {
          id: 'dom-' + di, kind: 'domain', label: dom.key, en: dom.desc || '',
          sub: dom.desc || '', score: dscore, trend: dtrend,
          color: dcolor, domainKey: dom.key, data: dom,
          x: dx, y: dy, z: dz, r: 5.6
        };
        this.nodes.push(dnode); this.links.push([center, dnode]);

        // 子领域节点
        const rows = (indBank || []).filter(i => i.d === dom.key);
        const subs = {};
        rows.forEach(r => { subs[r.s] = subs[r.s] || []; subs[r.s].push(r); });
        const subKeys = Object.keys(subs);
        if (!subKeys.length) return;

        const up = Math.abs(d[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
        const t1 = this.norm(this.cross(d, up)), t2 = this.norm(this.cross(d, t1));
        const spread = 70 * (0.6 + 0.5 * Math.sqrt(subKeys.length));
        subKeys.forEach((sk, si) => {
          const a = (si / Math.max(1, subKeys.length)) * Math.PI * 2 + di * 1.3;
          const rr = spread * (0.78 + 0.34 * Math.random());
          const sx = dx + (Math.cos(a) * t1[0] + Math.sin(a) * t2[0]) * rr + d[0] * 44;
          const sy = dy + (Math.cos(a) * t1[1] + Math.sin(a) * t2[1]) * rr + d[1] * 44;
          const sz = dz + (Math.cos(a) * t1[2] + Math.sin(a) * t2[2]) * rr + d[2] * 44;
          const srows = subs[sk];
          const sscore = this.avgVal(srows.map(r => r.v));
          const stprev = prev ? ((D.indicators || {})[prev.id] || []).filter(r => r.d === dom.key && r.s === sk) : [];
          const sprevScore = stprev.length ? this.avgVal(stprev.map(r => r.v)) : null;
          const snode = {
            id: 'sub-' + di + '-' + si, kind: 'subdomain', label: sk, en: dom.key,
            sub: dom.key, score: sscore, trend: (sscore != null && sprevScore != null) ? sscore - sprevScore : null,
            color: dcolor, domainKey: dom.key, data: { domain: dom.key, subdomain: sk, rows: srows },
            x: sx, y: sy, z: sz, r: 3.6
          };
          this.nodes.push(snode); this.links.push([dnode, snode]);

          // 指标叶子：最多显示 12 条代表指标，避免过密
          const leafRows = srows.slice(0, 12);
          const lup = [0, 1, 0];
          const lt1 = this.norm(this.cross([sx, sy, sz], lup));
          const lt2 = this.norm(this.cross([sx, sy, sz], lt1));
          leafRows.forEach((r, li) => {
            const la = (li / Math.max(1, leafRows.length)) * Math.PI * 2 + si * 0.7;
            const lrr = 34 * (0.8 + 0.3 * Math.random());
            const dir = this.norm([sx, sy, sz]);
            const lx = sx + (Math.cos(la) * lt1[0] + Math.sin(la) * lt2[0]) * lrr + dir[0] * 12;
            const ly = sy + (Math.cos(la) * lt1[1] + Math.sin(la) * lt2[1]) * lrr + dir[1] * 12;
            const lz = sz + (Math.cos(la) * lt1[2] + Math.sin(la) * lt2[2]) * lrr + dir[2] * 12;
            const v = r.v;
            const lnode = {
              id: 'ind-' + di + '-' + si + '-' + li, kind: 'indicator', label: r.n, en: r.l || '',
              sub: r.g, score: v, trend: null,
              color: this.scoreColor(v, dcolor), domainKey: dom.key,
              data: r, x: lx, y: ly, z: lz, r: 1.8 + (v || 0) * 0.8
            };
            this.nodes.push(lnode); this.links.push([snode, lnode]);
          });
        });
      });
    },

    _buildPrimary(D, center) {
      const SUBJ = (window.TT_SUBJECTS_P3 || {}).subjects || [];
      const R1 = 280;
      SUBJ.forEach((subj, si) => {
        const d = this.fibSphere(si, SUBJ.length);
        const dx = d[0] * R1, dy = d[1] * R1, dz = d[2] * R1;
        const baseColor = this.subjectColor(subj.id);
        const snode = {
          id: 'subj-' + si, kind: 'subject', label: subj.name, en: subj.en || '',
          sub: (subj.core_competencies || []).slice(0, 2).join(' · '),
          score: null, trend: null, color: baseColor, data: subj,
          x: dx, y: dy, z: dz, r: 5.4
        };
        this.nodes.push(snode); this.links.push([center, snode]);

        const themes = subj.themes || [];
        if (!themes.length) return;
        const up = Math.abs(d[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
        const t1 = this.norm(this.cross(d, up)), t2 = this.norm(this.cross(d, t1));
        const spread = 72 * (0.6 + 0.5 * Math.sqrt(themes.length));
        themes.forEach((th, ti) => {
          const a = (ti / Math.max(1, themes.length)) * Math.PI * 2 + si * 1.3;
          const rr = spread * (0.78 + 0.34 * Math.random());
          const tx = dx + (Math.cos(a) * t1[0] + Math.sin(a) * t2[0]) * rr + d[0] * 44;
          const ty = dy + (Math.cos(a) * t1[1] + Math.sin(a) * t2[1]) * rr + d[1] * 44;
          const tz = dz + (Math.cos(a) * t1[2] + Math.sin(a) * t2[2]) * rr + d[2] * 44;
          const tnode = {
            id: 'theme-' + si + '-' + ti, kind: 'theme', label: th.title, en: subj.name,
            sub: subj.name, score: null, trend: null,
            color: baseColor, data: th, x: tx, y: ty, z: tz, r: 3.2
          };
          this.nodes.push(tnode); this.links.push([snode, tnode]);

          // 可评指标叶子
          const inds = (th.indicators || []).slice(0, 10);
          const lup = [0, 1, 0];
          const lt1 = this.norm(this.cross([tx, ty, tz], lup));
          const lt2 = this.norm(this.cross([tx, ty, tz], lt1));
          inds.forEach((ind, ii) => {
            const la = (ii / Math.max(1, inds.length)) * Math.PI * 2 + ti * 0.7;
            const lrr = 34 * (0.8 + 0.3 * Math.random());
            const dir = this.norm([tx, ty, tz]);
            const ix = tx + (Math.cos(la) * lt1[0] + Math.sin(la) * lt2[0]) * lrr + dir[0] * 12;
            const iy = ty + (Math.cos(la) * lt1[1] + Math.sin(la) * lt2[1]) * lrr + dir[1] * 12;
            const iz = tz + (Math.cos(la) * lt1[2] + Math.sin(la) * lt2[2]) * lrr + dir[2] * 12;
            const inode = {
              id: 'pind-' + si + '-' + ti + '-' + ii, kind: 'pindicator', label: ind.text || ind, en: '',
              sub: th.title, score: null, trend: null,
              color: [210, 210, 220], data: ind, x: ix, y: iy, z: iz, r: 1.6
            };
            this.nodes.push(inode); this.links.push([tnode, inode]);
          });
        });
      });
    },

    /* ---------- 数学 / 工具 ---------- */
    fibSphere(i, n) {
      const phi = Math.acos(1 - 2 * (i + 0.5) / n);
      const th = Math.PI * (1 + Math.sqrt(5)) * (i + 0.5);
      return [Math.sin(phi) * Math.cos(th), Math.cos(phi) * 0.72, Math.sin(phi) * Math.sin(th)];
    },
    cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; },
    norm(a) { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
    avgVal(arr) {
      const vs = (arr || []).filter(v => v != null && !isNaN(v));
      return vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : null;
    },
    hexToRgb(h) {
      const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(h);
      return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null;
    },
    scoreColor(v, fallback) {
      if (v == null || isNaN(v)) return [180, 180, 190];
      if (v >= 0.85) return [255, 150, 100];
      if (v >= 0.6) return [255, 210, 170];
      if (v >= 0.35) return [200, 200, 220];
      return [120, 140, 255];
    },
    subjectColor(id) {
      const map = {
        chinese: [232, 92, 72], math: [74, 144, 255], english: [120, 200, 120],
        science: [120, 220, 220], morals: [255, 180, 80], pe: [255, 140, 100],
        arts: [200, 120, 220], it: [80, 180, 255], labor: [180, 160, 120]
      };
      return map[id] || [255, 150, 100];
    },

    /* ---------- 投影与渲染 ---------- */
    project(n) {
      const cy = Math.cos(this.yaw + this.autoYaw), sy = Math.sin(this.yaw + this.autoYaw);
      let x = n.x * cy - n.z * sy, z = n.x * sy + n.z * cy, y = n.y;
      const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
      let y2 = y * cp - z * sp, z2 = y * sp + z * cp;
      const persp = 420 / (420 + z2);
      const s = persp * this.zoom;
      return { sx: this.W / 2 + x * s, sy: this.H / 2 + y2 * s, z: z2, scale: s, persp };
    },

    loop() {
      if (!this.active) return;
      this.render();
      this.rafId = requestAnimationFrame(() => this.loop());
    },

    render() {
      if (!this.ctx || !this.canvas) return;
      const ctx = this.ctx, W = this.W, H = this.H;
      if (this.autoRotate && !this.dragging) this.autoYaw += 0.00014;
      ctx.clearRect(0, 0, W, H);

      const now = performance.now() * 0.001;
      // 背景星场
      for (const s of this.bgstars) {
        const p = this.project(s);
        if (p.persp <= 0.04) continue;
        const tw = 0.6 + 0.4 * Math.sin(now * 1.2 + s.tw);
        const al = s.b * tw * Math.min(1, p.persp * 1.3);
        if (al < 0.02) continue;
        ctx.fillStyle = s.warm ? `rgba(255,205,170,${al})` : `rgba(240,244,255,${al})`;
        ctx.beginPath(); ctx.arc(p.sx, p.sy, Math.max(0.4, s.sz * p.persp), 0, 7); ctx.fill();
      }

      const P = this.nodes.map(n => this.project(n));
      // hover pick
      this.hover = null; let best = 1e9;
      for (let i = 0; i < this.nodes.length; i++) {
        const p = P[i]; const dd = Math.hypot(p.sx - this.mx, p.sy - this.my);
        const hitR = Math.max(14, this.nodes[i].r * p.scale + 10);
        if (dd < hitR && dd < best) { best = dd; this.hover = this.nodes[i]; this.hover._p = p; }
      }
      this.updateInfo(this.hover);
      if (this.canvas) this.canvas.style.cursor = this.dragging ? 'grabbing' : (this.hover ? 'pointer' : 'grab');

      const nbr = this.hover ? (this.nbrMap.get(this.hover) || new Set()) : new Set();

      // links
      const linkOrder = this.links.map((L, i) => ({ i, z: (this.project(L[0]).z + this.project(L[1]).z) / 2 })).sort((a, b) => a.z - b.z);
      for (const { i } of linkOrder) {
        const a = P[this.nodes.indexOf(this.links[i][0])], b = P[this.nodes.indexOf(this.links[i][1])];
        const active = this.hover && (this.links[i][0] === this.hover || this.links[i][1] === this.hover);
        const mid = (a.persp + b.persp) / 2;
        const A = active ? Math.min(0.7, (0.06 + 0.1 * mid) * 6) : Math.min(0.28, 0.1 + 0.13 * mid);
        const col = active ? '74,164,255' : '196,194,206';
        ctx.lineWidth = active ? 1.15 : 0.7;
        const tr = 0.26;
        const ax = a.sx + (b.sx - a.sx) * tr, ay = a.sy + (b.sy - a.sy) * tr;
        const bx = b.sx - (b.sx - a.sx) * tr, by = b.sy - (b.sy - a.sy) * tr;
        ctx.save(); ctx.setLineDash([2, 6]);
        ctx.strokeStyle = `rgba(${col},${A})`;
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
        ctx.restore();
      }

      // nodes
      const order = this.nodes.map((n, i) => ({ i, z: P[i].z })).sort((a, b) => a.z - b.z);
      for (const { i } of order) {
        const n = this.nodes[i], p = P[i];
        const depth = Math.max(0.25, p.persp);
        const isHover = this.hover === n;
        const gold = !isHover && nbr.has(n);
        const R = n.r * (0.35 + 0.7 * p.persp) * this.zoom * (isHover ? 1.35 : (gold ? 1.18 : 1));
        const col = isHover ? [255, 124, 58] : (gold ? [74, 164, 255] : n.color);
        const glowR = R * (n.kind === 'center' ? 4.3 : 4.1);
        const g = ctx.createRadialGradient(p.sx, p.sy, 0, p.sx, p.sy, glowR);
        g.addColorStop(0, `rgba(${col.join(',')},${isHover ? 0.9 : (n.kind === 'center' ? 0.82 : 0.75) * depth})`);
        g.addColorStop(0.35, `rgba(${col.join(',')},${isHover ? 0.35 : (n.kind === 'center' ? 0.28 : 0.24) * depth})`);
        g.addColorStop(1, `rgba(${col.join(',')},0)`);
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.sx, p.sy, glowR, 0, 7); ctx.fill();
        ctx.fillStyle = `rgba(${Math.min(255, col[0] + 40)},${Math.min(255, col[1] + 30)},${Math.min(255, col[2] + 20)},${0.98 * depth})`;
        ctx.beginPath(); ctx.arc(p.sx, p.sy, R, 0, 7); ctx.fill();
        if (gold) {
          ctx.strokeStyle = `rgba(74,164,255,${0.55 * depth})`; ctx.lineWidth = 0.9;
          ctx.beginPath(); ctx.arc(p.sx, p.sy, R + 5, 0, 7); ctx.stroke();
        }
        if (n.kind === 'center' || isHover) {
          ctx.strokeStyle = `rgba(255,124,58,${0.5 * depth})`; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(p.sx, p.sy, R + 7, 0, 7); ctx.stroke();
          if (isHover) {
            ctx.strokeStyle = 'rgba(255,124,58,.4)'; ctx.lineWidth = .7;
            ctx.beginPath(); ctx.moveTo(p.sx - R - 14, p.sy); ctx.lineTo(p.sx + R + 14, p.sy);
            ctx.moveTo(p.sx, p.sy - R - 14); ctx.lineTo(p.sx, p.sy + R + 14); ctx.stroke();
          }
        }

        // labels
        const showLabel = this.forceLabels || n.kind === 'center' || n.kind === 'domain' || n.kind === 'subject' ||
          n.kind === 'subhub' || isHover || gold ||
          ((n.kind === 'subdomain' || n.kind === 'theme') && p.persp > 0.75) ||
          ((n.kind === 'indicator' || n.kind === 'pindicator') && (isHover || p.persp > 0.92));
        if (showLabel) {
          const fs = n.kind === 'center' ? 17 : (n.kind === 'domain' || n.kind === 'subject' ? 13 : (n.kind === 'subdomain' || n.kind === 'theme' ? 11 : 10));
          const la = (isHover || gold) ? 1 : (0.5 * depth + 0.18);
          ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
          const ox = R + 10;
          ctx.font = `${n.kind === 'center' || n.kind === 'domain' || n.kind === 'subject' ? '500 ' : ''}${fs}px "Noto Serif SC","PingFang SC","Microsoft YaHei",serif`;
          ctx.fillStyle = isHover ? `rgba(255,150,90,${la})` : (gold ? `rgba(74,164,255,${la})` : `rgba(255,255,255,${la})`);
          ctx.fillText(n.label, p.sx + ox, p.sy - (n.en ? 5 : 0));
          if (n.en && n.kind !== 'indicator' && n.kind !== 'pindicator') {
            ctx.font = `${Math.max(8, fs * 0.62)}px "Cutive Mono","Consolas",monospace`;
            ctx.fillStyle = `rgba(255,255,255,${0.35 * la + 0.1})`;
            ctx.fillText(n.en.toUpperCase(), p.sx + ox, p.sy + fs * 0.62);
          }
        }
      }
    },

    /* ---------- 信息卡 ---------- */
    updateInfo(n) {
      const el = $('#galInfo'); if (!el) return;
      if (n === this._lastInfoNode) return;
      this._lastInfoNode = n;
      if (!n) { el.classList.remove('show'); return; }
      let html = '';
      if (n.kind === 'center') {
        const s = n.score != null ? pct(n.score) : '–';
        const trend = n.trend != null ? (n.trend >= 0 ? `▲ ${(n.trend * 100).toFixed(1)}pt` : `▼ ${Math.abs(n.trend * 100).toFixed(1)}pt`) : '';
        html = `<div class="gi-title">${esc(n.label)}<span class="gi-en">${esc(n.en || '')}</span></div>` +
          `<div class="gi-sub">${esc(n.sub || '')}</div>` +
          `<div class="gi-row"><span>最新综合得分率</span><b>${s}</b> ${trend ? `<i class="${n.trend >= 0 ? 'up' : 'down'}">${trend}</i>` : ''}</div>` +
          `<div class="gi-row"><span>当前阶段</span><b>${esc(this.stageLabel())}</b></div>` +
          `<div class="gi-hint">拖拽旋转 · 滚轮缩放 · 点击节点下钻</div>`;
      } else if (n.kind === 'domain' || n.kind === 'subject') {
        const score = n.score != null ? pct(n.score) : '暂无测评';
        const trend = n.trend != null ? (n.trend >= 0 ? `▲ ${(n.trend * 100).toFixed(1)}pt` : `▼ ${Math.abs(n.trend * 100).toFixed(1)}pt`) : '';
        html = `<div class="gi-title">${esc(n.label)}<span class="gi-en">${esc(n.en || '')}</span></div>` +
          `<div class="gi-sub">${esc(n.sub || '')}</div>` +
          `<div class="gi-row"><span>得分</span><b>${score}</b> ${trend ? `<i class="${n.trend >= 0 ? 'up' : 'down'}">${trend}</i>` : ''}</div>` +
          `<div class="gi-hint">点击查看详情</div>`;
      } else if (n.kind === 'subdomain' || n.kind === 'theme') {
        const score = n.score != null ? pct(n.score) : '暂无测评';
        const count = n.data && n.data.rows ? n.data.rows.length : (n.data && n.data.indicators ? n.data.indicators.length : 0);
        html = `<div class="gi-title">${esc(n.label)}<span class="gi-en">${esc(n.en || '')}</span></div>` +
          `<div class="gi-sub">${esc(n.sub || '')}</div>` +
          `<div class="gi-row"><span>得分</span><b>${score}</b></div>` +
          (count ? `<div class="gi-row"><span>包含指标</span><b>${count} 项</b></div>` : '') +
          `<div class="gi-hint">点击查看明细</div>`;
      } else if (n.kind === 'indicator' || n.kind === 'pindicator') {
        const r = n.data || {};
        const level = r.l || r.level || '';
        html = `<div class="gi-title">${esc(n.label)}</div>` +
          `<div class="gi-sub">${esc(r.g || r.sub || n.sub || '')}</div>` +
          `<div class="gi-row"><span>评价</span><b>${level || '—'}</b></div>` +
          (r.r ? `<div class="gi-note">${esc(r.r)}</div>` : '') +
          `<div class="gi-hint">属于 ${esc(n.sub || '')}</div>`;
      }
      el.innerHTML = html; el.classList.add('show');
      // 同步 AI 上下文
      if (window.TT && window.TT.AI && window.TT.AI.setContext) {
        window.TT.AI.setContext({ route: 'galaxy', domain: n.domainKey || n.label || null });
      }
    },

    /* ---------- HUD / 工具 ---------- */
    updateHud() {
      const el = $('#galHud'); if (!el) return;
      const label = this.stageLabel();
      const count = this.nodes.length;
      el.innerHTML = `<span>阶段</span> <b>${esc(label)}</b><br><span>节点</span> <b>${count}</b>`;
    },
    stageLabel() {
      const S = (window.TT && window.TT.STAGES) || (window.TT_DATA && window.TT_DATA.meta && window.TT_DATA.meta.stages) || {};
      return (S[this.stage] || {}).label || this.stage;
    },
    updateStageButtons() {
      const seg = $('#galStage'); if (!seg) return;
      $$('#galStage button').forEach(b => b.classList.toggle('on', b.dataset.stage === this.stage));
    },

    /* ---------- 事件 ---------- */
    bindEvents() {
      if (this._bound) return;
      this._bound = true;
      const c = this.canvas;
      this._md = e => { this.dragging = true; this.moved = false; this.lx = e.clientX; this.ly = e.clientY; document.documentElement.classList.add('gal-dragging'); };
      this._mu = () => { this.dragging = false; document.documentElement.classList.remove('gal-dragging'); };
      this._mm = e => {
        this.mx = e.clientX; this.my = e.clientY;
        if (!this.dragging) return;
        const dx = e.clientX - this.lx, dy = e.clientY - this.ly;
        if (Math.abs(dx) + Math.abs(dy) > 3) this.moved = true;
        this.yaw += dx * 0.006; this.pitch = Math.max(-1.2, Math.min(1.2, this.pitch + dy * 0.005));
        this.lx = e.clientX; this.ly = e.clientY;
      };
      this._wh = e => {
        e.preventDefault();
        this.zoom = Math.max(0.45, Math.min(2.6, this.zoom * (e.deltaY > 0 ? 0.92 : 1.08)));
      };
      this._cl = () => {
        if (this.moved || !this.hover) return;
        this.clickNode(this.hover);
      };
      c.addEventListener('mousedown', this._md);
      window.addEventListener('mouseup', this._mu);
      window.addEventListener('mousemove', this._mm);
      c.addEventListener('wheel', this._wh, { passive: false });
      c.addEventListener('click', this._cl);
    },
    unbindEvents() {
      if (!this._bound) return;
      this._bound = false;
      const c = this.canvas;
      c.removeEventListener('mousedown', this._md);
      window.removeEventListener('mouseup', this._mu);
      window.removeEventListener('mousemove', this._mm);
      c.removeEventListener('wheel', this._wh, { passive: false });
      c.removeEventListener('click', this._cl);
      window.removeEventListener('resize', this._resize);
    },

    clickNode(n) {
      if (window.TT && window.TT.openNode) window.TT.openNode(n);
    },

    // 搜索定位：匹配关键词的节点并旋转视角高亮
    focusNode(q) {
      q = (q || '').trim().toLowerCase();
      if (!q) return false;
      const hits = this.nodes.filter(n => (n.label || '').toLowerCase().includes(q) || (n.en || '').toLowerCase().includes(q));
      if (!hits.length) return false;
      const order = ['center', 'domain', 'subject', 'subdomain', 'theme', 'indicator', 'pindicator'];
      hits.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
      const n = hits[0];
      this.hover = n;
      const R = Math.hypot(n.x, n.y, n.z) || 1;
      this.yaw = Math.atan2(n.z, n.x) + Math.PI / 2 - this.autoYaw;
      this.pitch = -Math.asin(Math.max(-1, Math.min(1, n.y / R)));
      this.showInfo(n);
      return true;
    },

    showInfo(n) { this.updateInfo(n); }
  };
})();
