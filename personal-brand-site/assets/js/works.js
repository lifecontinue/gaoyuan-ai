// works.js — 滚动式 Work 展示区：章节卡片 + Three.js 渐变背景（随滚动在章节间平滑过渡）
// 与首页冷调液态玻璃同源；Three.js 不可用时降级为 CSS 渐变兜底。

import { apps } from "./data/apps.js";

const reduceMotion =
  window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// 三个章节：方向 + 所含应用 id + 渐变配色（0..1，冷调液态玻璃）
const CHAPTERS = [
  {
    title: "游戏与互动",
    note: "实时对战 · 体感 · 旅行叙事",
    ids: ["tank-wars", "neck-soccer", "travel-map", "fret-flow"],
    colorA: [0.086, 0.196, 0.310], colorB: [0.184, 0.490, 0.620]
  },
  {
    title: "育儿与教育",
    note: "成长记录 · 评估 · 数据",
    ids: ["growth-stars", "child-assessment", "poop-tracker"],
    colorA: [0.141, 0.102, 0.227], colorB: [0.420, 0.275, 0.659]
  },
  {
    title: "生产力与身心健康",
    note: "PM 成长 · 白板协作 · 正念陪伴",
    ids: ["pm-growth-os", "collab-whiteboard", "breathe"],
    colorA: [0.063, 0.227, 0.212], colorB: [0.690, 0.478, 0.165]
  }
];

/* ── 构建章节卡片（数据来自 apps.js，单一事实源） ── */
function buildChapters() {
  const host = document.getElementById("worksChapters");
  if (!host) return;
  CHAPTERS.forEach((ch, ci) => {
    const sec = document.createElement("section");
    sec.className = "works-chapter";
    sec.dataset.index = String(ci);

    const head = document.createElement("div");
    head.className = "chapter-head";
    head.innerHTML =
      `<span class="chapter-index">0${ci + 1}</span>` +
      `<h3 class="chapter-title">${ch.title}</h3>` +
      `<span class="chapter-note">${ch.note}</span>`;

    const grid = document.createElement("div");
    grid.className = "chapter-grid";
    ch.ids.forEach((id, k) => {
      const app = apps.find((a) => a.id === id);
      if (!app) return;
      const card = document.createElement("a");
      card.className = "work-card reveal";
      card.href = app.url || "#";
      // 站内路由（以 / 开头）同标签打开，避免练琴时丢掉品牌站；外链新标签打开
      if (app.url && app.url.startsWith("/")) {
        card.target = "_self";
        card.rel = "noopener";
      } else {
        card.target = "_blank";
        card.rel = "noopener noreferrer";
      }
      card.style.transitionDelay = (k * 80) + "ms";
      const tags = (app.tags || []).map((t) => `<span>${t}</span>`).join("");
      card.innerHTML =
        `<div class="work-card__top">` +
          `<h4 class="work-card__name">${app.en}</h4>` +
          (app.name ? `<span class="work-card__en">${app.name}</span>` : "") +
          `<span class="work-card__tagline">${app.tagline || ""}</span>` +
        `</div>` +
        `<p class="work-card__desc">${app.desc || ""}</p>` +
        `<div class="work-card__tags">${tags}</div>` +
        `<span class="work-card__cta">打开应用 ↗</span>`;
      grid.appendChild(card);
    });

    sec.appendChild(head);
    sec.appendChild(grid);
    host.appendChild(sec);
  });
}

/* ── 滚动渐入 ── */
function initReveal() {
  const els = document.querySelectorAll(".reveal");
  if (reduceMotion) { els.forEach((e) => e.classList.add("in")); return; }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
    });
  }, { threshold: 0.15, rootMargin: "0px 0px -8% 0px" });
  els.forEach((e) => io.observe(e));
}

