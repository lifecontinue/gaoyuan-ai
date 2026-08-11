// glass-theme.js — 液态玻璃主题：从背景图动态提取配色 + 光标反射/折射交互
// 设计约束：popup 必须继承背景图的视觉语言（room.png 实测为冷调暗色书房），
// 因此玻璃取「暗色透明 + 冷光」，颜色由像素采样动态写入 CSS 变量，CSS 中保留冷调兜底值。
import { $ } from "./utils.js";

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const canHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

export function initGlassTheme() {
  // 所有玻璃面：详情浮窗 + 个人信息抽屉，共用同一套 --glass-* 变量
  const surfaces = [$(".panel"), $(".profile")].filter(Boolean);
  if (!surfaces.length) return;

  // 1) 动态配色：采样背景（优先实时视频帧，回退到 poster 图）
  extractGlassTheme();

  // 2) 光标反射 / 折射（仅精确指针且未要求降低动效时启用）
  if (!reduceMotion && canHover) {
    surfaces.forEach(bindCursorRefraction);
  }
}

// 为单个玻璃面绑定光标驱动的镜面高光 / 边缘反光 / 折射视差
function bindCursorRefraction(el) {
  let raf = 0;
  let tx = 50, ty = 28, ang = 135;

  const render = () => {
    raf = 0;
    el.style.setProperty("--glass-mx", tx.toFixed(2) + "%");
    el.style.setProperty("--glass-my", ty.toFixed(2) + "%");
    el.style.setProperty("--glass-sheen", ang.toFixed(1) + "deg");
    // 玻璃折射视差：高光层随光标轻微反向位移，强化「实体玻璃」质感
    el.style.setProperty("--glass-shift-x", ((50 - tx) * 0.10).toFixed(2) + "px");
    el.style.setProperty("--glass-shift-y", ((28 - ty) * 0.10).toFixed(2) + "px");
  };

  el.addEventListener("pointermove", (e) => {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    tx = ((e.clientX - r.left) / r.width) * 100;
    ty = ((e.clientY - r.top) / r.height) * 100;
    ang = 90 + (tx - 50) * 1.4;
    if (!raf) raf = requestAnimationFrame(render);
  });

  el.addEventListener("pointerleave", () => {
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    tx = 50; ty = 28; ang = 135;
    el.style.setProperty("--glass-mx", "50%");
    el.style.setProperty("--glass-my", "28%");
    el.style.setProperty("--glass-sheen", "135deg");
    el.style.setProperty("--glass-shift-x", "0px");
    el.style.setProperty("--glass-shift-y", "0px");
  });
}

// 采样背景图统计：整体均值（玻璃色调）+ 最亮 15% 区域均值（环境光色）
function extractGlassTheme() {
  const apply = ({ avg, bright }) => {
    const root = document.documentElement.style;
    // 玻璃上层：在均值基础上提亮
    root.setProperty("--glass-tint-top", `rgba(${clamp(avg[0] + 18)}, ${clamp(avg[1] + 22)}, ${clamp(avg[2] + 30)}, 0.50)`);
    // 玻璃下层：压暗，形成纵深
    root.setProperty("--glass-tint-bottom", `rgba(${clamp(avg[0] * 0.5)}, ${clamp(avg[1] * 0.55)}, ${clamp(avg[2] * 0.7)}, 0.62)`);
    // 冷调描边 / 边缘高光（取均值偏亮）
    root.setProperty("--glass-edge", `rgba(${clamp(avg[0] + 90)}, ${clamp(avg[1] + 100)}, ${clamp(avg[2] + 120)}, 0.22)`);
    // 环境光：取自画面最亮区域（冷白光源），保持克制
    root.setProperty("--glass-glow", `rgba(${clamp(bright[0] * 0.85 + 20)}, ${clamp(bright[1] * 0.9 + 20)}, ${clamp(bright[2] * 0.95 + 25)}, 0.16)`);
    // 镜面高光：最亮区域略微去饱和的冷白
    root.setProperty("--glass-spec", `rgba(${clamp(bright[0] * 0.8 + 40)}, ${clamp(bright[1] * 0.85 + 45)}, 255, 0.20)`);
  };

  const sample = (src) => new Promise((resolve) => {
    try {
      const c = document.createElement("canvas");
      c.width = 48; c.height = 27;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(src, 0, 0, 48, 27);
      resolve(colorStats(ctx.getImageData(0, 0, 48, 27).data));
    } catch (e) {
      resolve(null); // 跨域/污染等情况：保持 CSS 冷调兜底值
    }
  });

  const video = document.querySelector(".room-video");
  if (video && video.readyState >= 2 && video.videoWidth) {
    sample(video).then((stats) => { if (stats) apply(stats); });
    return;
  }
  // 回退：加载 poster 图（assets/img/room.png，与页面同源）
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => sample(img).then((stats) => { if (stats) apply(stats); });
  img.onerror = () => { /* 保持兜底 */ };
  img.src = "assets/img/room.png";
}

// 计算整体均值 + 最亮 15% 区域均值
function colorStats(data) {
  let r = 0, g = 0, b = 0, n = 0;
  const lum = [];
  for (let i = 0; i < data.length; i += 4) {
    const R = data[i], G = data[i + 1], B = data[i + 2];
    r += R; g += G; b += B; n++;
    lum.push([0.2126 * R + 0.7152 * G + 0.0722 * B, R, G, B]);
  }
  const avg = [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
  lum.sort((a, b) => b[0] - a[0]);
  const k = Math.max(1, Math.floor(lum.length * 0.15));
  let br = 0, bg = 0, bb = 0;
  for (let i = 0; i < k; i++) { br += lum[i][1]; bg += lum[i][2]; bb += lum[i][3]; }
  const bright = [Math.round(br / k), Math.round(bg / k), Math.round(bb / k)];
  return { avg, bright };
}

function clamp(v) { return Math.max(0, Math.min(255, Math.round(v))); }
