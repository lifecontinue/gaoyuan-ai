// three-layer.js — 液态玻璃（Liquid Glass）冷调 3D 增强层（零构建 · Three.js · 优雅降级）
//
// 设计约束（与现有视觉严格一致）：
//   - 色板沿用首页冷调书房体系（源自 tokens.css --glass-* 兜底值）：
//     冷蓝 / 钢蓝 / 雾蓝，辅以少量琥珀点缀呼应站点强调色
//   - 不引入 React / bundler；通过 importmap + 动态 import 加载 Three.js
//   - CDN 不可用时静默跳过，绝不让主站崩溃
//   - 画布作为 .room-stage 的第一个子节点，z-index 5（房间图之上、热点之下）
//   - 热点坐标按百分比精确映射到画布，与现有 CSS hotspot 对齐
//
// 四层内容：
//   1) 冷调光尘粒子层（含「三体」弱引力微扰，缓速漂浮，连贯流场）
//   2) 粒子之间 faint 网络连线（科技感「神经网络」意象，固定近邻对、逐帧更新端点）
//   3) 应用热点位置的冷玻璃徽章（缓慢自转 + 微浮 + 三颗环绕余烬）+ 徽章之间的「产品星座」连线
//   4) 加载完成淡入；面板/抽屉打开或页面滚动离开时模糊压暗；页面隐藏暂停；reduced-motion 降级

import { apps } from "./data/apps.js";
import { rooms } from "./data/rooms.js";

let THREE = null;            // 动态加载后注入
let renderer, scene, camera, canvas;
let particles = null;        // 粒子系统
let links = null;            // 网络连线（LineSegments）
let linkGeo = null;          // 连线几何
let linkPairs = [];          // 近邻对 [[i,j], ...]
let constellation = null;    // 徽章「产品星座」连线
let badges = [];             // 徽章组（含 userData）
let rafId = null;
let running = false;
let dimObserver = null;
const clock = { last: 0 };
let W = 1, H = 1;            // 画布像素尺寸（= room-stage 布局尺寸）

const reduceMotion =
  window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const isMobile = window.matchMedia("(max-width: 767px)").matches;

// 冷调液态玻璃色板（0..1，对应 --glass-* 冷蓝/钢蓝/雾蓝）
const PALETTE = [
  [0.46, 0.60, 0.82],  // 冷蓝
  [0.66, 0.78, 0.95],  // 浅钢蓝
  [0.40, 0.56, 0.74],  // 雾蓝
  [0.55, 0.70, 0.88],  // 天蓝
  [0.52, 0.62, 0.78],  // 暗蓝灰
];

export async function initThreeLayer(roomId) {
  const stage = document.querySelector(".room-stage");
  if (!stage) return;

  // 动态加载 Three.js，失败则静默降级
  try {
    THREE = await import("three");
  } catch (e) {
    console.warn("[three-layer] Failed to load Three.js — skipping the 3D enhancement layer.", e);
    return;
  }

  // 创建画布并插入到 stage 最底层（房间图之上、热点之下）
  canvas = document.createElement("canvas");
  canvas.className = "three-layer";
  canvas.setAttribute("aria-hidden", "true");
  stage.insertBefore(canvas, stage.firstChild);

  try {
    setupRenderer();
    setupScene();
    buildParticles();
    buildLinks();
    buildBadges(roomId);
    buildConstellation();
    bindObservers();
    resize();

    window.addEventListener("resize", debounce(resize, 150));
    document.addEventListener("visibilitychange", onVisibility);
    // 滚动离开首屏时压暗背景 3D 层（与 works 区块联动）
    window.addEventListener("scroll", onScrollDim, { passive: true });

    if (reduceMotion) {
      // 降级：只渲染一帧静态画面，不启动动画循环
      renderer.render(scene, camera);
      canvas.classList.add("is-ready");
    } else {
      running = true;
      canvas.classList.add("is-ready");
      clock.last = performance.now();
      loop(clock.last);
    }
  } catch (e) {
    console.warn("[three-layer] Init error — falling back to the non-3D state.", e);
    if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
  }
}

