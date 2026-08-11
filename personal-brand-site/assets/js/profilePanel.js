// profilePanel.js — 个人信息抽屉开/关

let profileEl, scrimEl, lastFocused;

function els() {
  profileEl = profileEl || document.querySelector(".profile");
  scrimEl = scrimEl || document.querySelector(".profile-scrim");
  return profileEl && scrimEl;
}

export function openProfile() {
  if (!els()) return;
  lastFocused = document.activeElement;
  profileEl.classList.add("is-open");
  profileEl.setAttribute("aria-hidden", "false");
  scrimEl.classList.add("is-open");
  scrimEl.setAttribute("aria-hidden", "false");
  profileEl.querySelector(".profile__close").focus();
  document.addEventListener("keydown", onKey);
}

export function closeProfile() {
  if (!els() || !profileEl.classList.contains("is-open")) return;
  profileEl.classList.remove("is-open");
  profileEl.setAttribute("aria-hidden", "true");
  scrimEl.classList.remove("is-open");
  scrimEl.setAttribute("aria-hidden", "true");
  document.removeEventListener("keydown", onKey);
  if (lastFocused && lastFocused.focus) lastFocused.focus();
}

function onKey(e) {
  if (e.key === "Escape") closeProfile();
}

export function initProfilePanel() {
  if (!els()) return;

  const brand = document.querySelector(".topbar__brand");
  if (brand) brand.addEventListener("click", openProfile);

  profileEl.querySelector(".profile__close").addEventListener("click", closeProfile);
  scrimEl.addEventListener("click", closeProfile);
}
