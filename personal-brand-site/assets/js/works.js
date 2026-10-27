// works.js — 章节卡片 + 轻量 CSS 渐变背景，无 WebGL 下载或持续渲染。

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
  if (reduceMotion || !("IntersectionObserver" in window)) { els.forEach((e) => e.classList.add("in")); return; }
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

/* ── CSS 章节渐变：仅在可见章节变化时更新，无 WebGL / 持续渲染 ── */
function initGradient() {
  const canvas = document.querySelector(".works-bg");
  if (!canvas || !("IntersectionObserver" in window)) return;
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const chapter = CHAPTERS[Number(entry.target.dataset.index)];
      const rgb = (color) => `rgb(${color.map((v) => Math.round(v * 255)).join(",")})`;
      canvas.style.background = `linear-gradient(160deg, ${rgb(chapter.colorA)}, ${rgb(chapter.colorB)})`;
    }
  }, { rootMargin: "-35% 0px -35% 0px", threshold: 0 });
  document.querySelectorAll(".works-chapter").forEach((section) => observer.observe(section));
}

function init() {
  buildChapters();
  initReveal();
  initScrollChrome();
  initGradient();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
