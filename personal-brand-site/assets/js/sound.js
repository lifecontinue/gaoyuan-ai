// sound.js — 环境音开关（占位静音或播放 ambient 音频）
let audio = null;
let enabled = false;
let btn = null;

export function initSound(src, button) {
  btn = button;
  if (src) {
    audio = new Audio(src);
    audio.loop = true;
    audio.volume = 0.4;
  } else {
    // 无音频源：按钮作为占位静音开关（仍切换视觉状态）
    if (btn) btn.title = "Ambient sound (not configured yet)";
  }
  // 恢复上次偏好
  try {
    if (localStorage.getItem("pbs-sound") === "on") setSound(true, true);
  } catch (_) {}
}

function setSound(state, silent) {
  enabled = state;
  if (btn) {
    btn.classList.toggle("is-on", enabled);
    btn.setAttribute("aria-pressed", String(enabled));
    btn.querySelector(".ctrl__label").textContent = enabled ? "Sound On" : "Sound";
  }
  if (audio) {
    if (enabled) audio.play().catch(() => {});
    else audio.pause();
  }
  if (!silent) {
    try { localStorage.setItem("pbs-sound", enabled ? "on" : "off"); } catch (_) {}
  }
}

export function toggleSound() {
  setSound(!enabled);
}
