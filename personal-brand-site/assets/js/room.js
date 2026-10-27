// Static poster first; background video is explicitly opt-in.
import { rooms } from "./data/rooms.js";

let current = 0;
let cleanup = () => {};

export function renderRoom(index = 0) {
  const room = rooms[index];
  if (!room) return;
  cleanup();
  current = index;
  const root = document.documentElement;
  root.style.setProperty("--room-ar", String(room.aspect));
  root.style.setProperty("--focus-x", room.focus.x);
  root.style.setProperty("--focus-y", room.focus.y);
  root.style.setProperty("--focus-sm-x", room.focusSm.x);
  root.style.setProperty("--focus-sm-y", room.focusSm.y);

  const video = document.querySelector(".room-video");
  const toggle = document.querySelector(".ambience-toggle");
  if (!video) return room;
  video.pause();
  video.removeAttribute("src");
  video.load();
  video.poster = room.poster || room.img || "";
  video.preload = "none";
  video.classList.add("is-loaded");
  if (!toggle) return room;
  toggle.hidden = !room.video;
  let enabled = false;
  let disposed = false;
  const updateLabel = () => {
    toggle.textContent = enabled ? "暂停动态" : "开启动态";
    toggle.setAttribute("aria-pressed", String(enabled));
  };
  const inView = () => !document.hidden && window.scrollY < window.innerHeight * 0.8;
  const sync = () => {
    if (!enabled || !inView()) { video.pause(); return; }
    video.play().catch((error) => {
      // Pausing a pending play is normal, e.g. a fast second click.
      if (disposed || error.name === "AbortError") return;
      enabled = false;
      updateLabel();
    });
  };
  const onToggle = () => {
    enabled = !enabled;
    updateLabel();
    if (enabled && !video.getAttribute("src")) {
      video.src = room.video;
      video.load();
    }
    sync();
  };
  const onError = () => {
    enabled = false;
    video.removeAttribute("src");
    video.load();
    updateLabel();
    toggle.textContent = "重试动态";
  };
  let raf = 0;
  const onScroll = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; sync(); });
  };
  updateLabel();
  toggle.addEventListener("click", onToggle);
  video.addEventListener("error", onError);
  document.addEventListener("visibilitychange", sync);
  window.addEventListener("scroll", onScroll, { passive: true });
  cleanup = () => {
    disposed = true;
    cancelAnimationFrame(raf);
    toggle.removeEventListener("click", onToggle);
    video.removeEventListener("error", onError);
    document.removeEventListener("visibilitychange", sync);
    window.removeEventListener("scroll", onScroll);
  };
  return room;
}

export function getCurrentRoomId() {
  return rooms[current] ? rooms[current].id : null;
}