/* ── 滚动离开首屏：隐藏房间期底部 ticker / 移动端索引条 ── */
function initScrollChrome() {
  const onScroll = () => {
    const y = window.scrollY || window.pageYOffset || 0;
    document.body.classList.toggle("is-scrolled", y > 60);
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
}

/* ── Three.js 渐变背景 ── */
let THREE = null;
let renderer, scene, camera, canvas, material, uniforms;
let curA, curB, tgtA, tgtB;
const clock = { last: 0 };
let running = false, rafId = null;
let scrollScheduled = false;

const FRAG = `
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uAlpha;
uniform float uScroll;

float hash(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float noise(vec2 p){
  vec2 i=floor(p); vec2 f=fract(p);
  float a=hash(i), b=hash(i+vec2(1.,0.)), c=hash(i+vec2(0.,1.)), d=hash(i+vec2(1.,1.));
  vec2 u=f*f*(3.-2.*f);
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}
float fbm(vec2 p){
  float v=0., amp=0.5;
  for(int i=0;i<5;i++){ v+=amp*noise(p); p*=2.02; amp*=0.5; }
  return v;
}
void main(){
  vec2 uv = vUv;
  float flow = uTime*0.04;
  float n = fbm(vec2(uv.x*2.2 + flow, uv.y*3.2 - flow*0.6 + uScroll*0.12));
  float g = clamp(uv.y*0.72 + n*0.40 + 0.06, 0.0, 1.0);
  vec3 col = mix(uColorA, uColorB, g);
  float scan = abs(fract(uv.y*1.6 - uTime*0.05) - 0.5);
  col += vec3(0.10,0.14,0.20) * smoothstep(0.5,0.0,scan) * 0.10;
  float vig = smoothstep(1.25, 0.25, length((uv-0.5)*vec2(1.0,1.1)));
  col *= mix(0.80, 1.08, vig);
  gl_FragColor = vec4(col, uAlpha);
}
`;

const VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

async function initGradient() {
  canvas = document.querySelector(".works-bg");
  if (!canvas) return;
  try {
    THREE = await import("three");
  } catch (e) {
    console.warn("[works] Three.js unavailable — using CSS gradient fallback.", e);
    canvas.style.opacity = "1";
    return;
  }

  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));

    scene = new THREE.Scene();
    camera = new THREE.Camera(); // 全屏 quad 不需要变换
    const geo = new THREE.PlaneGeometry(2, 2);

    curA = CHAPTERS[0].colorA.slice();
    curB = CHAPTERS[0].colorB.slice();
    tgtA = curA.slice();
    tgtB = curB.slice();

    uniforms = {
      uTime: { value: 0 },
      uColorA: { value: new THREE.Vector3(curA[0], curA[1], curA[2]) },
      uColorB: { value: new THREE.Vector3(curB[0], curB[1], curB[2]) },
      uAlpha: { value: 0.98 },
      uScroll: { value: 0 }
    };
    material = new THREE.ShaderMaterial({
      uniforms, transparent: true, vertexShader: VERT, fragmentShader: FRAG
    });
    scene.add(new THREE.Mesh(geo, material));

    resize();
    window.addEventListener("resize", debounce(resize, 150));
    window.addEventListener("scroll", onScrollGradient, { passive: true });
    updateChapterTarget();
    onScrollGradient();

    if (reduceMotion) {
      renderer.render(scene, camera);
      canvas.style.opacity = "1";
    } else {
      running = true;
      clock.last = performance.now();
      loop(clock.last);
    }
  } catch (e) {
    console.warn("[works] Gradient init failed — CSS fallback.", e);
    canvas.style.opacity = "1";
  }
}

function resize() {
  if (!renderer || !canvas) return;
  const w = canvas.clientWidth || window.innerWidth;
  const h = canvas.clientHeight || window.innerHeight;
  renderer.setSize(w, h, false);
}

function onScrollGradient() {
  if (scrollScheduled) return;
  scrollScheduled = true;
  requestAnimationFrame(() => {
    scrollScheduled = false;
    updateChapterTarget();
    const vh = window.innerHeight || 1;
    const y = window.scrollY || window.pageYOffset || 0;
    const a = clamp((y - vh * 0.45) / (vh * 0.55), 0, 1);
    if (canvas) canvas.style.opacity = String(a);
    if (uniforms) uniforms.uScroll.value = y / vh;
  });
}

// 找到视口中心最接近的章节 → 设定目标渐变色
function updateChapterTarget() {
  const secs = document.querySelectorAll(".works-chapter");
  if (!secs.length) return;
  const mid = (window.innerHeight || 1) / 2;
  let active = 0, best = Infinity;
  secs.forEach((sec, i) => {
    const r = sec.getBoundingClientRect();
    const d = Math.abs(r.top + r.height / 2 - mid);
    if (d < best) { best = d; active = i; }
  });
  tgtA = CHAPTERS[active].colorA.slice();
  tgtB = CHAPTERS[active].colorB.slice();
}

function loop(now) {
  if (!running) return;
  rafId = requestAnimationFrame(loop);
  const dt = Math.min((now - clock.last) / 1000, 0.05);
  clock.last = now;
  if (uniforms) {
    uniforms.uTime.value = now / 1000;
    // 在章节目标色之间平滑插值 → 滚动切换时的「渐变过渡」
    for (let i = 0; i < 3; i++) {
      curA[i] += (tgtA[i] - curA[i]) * Math.min(1, dt * 2.2);
      curB[i] += (tgtB[i] - curB[i]) * Math.min(1, dt * 2.2);
    }
    uniforms.uColorA.value.set(curA[0], curA[1], curA[2]);
    uniforms.uColorB.value.set(curB[0], curB[1], curB[2]);
  }
  renderer.render(scene, camera);
}

function onVisibility() {
  if (document.hidden) {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
  } else if (!reduceMotion && !running && renderer) {
    running = true;
    clock.last = performance.now();
    loop(clock.last);
  }
}

function debounce(fn, ms) {
  let id;
  return (...a) => { clearTimeout(id); id = setTimeout(() => fn(...a), ms); };
}

/* ── 启动 ── */
function init() {
  buildChapters();
  initReveal();
  initScrollChrome();
  document.addEventListener("visibilitychange", onVisibility);
  initGradient();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