/* ── 渲染器 ── */
function setupRenderer() {
  renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: !isMobile,
    powerPreference: "low-power"
  });
  renderer.setClearColor(0x000000, 0); // 透明，露出下方房间图
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
}

/* ── 场景 + 正交相机（1 世界单位 = 1 像素，y 轴向下，便于百分比对齐） ── */
function setupScene() {
  scene = new THREE.Scene();
  const aspect = (rooms[0] && rooms[0].aspect) || 1376 / 768;
  // 初始占位，resize() 会重置真实边界
  camera = new THREE.OrthographicCamera(0, 100, 0, -100, -2000, 2000);
  camera.position.z = 600;

  // 灯光：冷调环境 + 中心冷点光 + 边缘补光，给玻璃徽章以轻微立体感
  scene.add(new THREE.AmbientLight(0xcfe0f7, 1.0));
  const key = new THREE.PointLight(0xbcd2f0, 1.15, 0, 1.6);
  key.position.set(0, 0, 400);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xaecbf0, 0.55);
  rim.position.set(-0.4, 0.6, 1);
  scene.add(rim);
  void aspect;
}

/* ── 生成柔和圆形光点贴图（粒子 / 辉光通用） ── */
function makeSpriteTexture() {
  const s = 64;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.25, "rgba(255,255,255,0.85)");
  grd.addColorStop(0.6, "rgba(255,255,255,0.25)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

/* ── 层级 1：冷调光尘粒子（含三体引力微扰 + 连贯流场） ── */
function buildParticles() {
  const count = isMobile ? 150 : 320;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);

  // 三个引力井 = 当前房间热点位置（世界坐标），对应「三体」
  const wells = apps
    .filter((a) => (a.placements || []).some((p) => p.room === currentRoomId()))
    .flatMap((a) => a.placements.filter((p) => p.room === currentRoomId()))
    .map((p) => ({ x: p.x, y: p.y, px: 0, py: 0 }));

  for (let i = 0; i < count; i++) {
    const x = Math.random() * 100;
    const y = Math.random() * 100;
    positions[i * 3] = x;       // 百分比占位，resize 时换算为像素
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 40;

    const col = PALETTE[(Math.random() * PALETTE.length) | 0];
    colors[i * 3] = col[0];
    colors[i * 3 + 1] = col[1];
    colors[i * 3 + 2] = col[2];

    sizes[i] = isMobile ? 7 + Math.random() * 9 : 9 + Math.random() * 16;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));

  const mat = new THREE.PointsMaterial({
    size: 16,
    map: makeSpriteTexture(),
    vertexColors: true,
    transparent: true,
    opacity: isMobile ? 0.18 : 0.24,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: false
  });

  particles = new THREE.Points(geo, mat);
  particles.userData.wells = wells;
  particles.userData.base = positions.slice(); // 基准百分比位置
  particles.userData.phase = new Float32Array(count).map(() => Math.random() * Math.PI * 2);
  scene.add(particles);
}

