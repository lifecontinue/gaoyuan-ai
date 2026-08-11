// loader.js — 首屏加载（图片预载 + 进度）
import { preloadImage } from "./utils.js";
import { rooms } from "./data/rooms.js";

export async function runLoader() {
  const loader = document.querySelector(".loader");
  const fill = loader ? loader.querySelector(".loader__fill") : null;
  const pct = loader ? loader.querySelector(".loader__pct") : null;

  const imgs = rooms.map((r) => r.img);
  let done = 0;
  const total = imgs.length || 1;

  try {
    await Promise.all(
      imgs.map((src) =>
        preloadImage(src)
          .then(() => { done++; set(done / total); })
          .catch(() => { done++; set(done / total); }) // 失败也推进，不卡死
      )
    );
  } catch (_) {}

  set(1);
  await wait(250);
  if (loader) loader.classList.add("is-hidden");
  setTimeout(() => loader && loader.remove(), 700);

  function set(ratio) {
    const p = Math.round(ratio * 100);
    if (fill) fill.style.width = p + "%";
    if (pct) pct.textContent = p + "%";
  }
}

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }
