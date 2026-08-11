// hotspots.js — 热点生成 + 不规则物件轮廓 + 点↔标签连线 + 悬停/聚焦浮窗 + 点击打开浮窗
import { apps } from "./data/apps.js";
import { rooms } from "./data/rooms.js";
import { openPanel } from "./panel.js";

const layer = () => document.querySelector(".hotspots");

/* ───────────────────────────────────────────────────────────
 * 自动轮播（tour）参数与状态
 *
 * 行为：悬停 / 聚焦任一应用 → 该应用浮窗弹出，并立即开始按序自动轮播
 *       所有应用浮窗（逐个出现、循环）。再次悬停 / 聚焦任一应用 →
 *       停止轮播并保持当前浮窗（冻结）。鼠标移出整个房间区域 → 复位。
 *
 * 三个可调参数 / 明确约定：
 *  1) 显示顺序：apps.js 数组顺序（即热点渲染 DOM 顺序；研究房当前为
 *     坦克大战 → 行迹地图 → [孩子]成长星空 → 儿童成长评估 → 宝宝便便记录
 *     → PM 成长系统），从被悬停的应用位置起向后循环。
 *  2) 轮播间隔：TOUR_INTERVAL_MS（每个浮窗停留时长，毫秒）。
 *  3) 停止触发：轮播进行中，再次 mouseenter / focus 到任意应用即停止并冻结；
 *     仅在鼠标真正离开全部热点（移出房间）后才复位隐藏。
 * ─────────────────────────────────────────────────────────── */
const TOUR_INTERVAL_MS = 1600;

const tour = {
  playing: false,        // true = 自动轮播中
  timer: null,           // setInterval 句柄
  order: [],             // 当前房间应用顺序 [{appId, popover, group, dot, label}]
  index: -1,             // 当前显示位置
  hoverAppId: null,      // 当前指针 / 焦点所在应用（用于过滤同应用内移动误触）
  delegated: false,      // 是否已绑定委托监听
};

/* 空闲自动轮播（idle autoplay）状态 */
const IDLE_DELAY_MS = 2500;   // 鼠标静止 / 无交互多久后开始自动轮播（2~3 秒）
const idle = {
  timer: null,           // setTimeout 句柄
  active: false,         // true = 空闲自动轮播进行中
  endedAt: 0,            // 上次被交互打断的时间戳（用于抑制悬停误重启）
};

// 按 DOM 顺序构建当前房间内所有应用的浮窗引用
function buildTourOrder() {
  const popovers = Array.from(document.querySelectorAll(".hotspots .popover"));
  return popovers.map((pop) => {
    const id = pop.dataset.appId;
    return {
      appId: id,
      popover: pop,
      group: document.querySelector(`.hotspot-group[data-app-id="${id}"]`),
      dot: document.querySelector(`.hotspot[data-app-id="${id}"]`),
      label: document.querySelector(`.hotspot-name[data-app-id="${id}"]`),
    };
  });
}

// 仅显示某个应用的浮窗，隐藏其余
function showOnlyTourEntry(entry) {
  for (const e of tour.order) {
    e.group?.classList.remove("is-active");
    e.dot?.classList.remove("is-active");
    e.label?.classList.remove("is-active");
    e.popover?.classList.remove("is-visible");
  }
  if (!entry) return;
  entry.group?.classList.add("is-active");
  entry.dot?.classList.add("is-active");
  entry.label?.classList.add("is-active");
  entry.popover?.classList.add("is-visible");
}

function hideAllTour() {
  for (const e of tour.order) {
    e.group?.classList.remove("is-active");
    e.dot?.classList.remove("is-active");
    e.label?.classList.remove("is-active");
    e.popover?.classList.remove("is-visible");
  }
}

// 在 .hotspots 上标记“轮播进行中”，用于浮窗呼吸光环样式
function setTouring(on) {
  const root = layer();
  if (root) root.classList.toggle("is-touring", on);
}

// 开始轮播：从 fromAppId 所在位置起，按 order 向后循环
function startTour(fromAppId) {
  tour.order = buildTourOrder();
  if (tour.order.length <= 1) {
    // 单应用无需轮播，直接展示
    if (tour.order[0]) showOnlyTourEntry(tour.order[0]);
    tour.playing = false;
    setTouring(false);
    return;
  }
  tour.playing = true;
  setTouring(true);
  let idx = tour.order.findIndex((e) => e.appId === fromAppId);
  if (idx < 0) idx = 0;
  tour.index = idx;
  showOnlyTourEntry(tour.order[idx]);
  clearInterval(tour.timer);
  tour.timer = setInterval(() => {
    tour.index = (tour.index + 1) % tour.order.length;
    showOnlyTourEntry(tour.order[tour.index]);
  }, TOUR_INTERVAL_MS);
}

