// controls.js — Share 控件装配（Change room / Sound 已按用户要求移除）
import { shareSite } from "./share.js";

export function initControls() {
  const shareBtn = document.querySelector('[data-ctrl="share"]');
  if (shareBtn) {
    shareBtn.addEventListener("click", () => shareSite());
  }
}
