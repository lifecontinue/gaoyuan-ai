// calibrate.js — ?calibrate=1 时启用：在房间图上点击输出坐标到剪贴板
// 用途：量准 5 个物件在房间图中的百分比坐标，写回 apps.js 的 placements。
import { getCurrentRoomId } from "./room.js";
import { showToast } from "./utils.js";

export function initCalibrate() {
  if (!/[?&]calibrate=1\b/.test(location.search)) return;

  document.body.classList.add("is-calibrating");
  const tip = document.createElement("div");
  tip.className = "calib-tip";
  tip.textContent = "Calibration mode: click the room image to pick coordinates (copied to clipboard)";
  document.body.appendChild(tip);

  const stage = document.querySelector(".room-stage");
  if (!stage) return;

  stage.addEventListener("click", (e) => {
    const rect = stage.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    const out = `placements: [{ room: "${getCurrentRoomId()}", x: ${x.toFixed(2)}, y: ${y.toFixed(2)}, label: "", anchor: "top" }]`;
    navigator.clipboard?.writeText(out).then(
      () => showToast("Copied: " + out),
      () => showToast(out)
    );
  });
}
