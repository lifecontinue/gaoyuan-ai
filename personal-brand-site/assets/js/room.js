// room.js — 房间渲染 + cover-stage 尺寸/焦点计算
import { rooms } from "./data/rooms.js";

let current = 0;

export function renderRoom(index = 0) {
  const room = rooms[index];
  if (!room) return;
  current = index;

  const stage = document.querySelector(".room-stage");
  const video = document.querySelector(".room-video");
  const root = document.documentElement;

  // 比例 → CSS 变量，驱动 cover-stage 数学
  root.style.setProperty("--room-ar", String(room.aspect));
  root.style.setProperty("--focus-x", room.focus.x);
  root.style.setProperty("--focus-y", room.focus.y);
  root.style.setProperty("--focus-sm-x", room.focusSm.x);
  root.style.setProperty("--focus-sm-y", room.focusSm.y);

  if (video) {
    // 静态海报：加载期 / 视频缺失时的兜底（沿用原房间图）
    video.poster = room.poster || room.img || "";
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    video.onloadeddata = () => {
      video.classList.add("is-loaded");
      if (!reduceMotion) video.play?.().catch(() => {});
    };
    video.onerror = () => {
      // 视频缺失/解码失败：退回暖色渐变兜底，保证仍可见布局
      document.querySelector(".room")?.classList.add("room--fallback");
      video.classList.add("is-loaded");
    };

    if (room.video) {
      video.src = room.video;
      video.load();
    } else {
      // 无视频配置：仅展示海报（原图片）
      video.removeAttribute("src");
      video.classList.add("is-loaded");
    }
  }
  return room;
}

export function getCurrentRoomId() {
  return rooms[current] ? rooms[current].id : null;
}