// 停止轮播。freeze=true 保持当前浮窗（冻结）；false 隐藏全部
function stopTour(freeze) {
  clearInterval(tour.timer);
  tour.timer = null;
  tour.playing = false;
  setTouring(false);
  if (!freeze) hideAllTour();
}

// 完全复位（房间重渲染 / 打开详情前调用）
function resetTour() {
  stopTour(false);
  tour.order = [];
  tour.index = -1;
  tour.hoverAppId = null;
}

// 进入某应用：首次 → 开始轮播；轮播中 → 停止并冻结
function enterApp(id) {
  if (!id || id === tour.hoverAppId) return; // 同应用内移动（shape↔dot）忽略
  // 空闲自动轮播刚被交互打断的短暂窗口内，忽略悬停触发，避免立刻重启轮播
  if (idle.endedAt && Date.now() - idle.endedAt < 600) return;
  tour.hoverAppId = id;
  if (tour.playing) stopTour(true);
  else startTour(id);
}

// 离开某应用：仅当真正离开该应用（而非进入同房间另一应用）时清状态
function leaveApp(id, toId) {
  if (!id) return;
  if (id === tour.hoverAppId && id !== toId) tour.hoverAppId = null;
}

// 在 .hotspots 上委托 mouseover / mouseout，避免同应用内子元素切换误触
function ensureTourDelegation(root) {
  if (tour.delegated || !root) return;
  tour.delegated = true;

  root.addEventListener("mouseover", (e) => {
    const appEl = e.target.closest?.("[data-app-id]");
    enterApp(appEl?.dataset.appId);
  });
  root.addEventListener("mouseout", (e) => {
    const leaveEl = e.target.closest?.("[data-app-id]");
    const toEl = e.relatedTarget?.closest?.("[data-app-id]");
    leaveApp(leaveEl?.dataset.appId, toEl?.dataset.appId);
  });

  // 指针离开整个房间区域 → 复位（停止并隐藏），为下次悬停重新开始
  root.addEventListener("mouseleave", () => {
    resetTour();
  });
}

/* ───────────────────────────────────────────────────────────
 * 空闲自动轮播（idle autoplay）
 *
 * 行为：鼠标静止 / 页面无交互满 IDLE_DELAY_MS 后，自动按 apps.js 顺序
 *       逐个展示每个应用的浮窗（.popover），持续循环。
 *       一旦检测到 mousemove / wheel / scroll / touchmove / keydown
 *       → 立即停止并退出该模式（隐藏全部浮窗）。再次静止满延迟后重新开始。
 *
 * 约定：
 *  - 触发延迟：IDLE_DELAY_MS（2~3 秒）
 *  - 逐个停留：复用 TOUR_INTERVAL_MS（每个浮窗展示时长）
 *  - 详情 / 资料面板打开时不启动（避免遮挡）
 *  - prefers-reduced-motion: reduce 时完全不启动（无障碍）
 * ─────────────────────────────────────────────────────────── */
function prefersReducedMotion() {
  return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
}

function isAnyPanelOpen() {
  return !!document.querySelector(".panel.is-open") || !!document.querySelector(".profile.is-open");
}

function startIdleAutoplay() {
  if (idle.active) return;
  if (prefersReducedMotion()) return;          // 尊重无障碍偏好
  if (isAnyPanelOpen()) { armIdleTimer(); return; } // 面板打开时不打扰，稍后重试
  const order = buildTourOrder();
  if (order.length === 0) return;
  idle.active = true;
  startTour(order[0].appId);                   // 从头按序轮播
}

function stopIdleAutoplay() {
  if (!idle.active) return;
  idle.active = false;
  idle.endedAt = Date.now();
  stopTour(false);                             // 退出模式：隐藏全部浮窗
}

function armIdleTimer() {
  if (idle.timer) clearTimeout(idle.timer);
  idle.timer = setTimeout(startIdleAutoplay, IDLE_DELAY_MS);
}

function onUserActivity() {
  // 任意交互：若正在自动轮播，立即停止并退出该模式
  if (idle.active) stopIdleAutoplay();
  // 重新计时空闲计时（静止满延迟后再次自动轮播）
  armIdleTimer();
}

export function initIdleAutoplay() {
  const events = ["mousemove", "wheel", "scroll", "touchmove", "keydown", "click"];
  events.forEach((ev) => window.addEventListener(ev, onUserActivity, { passive: true }));
  // 页面初始静止后启动首次计时
  armIdleTimer();
}

function getRoomDims(roomId) {
  const room = rooms.find((r) => r.id === roomId);
  const W = room?.width || 1376;
  const H = room?.height || 768;
  return { W, H };
}