/* ── 层级 2：粒子网络连线（近邻对，固定、逐帧更新端点） ── */
function buildLinks() {
  if (!particles) return;
  const base = particles.userData.base;
  const n = base.length / 3;
  const maxDist = 14;          // 百分比空间内的连接半径
  const maxPer = 2;            // 每个粒子最多连接数
  const MAX_LINKS = 300;
  const seen = new Set();
  const pairs = [];

  for (let i = 0; i < n && pairs.length < MAX_LINKS; i++) {
    const xi = base[i * 3], yi = base[i * 3 + 1];
    const dists = [];
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const dx = base[j * 3] - xi, dy = base[j * 3 + 1] - yi;
      const d = Math.hypot(dx, dy);
      if (d < maxDist) dists.push([d, j]);
    }
    dists.sort((a, b) => a[0] - b[0]);
    let added = 0;
    for (const [d, j] of dists) {
      if (added >= maxPer || pairs.length >= MAX_LINKS) break;
      const key = i < j ? `${i}_${j}` : `${j}_${i}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push([i, j]);
      added++;
    }
  }

  if (!pairs.length) return;
  linkPairs = pairs;
  linkGeo = new THREE.BufferGeometry();
  linkGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pairs.length * 2 * 3), 3));
  const lineMat = new THREE.LineBasicMaterial({
    color: 0xbcd2f0,
    transparent: true,
    opacity: 0.12,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  links = new THREE.LineSegments(linkGeo, lineMat);
  links.frustumCulled = false;
  scene.add(links);
}

/* ── 层级 3：冷玻璃 3D 徽章（缓慢自转 + 微浮 + 三颗余烬） ── */
function buildBadges(roomId) {
  const list = apps.filter((a) =>
    (a.placements || []).some((p) => p.room === roomId)
  );

  const ringGeo = new THREE.TorusGeometry(22, 4, 16, 48);
  const domeGeo = new THREE.SphereGeometry(15, 32, 24);
  const coreGeo = new THREE.SphereGeometry(6, 20, 16);
  const emberGeo = new THREE.SphereGeometry(2.4, 12, 12);

  // 冷钢蓝玻璃 + 微暖核心（呼应站点琥珀强调）
  const ringMat = new THREE.MeshStandardMaterial({
    color: 0x9fb6d8, metalness: 0.7, roughness: 0.34,
    emissive: 0x33486e, emissiveIntensity: 0.45
  });
  const domeMat = new THREE.MeshStandardMaterial({
    color: 0xcfe0f7, metalness: 0.1, roughness: 0.12,
    transparent: true, opacity: 0.22, emissive: 0x6fa8d8, emissiveIntensity: 0.4
  });
  const coreMat = new THREE.MeshBasicMaterial({
    color: 0xbfe0ff, transparent: true, opacity: 0.92,
    blending: THREE.AdditiveBlending, depthWrite: false
  });

  for (const app of list) {
    for (const p of app.placements) {
      if (p.room !== roomId) continue;
      const group = new THREE.Group();
      group.userData = {
        appId: app.id,
        pctX: p.x, pctY: p.y,   // 百分比，resize 时换算为像素
        spin: 0.14 + Math.random() * 0.06,
        bobPhase: Math.random() * Math.PI * 2,
        baseEmissive: 0.4,
        pulse: Math.random() * Math.PI * 2
      };

      const ring = new THREE.Mesh(ringGeo, ringMat);
      const dome = new THREE.Mesh(domeGeo, domeMat);
      const core = new THREE.Mesh(coreGeo, coreMat);
      group.add(ring, dome, core);

      // 三颗环绕余烬（三体意象）
      const embers = [];
      for (let k = 0; k < 3; k++) {
        const e = new THREE.Mesh(
          emberGeo,
          new THREE.MeshBasicMaterial({
            color: 0xbfe0ff, transparent: true, opacity: 0.85,
            blending: THREE.AdditiveBlending, depthWrite: false
          })
        );
        e.userData = { orbit: (k / 3) * Math.PI * 2, r: 34 + k * 3 };
        group.add(e);
        embers.push(e);
      }
      group.userData.embers = embers;

      scene.add(group);
      badges.push(group);
    }
  }
}

/* ── 层级 4：徽章之间的「产品星座」连线（暖琥珀点缀，呼应强调色） ── */
function buildConstellation() {
  if (badges.length < 2) return;
  const pairs = [];
  for (let i = 0; i < badges.length; i++) {
    for (let j = i + 1; j < badges.length; j++) pairs.push([i, j]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pairs.length * 2 * 3), 3));
  const mat = new THREE.LineBasicMaterial({
    color: 0xd9a441,
    transparent: true,
    opacity: 0.10,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  constellation = new THREE.LineSegments(geo, mat);
  constellation.frustumCulled = false;
  constellation.userData.pairs = pairs;
  scene.add(constellation);
}

/* ── 当前房间 ID 辅助 ── */
function currentRoomId() {
  const r = rooms.find((x) => x.id === (window.__currentRoomId || "study"));
  return r ? r.id : "study";
}

/* ── 尺寸 / 坐标换算 ── */
function resize() {
  const stage = document.querySelector(".room-stage");
  if (!stage || !renderer) return;
  W = stage.clientWidth || window.innerWidth;
  H = stage.clientHeight || window.innerHeight;

  renderer.setSize(W, H, false);
  // 正交相机：左0 右W 上0 下-H（y 向下），1 世界单位 = 1 像素
  camera.left = 0; camera.right = W; camera.top = 0; camera.bottom = -H;
  camera.updateProjectionMatrix();

  // 粒子：百分比 → 像素
  if (particles) {
    const pos = particles.geometry.attributes.position;
    const base = particles.userData.base;
    for (let i = 0; i < pos.count; i++) {
      pos.array[i * 3] = (base[i * 3] / 100) * W;
      pos.array[i * 3 + 1] = -(base[i * 3 + 1] / 100) * H;
    }
    pos.needsUpdate = true;
    // 更新三体引力井像素坐标
    particles.userData.wells.forEach((w) => {
      w.px = (w.x / 100) * W;
      w.py = -(w.y / 100) * H;
    });
  }

  // 徽章：百分比 → 像素
  badges.forEach((g) => {
    g.position.x = (g.userData.pctX / 100) * W;
    g.position.y = -(g.userData.pctY / 100) * H;
  });

  if (reduceMotion && renderer) renderer.render(scene, camera);
}

/* ── 动画循环 ── */
function loop(now) {
  if (!running) return;
  rafId = requestAnimationFrame(loop);
  const dt = Math.min((now - clock.last) / 1000, 0.05);
  clock.last = now;
  const t = now / 1000;

  // 粒子：连贯流场漂浮（正弦场 + 缓慢旋转） + 三体弱引力微扰
  if (particles) {
    const pos = particles.geometry.attributes.position;
    const base = particles.userData.base;
    const wells = particles.userData.wells;
    const phase = particles.userData.phase;
    const n = pos.count;
    for (let i = 0; i < n; i++) {
      const bx = (base[i * 3] / 100) * W;
      const by = -(base[i * 3 + 1] / 100) * H;
      let x = bx, y = by;
      // 连贯流场：随全局时间与相位的低频漂移，形成「流动」质感
      const flow = t * 0.18;
      x += Math.sin(flow + by * 0.012 + phase[i]) * 10 + Math.cos(flow * 0.7 + phase[i] * 1.7) * 4;
      y += Math.cos(flow + bx * 0.012 + phase[i] * 1.3) * 9 + Math.sin(flow * 0.6 + phase[i]) * 4;
      // 三体引力井：极弱、缓速的向心微扰
      for (const w of wells) {
        const dx = w.px - x, dy = w.py - y;
        const d2 = dx * dx + dy * dy + 400;
        const f = 900 / d2; // 弱力
        x += dx * f * 0.18;
        y += dy * f * 0.18;
      }
      pos.array[i * 3] = x;
      pos.array[i * 3 + 1] = y;
    }
    pos.needsUpdate = true;

    // 网络连线：逐帧更新端点 + 轻微脉冲透明度（科技呼吸感）
    if (links && linkGeo) {
      const la = linkGeo.attributes.position.array;
      for (let k = 0; k < linkPairs.length; k++) {
        const i = linkPairs[k][0], j = linkPairs[k][1];
        la[k * 6] = pos.array[i * 3]; la[k * 6 + 1] = pos.array[i * 3 + 1]; la[k * 6 + 2] = 0;
        la[k * 6 + 3] = pos.array[j * 3]; la[k * 6 + 4] = pos.array[j * 3 + 1]; la[k * 6 + 5] = 0;
      }
      linkGeo.attributes.position.needsUpdate = true;
      links.material.opacity = 0.10 + 0.04 * (0.5 + 0.5 * Math.sin(t * 0.9));
    }
  }

  // 徽章：缓慢自转 + 微浮 + 核心呼吸 + 余烬环绕
  badges.forEach((g) => {
    g.rotation.y += g.userData.spin * dt;
    g.rotation.x = Math.sin(t * 0.4 + g.userData.bobPhase) * 0.18;
    g.position.z = Math.sin(t * 0.6 + g.userData.bobPhase) * 8;
    // 核心呼吸辉光
    g.userData.pulse += dt * 1.6;
    const e = 0.4 + 0.25 * (0.5 + 0.5 * Math.sin(g.userData.pulse));
    g.children.forEach((m) => {
      if (m.material && m.material.emissiveIntensity !== undefined) m.material.emissiveIntensity = e;
    });
    g.userData.embers.forEach((em) => {
      em.userData.orbit += dt * 0.5;
      const a = em.userData.orbit;
      const r = em.userData.r;
      em.position.set(Math.cos(a) * r, Math.sin(a) * r * 0.7, Math.sin(a) * 10);
    });
  });

  // 产品星座连线：跟随徽章位置
  if (constellation) {
    const ca = constellation.geometry.attributes.position.array;
    const pairs = constellation.userData.pairs;
    for (let k = 0; k < pairs.length; k++) {
      const a = badges[pairs[k][0]].position, b = badges[pairs[k][1]].position;
      ca[k * 6] = a.x; ca[k * 6 + 1] = a.y; ca[k * 6 + 2] = a.z;
      ca[k * 6 + 3] = b.x; ca[k * 6 + 4] = b.y; ca[k * 6 + 5] = b.z;
    }
    constellation.geometry.attributes.position.needsUpdate = true;
    constellation.material.opacity = 0.08 + 0.05 * (0.5 + 0.5 * Math.sin(t * 0.6));
  }

  renderer.render(scene, camera);
}

/* ── 悬停联动：CSS 热点激活时增强对应徽章辉光 ── */
function bindObservers() {
  // 监听热点激活态
  document.querySelectorAll(".hotspot").forEach((dot) => {
    const id = dot.dataset.appId;
    const on = () => setBadgeGlow(id, true);
    const off = () => setBadgeGlow(id, false);
    dot.addEventListener("mouseenter", on);
    dot.addEventListener("focus", on);
    dot.addEventListener("mouseleave", off);
    dot.addEventListener("blur", off);
  });

  // 面板 / 个人抽屉打开时模糊压暗背景 3D 层
  dimObserver = new MutationObserver(() => {
    const dim =
      document.querySelector(".panel")?.classList.contains("is-open") ||
      document.querySelector(".profile")?.classList.contains("is-open");
    canvas.classList.toggle("is-dim", !!dim);
  });
  const targets = [
    document.querySelector(".panel"),
    document.querySelector(".profile")
  ].filter(Boolean);
  targets.forEach((el) =>
    dimObserver.observe(el, { attributes: true, attributeFilter: ["class"] })
  );
}

function setBadgeGlow(appId, active) {
  badges.forEach((g) => {
    if (g.userData.appId !== appId) return;
    const scale = active ? 1.18 : 1.0;
    g.scale.setScalar(scale);
    // 玻璃罩辉光增强
    g.children.forEach((m) => {
      if (m.material && m.material.emissiveIntensity !== undefined) {
        const target = active ? g.userData.baseEmissive + 0.5 : g.userData.baseEmissive;
        m.material.emissiveIntensity = target;
      }
    });
  });
}

/* ── 页面滚动离开首屏时压暗背景 3D 层 ── */
function onScrollDim() {
  if (!canvas) return;
  const scrolled = (window.scrollY || window.pageYOffset || 0) > window.innerHeight * 0.4;
  canvas.classList.toggle("is-dim", scrolled);
}

/* ── 页面隐藏时暂停渲染（省电） ── */
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

/* ── 工具：防抖 ── */
function debounce(fn, ms) {
  let id;
  return (...a) => {
    clearTimeout(id);
    id = setTimeout(() => fn(...a), ms);
  };
}
