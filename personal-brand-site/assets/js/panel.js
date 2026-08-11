// panel.js — 详情面板开/关/ESC/遮罩逻辑

let panelEl, scrimEl, lastFocused;

function els() {
  panelEl = panelEl || document.querySelector(".panel");
  scrimEl = scrimEl || document.querySelector(".panel-scrim");
  return panelEl && scrimEl;
}

export function openPanel(app) {
  if (!els()) return;
  lastFocused = document.activeElement;

  // 填充内容
  panelEl.querySelector(".panel__title").textContent = app.en || app.name;
  panelEl.querySelector(".panel__desc").textContent = app.desc;

  const tagsWrap = panelEl.querySelector(".panel__tags");
  tagsWrap.innerHTML = (app.tags || [])
    .map((t) => `<span class="tag">${t}</span>`)
    .join("");

  // 媒体：展开先显示渐变加载层（无文字），截图载入后淡入
  const media = panelEl.querySelector(".panel__media");
  media.classList.remove("is-loaded", "is-error");
  media.innerHTML = `<div class="panel__shimmer" aria-hidden="true"></div>`;
  if (app.screenshot) {
    const img = document.createElement("img");
    img.className = "panel__screenshot";
    img.alt = (app.en || app.name) + " · app screenshot";
    img.loading = "lazy";
    img.decoding = "async";
    img.onload = () => media.classList.add("is-loaded");
    img.onerror = () => media.classList.add("is-error");
    media.appendChild(img);
    img.src = app.screenshot;
  } else {
    media.classList.add("is-error");
  }

  // CTA
  const cta = panelEl.querySelector(".panel__cta");
  if (app.url && app.url !== "#") {
    cta.href = app.url;
    cta.target = "_blank";
    cta.rel = "noopener";
    cta.classList.remove("is-disabled");
    cta.textContent = "Open app ↗";
  } else {
    cta.setAttribute("href", "#");
    cta.classList.add("is-disabled");
    cta.textContent = "Coming soon";
  }

  // 打开
  panelEl.classList.add("is-open");
  panelEl.setAttribute("aria-hidden", "false");
  scrimEl.classList.add("is-open");
  scrimEl.setAttribute("aria-hidden", "false");
  panelEl.querySelector(".panel__close").focus();
  document.addEventListener("keydown", onKey);
}

export function closePanel() {
  if (!els() || !panelEl.classList.contains("is-open")) return;
  panelEl.classList.remove("is-open");
  panelEl.setAttribute("aria-hidden", "true");
  scrimEl.classList.remove("is-open");
  scrimEl.setAttribute("aria-hidden", "true");
  document.removeEventListener("keydown", onKey);
  // 关闭时卸载 iframe，释放应用资源
  const m = panelEl.querySelector(".panel__media");
  if (m) m.innerHTML = "";
  if (lastFocused && lastFocused.focus) lastFocused.focus();
}

function onKey(e) {
  if (e.key === "Escape") closePanel();
}

// 绑定关闭交互
export function initPanel() {
  if (!els()) return;
  panelEl.querySelector(".panel__close").addEventListener("click", closePanel);
  scrimEl.addEventListener("click", closePanel);
}
