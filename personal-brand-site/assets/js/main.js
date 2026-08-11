// main.js — 入口：装配各模块、初始化
import { rooms } from "./data/rooms.js";
import { apps } from "./data/apps.js";
import { profile } from "./data/profile.js";
import { renderRoom, getCurrentRoomId } from "./room.js";
import { renderHotspots, initIdleAutoplay } from "./hotspots.js";
import { initPanel, openPanel } from "./panel.js";
import { initControls } from "./controls.js";
import { initProfilePanel } from "./profilePanel.js";
import { runLoader } from "./loader.js";
import { initCalibrate } from "./calibrate.js";
import { initThreeLayer } from "./three-layer.js";
import { initGlassTheme } from "./glass-theme.js";
import { $, $$ } from "./utils.js";

function paintProfile() {
  const brand = $(".topbar__brand");
  if (brand) {
    brand.querySelector(".topbar__name").innerHTML = profile.nameEn
      ? `${profile.name || ""} <i>${profile.nameEn}</i>`
      : (profile.name || "");
    brand.querySelector(".topbar__title").textContent = profile.title || profile.titleAlt || "";
  }

  // 个人信息抽屉内容
  const profileName = document.querySelector(".profile__name");
  const profileTitle = document.querySelector(".profile__title");
  const profileMotto = document.querySelector(".profile__motto");
  if (profileName) {
    profileName.innerHTML = profile.nameEn
      ? `${profile.name || ""} <span>${profile.nameEn}</span>`
      : (profile.name || "");
  }
  if (profileTitle) profileTitle.textContent = profile.titleAlt || profile.title || "";
  // motto 包含 <br/>，因此用 innerHTML 渲染以保留分段
  if (profileMotto) profileMotto.innerHTML = profile.motto || "";

  // 双二维码并排（公众号 + 个人微信），任何一项缺失或加载失败自动隐藏
  const qrHost = document.querySelector(".profile__qrs");
  const hintEl = document.querySelector(".profile__hint");
  if (qrHost && profile.contacts) {
    qrHost.innerHTML = "";
    const qrItems = [
      { src: profile.contacts.publicAccountQR, label: profile.contacts.publicAccountLabel, alt: "WeChat Official Account QR code" },
      { src: profile.contacts.personalWechatQR, label: profile.contacts.personalWechatLabel, alt: "Personal WeChat QR code" }
    ].filter((it) => it && it.src);

    let remaining = qrItems.length;
    qrItems.forEach((it) => {
      const figure = document.createElement("figure");
      figure.className = "profile__qr";
      const img = document.createElement("img");
      img.alt = it.alt || "";
      img.src = it.src;
      img.addEventListener("error", () => {
        figure.style.display = "none";
        remaining--;
        if (remaining <= 0) qrHost.style.display = "none";
      });
      img.addEventListener("load", () => { remaining--; });
      figure.appendChild(img);
      if (it.label) {
        const cap = document.createElement("figcaption");
        const en = it.label.en || "";
        const zh = it.label.zh || "";
        cap.innerHTML = en
          ? `${en}${zh ? `<br />${zh}` : ""}`
          : (zh || "");
        figure.appendChild(cap);
      }
      qrHost.appendChild(figure);
    });
    // 全部失败时整体隐藏
    if (qrItems.length === 0) qrHost.style.display = "none";
  }
  if (hintEl) hintEl.textContent = (profile.contacts && profile.contacts.qrHint) || "";

  // 联系方式：仅邮箱（按用户要求移除电话和 LinkedIn）
  const contacts = document.querySelector(".profile__contacts");
  if (contacts && profile.contacts) {
    contacts.innerHTML = "";
    if (profile.contacts.email) {
      contacts.innerHTML += `<li><a href="mailto:${profile.contacts.email}">${profile.contacts.email}</a></li>`;
    }
  }
}

function renderChips() {
  const nav = $(".chips");
  if (!nav) return;
  nav.innerHTML = "";
  for (const app of apps) {
    const b = document.createElement("button");
    b.className = "chip";
    b.type = "button";
    b.textContent = app.en || app.name;
    b.addEventListener("click", () => openPanel(app));
    nav.appendChild(b);
  }
}

async function boot() {
  // 模块已成功加载，撤销 file:// 兜底提示
  if (window.__bootFallback) clearTimeout(window.__bootFallback);

  // 任一初始化出错都不应让加载层卡死
  const safe = (fn) => { try { fn(); } catch (e) { console.error("[init]", e); } };
  safe(paintProfile);
  let room;
  safe(() => { room = renderRoom(0); });
  safe(() => renderHotspots(room ? room.id : getCurrentRoomId()));
  safe(initIdleAutoplay);   // 空闲时自动轮播应用浮窗
  safe(renderChips);
  safe(initPanel);
  safe(initProfilePanel);
  safe(initControls);
  safe(initCalibrate);
  safe(initGlassTheme);
  // 3D 增强层：异步、可降级，失败不影响主站
  safe(() => { initThreeLayer(getCurrentRoomId()); });

  try { await runLoader(); } catch (e) { console.error(e); }

  // 移动端底部 chips 索引条改由 CSS @media 控制显隐（支持窗口缩放自适应），此处无需 JS 干预
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
