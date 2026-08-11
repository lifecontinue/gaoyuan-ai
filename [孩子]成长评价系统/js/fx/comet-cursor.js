/* =========================================================
   fx/comet-cursor.js — 彗星光标 + 拖拽拖尾
   职责：在银河画布上把系统鼠标替换为一颗彗星（发光核心 + 速度方向短尾），
        拖动时沿途留下渐隐的粒子轨迹，贴合"星空"主题。
   解耦：不 import 应用层；仅通过 window.Galaxy 读取 hover 节点用于"可点击"
        视觉提示（彗星变暖 + 圆环），通过 window.__TT_COMET 通知银河不要再
        每帧覆盖 canvas.style.cursor。
   ========================================================= */

const TAU = Math.PI * 2;

export const CometCursor = {
  enabled: false,
  target: null,          // #galCanvas
  canvas: null, ctx: null,
  W: 0, H: 0, DPR: 1,

  /* 头部（平滑跟随） */
  x: 0, y: 0, tx: 0, ty: 0, vx: 0, vy: 0, hasPos: false,
  over: false,           // 指针是否在星空画布上
  _down: false,          // 是否按下（拖动中）

  tail: [],              // 彗星短尾：最近的头部位置（index 0 最新）
  particles: [],         // 拖拽留下的拖尾粒子
  maxTail: 16,
  maxParticles: 260,
  raf: 0,

  init() {
    const target = document.getElementById('galCanvas');
    if (!target) return;
    this.target = target;

    const c = document.createElement('canvas');
    c.id = 'cometFx';
    c.setAttribute('aria-hidden', 'true');
    document.body.appendChild(c);
    this.canvas = c;
    this.ctx = c.getContext('2d');

    this._resize();
    window.addEventListener('resize', () => this._resize());
    this._bind();
    this.enable();
  },

  enable() {
    if (this.enabled || !this.target) return;
    this.enabled = true;
    window.__TT_COMET = true;              // 通知 galaxy 不要再覆盖 cursor
    this.target.style.cursor = 'none';     // 隐藏系统鼠标（仅在星空画布上）
    if (!this.raf) this._loop();
  },

  disable() {
    this.enabled = false;
    window.__TT_COMET = false;
    if (this.target) this.target.style.cursor = '';
    if (this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; }
    if (this.ctx) this.ctx.clearRect(0, 0, this.W, this.H);
    this.tail.length = 0; this.particles.length = 0;
  },

  /* ---------- 内部 ---------- */
  _resize() {
    if (!this.canvas) return;
    this.DPR = Math.min(window.devicePixelRatio || 1, 2);
    this.W = window.innerWidth; this.H = window.innerHeight;
    this.canvas.width = this.W * this.DPR;
    this.canvas.height = this.H * this.DPR;
    this.canvas.style.width = this.W + 'px';
    this.canvas.style.height = this.H + 'px';
    this.ctx.setTransform(this.DPR, 0, 0, this.DPR, 0, 0);
  },

  _bind() {
    window.addEventListener('pointermove', (e) => {
      this.tx = e.clientX; this.ty = e.clientY; this.hasPos = true;
      this.over = (e.target === this.target);
      if (!this.hasPos) { this.x = this.tx; this.y = this.ty; }
    }, { passive: true });
    window.addEventListener('pointerdown', (e) => { if (e.target === this.target) this._down = true; }, { passive: true });
    window.addEventListener('pointerup', () => { this._down = false; }, { passive: true });
    window.addEventListener('pointercancel', () => { this._down = false; }, { passive: true });
    document.addEventListener('pointerleave', () => { this.over = false; });
    window.addEventListener('blur', () => { this.over = false; this._down = false; });
  },

  _spawnTrail(boost) {
    const n = boost ? 4 : 2;
    for (let k = 0; k < n; k++) {
      this.particles.push({
        x: this.x + (Math.random() - 0.5) * 4,
        y: this.y + (Math.random() - 0.5) * 4,
        vx: (Math.random() - 0.5) * 0.6 - this.vx * 0.18,
        vy: (Math.random() - 0.5) * 0.6 - this.vy * 0.18 - 0.08,
        life: 1,
        decay: 0.010 + Math.random() * 0.022,
        size: 1.1 + Math.random() * 2.3,
        warm: Math.random() < 0.16,
      });
    }
    if (this.particles.length > this.maxParticles) {
      this.particles.splice(0, this.particles.length - this.maxParticles);
    }
  },

  _updateParticles() {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx; p.y += p.vy;
      p.vx *= 0.96; p.vy *= 0.96;
      p.life -= p.decay;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
  },

  _drawParticles() {
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.particles) {
      const a = Math.max(0, p.life);
      const r = p.size * (0.5 + p.life);
      const col = p.warm ? '255,198,150' : '150,212,255';
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 3);
      g.addColorStop(0, `rgba(${col},${0.5 * a})`);
      g.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(p.x, p.y, r * 3, 0, TAU); ctx.fill();
      ctx.fillStyle = `rgba(255,255,255,${0.75 * a})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.4, r * 0.5), 0, TAU); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  },

  _drawTail() {
    const ctx = this.ctx, tail = this.tail;
    if (tail.length < 2) return;
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (let i = tail.length - 1; i >= 1; i--) {
      const newer = tail[i - 1], older = tail[i];
      const t = 1 - i / tail.length;          // 越靠近头部 t 越大
      ctx.strokeStyle = `rgba(140,205,255,${0.5 * t * t})`;
      ctx.lineWidth = 6.5 * t;
      ctx.beginPath();
      ctx.moveTo(older.x, older.y);
      ctx.lineTo(newer.x, newer.y);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  },

  _drawHead(hovering, now) {
    const ctx = this.ctx, x = this.x, y = this.y;
    const pulse = 1 + 0.12 * Math.sin(now * 4);
    const glowR = (hovering ? 30 : 22) * pulse;
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(x, y, 0, x, y, glowR);
    if (hovering) {
      g.addColorStop(0, 'rgba(255,196,128,0.85)');
      g.addColorStop(0.4, 'rgba(255,150,80,0.32)');
      g.addColorStop(1, 'rgba(255,150,80,0)');
    } else {
      g.addColorStop(0, 'rgba(190,228,255,0.8)');
      g.addColorStop(0.4, 'rgba(120,190,255,0.26)');
      g.addColorStop(1, 'rgba(120,190,255,0)');
    }
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, glowR, 0, TAU); ctx.fill();
    /* 亮核 */
    ctx.fillStyle = 'rgba(255,255,255,0.98)';
    ctx.beginPath(); ctx.arc(x, y, hovering ? 3.4 : 2.6, 0, TAU); ctx.fill();
    /* 悬停节点时的可点击圆环提示 */
    if (hovering) {
      ctx.strokeStyle = 'rgba(255,170,90,0.9)';
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(x, y, 9 + 2 * Math.sin(now * 5), 0, TAU); ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  },

  _loop() {
    this.raf = requestAnimationFrame(() => this._loop());
    const ctx = this.ctx; if (!ctx) return;
    const G = window.Galaxy;
    const dragging = this._down || !!(G && G.dragging);
    const visible = this.enabled && this.hasPos && (this.over || dragging);

    /* 平滑跟随 */
    if (this.hasPos) {
      const px = this.x, py = this.y;
      this.x += (this.tx - this.x) * 0.4;
      this.y += (this.ty - this.y) * 0.4;
      this.vx = this.x - px; this.vy = this.y - py;
    }

    /* 拖动时发射拖尾粒子 */
    if (visible && dragging) this._spawnTrail(true);
    /* 更新 + 清屏 + 画拖尾（粒子即使鼠标移出也会自然淡出） */
    this._updateParticles();
    ctx.clearRect(0, 0, this.W, this.H);
    if (this.particles.length) this._drawParticles();

    if (!visible) { if (this.tail.length) this.tail.length = 0; return; }

    /* 彗星短尾缓冲（index 0 最新） */
    this.tail.unshift({ x: this.x, y: this.y });
    if (this.tail.length > this.maxTail) this.tail.pop();

    const hovering = !!(G && G.hover);
    this._drawTail();
    this._drawHead(hovering, performance.now() * 0.001);
  },
};

if (typeof window !== 'undefined') window.CometCursor = CometCursor;