function createSVGElement(tag, attrs) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v !== undefined && v !== null) el.setAttribute(k, v);
  }
  return el;
}

function pctToPx(pct, total) {
  return ((pct / 100) * total).toFixed(2);
}

function buildShapeD(shape, W, H) {
  if (!shape || shape.length < 3) return "";
  const points = shape.map((pt) => `${pctToPx(pt.x, W)} ${pctToPx(pt.y, H)}`).join(" ");
  return `M ${points} Z`;
}

function createHotspotGroup(app, p, W, H) {
  const g = createSVGElement("g", {
    class: "hotspot-group",
    "data-app-id": app.id,
    "aria-hidden": "true"
  });

  const x1 = pctToPx(p.x, W);
  const y1 = pctToPx(p.y, H);

  // Regular circle ring (replaces irregular polygon outline)
  const ringR = 28;
  const shape = createSVGElement("circle", {
    class: "hotspot-shape",
    cx: x1,
    cy: y1,
    r: ringR
  });

  // No connecting line — labels are centred directly on objects

  g.appendChild(shape);
  return { g, x1, y1 };
}

function createDot(app, p) {
  const btn = document.createElement("button");
  btn.className = "hotspot";
  btn.type = "button";
  btn.style.setProperty("--x", p.x);
  btn.style.setProperty("--y", p.y);
  btn.dataset.appId = app.id;
  btn.setAttribute("aria-label", `${(app.en || app.name)} details`);
  btn.innerHTML = `
    <span class="hotspot__ping"></span>
    <span class="hotspot__ping hotspot__ping--2"></span>
    <span class="hotspot__dot"></span>
  `;
  return btn;
}

function createLabel(app, p) {
  const el = document.createElement("span");
  el.className = "hotspot-name";
  el.textContent = p.label || app.en || app.name;
  el.dataset.appId = app.id;
  el.setAttribute("aria-hidden", "true");
  el.style.setProperty("--lx", p.lx ?? p.x);
  el.style.setProperty("--ly", p.ly ?? p.y - 12);
  return el;
}

// 悬停 / 聚焦时浮出的小浮窗（与背景一致的暖色玻璃卡片）
function createPopover(app, p) {
  const el = document.createElement("div");
  el.className = "popover";
  el.dataset.appId = app.id;
  el.dataset.anchor = p.anchor || "top";
  el.style.setProperty("--px", p.x);
  el.style.setProperty("--py", p.y);
  el.setAttribute("role", "tooltip");
  el.innerHTML = `
    <div class="popover__name">${app.en}</div>
    ${app.name ? `<div class="popover__en">${app.name}</div>` : ""}
    ${app.tagline ? `<div class="popover__tag">${app.tagline}</div>` : ""}
    <div class="popover__hint">Click for a live preview ↗</div>
  `;
  return el;
}

/**
 * 在指定房间渲染热点
 * @param {string} roomId
 */
export function renderHotspots(roomId) {
  const root = layer();
  if (!root) return;
  resetTour();
  root.innerHTML = "";

  const { W, H } = getRoomDims(roomId);

  // SVG 覆盖层：与房间图等比例，用于绘制不规则轮廓与连线
  const svg = createSVGElement("svg", {
    class: "hotspot-svg",
    viewBox: `0 0 ${W} ${H}`,
    preserveAspectRatio: "none",
    "aria-hidden": "true"
  });
  root.appendChild(svg);

  const list = apps.filter(
    (a) => a.placements && a.placements.some((p) => p.room === roomId)
  );

  for (const app of list) {
    for (const p of app.placements) {
      if (p.room !== roomId) continue;

      const { g } = createHotspotGroup(app, p, W, H);
      const dot = createDot(app, p);
      const label = createLabel(app, p);
      const popover = createPopover(app, p);

      svg.appendChild(g);
      root.appendChild(dot);
      root.appendChild(label);
      root.appendChild(popover);

      const els = [g, dot, label];

      // 悬停 / 聚焦的“开始 / 停止”由 .hotspots 上的委托监听统一驱动
      // （见 ensureTourDelegation / enterApp）。此处仅保留点击打开详情，
      // 打开前清除轮播浮窗，避免与详情面板重叠。
      const onOpen = (e) => {
        e.stopPropagation();
        stopTour(false);
        openPanel(app);
      };

      els.forEach((el) => {
        el.addEventListener("click", onOpen);
      });

      // 键盘焦点（与悬停同义：再次聚焦即停止轮播）
      dot.addEventListener("focus", () => enterApp(app.id));
      dot.addEventListener("blur", () => leaveApp(app.id, null));
    }
  }

  // 委托监听只需绑定一次（.hotspots 容器不在重渲染时被重建）
  ensureTourDelegation(root);
}
