/**
 * audio-ambience.js — writing 页面背景音效控制器
 *
 * 功能：
 * · 预加载并循环播放 assets/audio/ng-ambient.wav 轻柔环境音
 * · 用户点击筛选/打开文章时触发 assets/audio/ng-chime.wav 提示音
 * · 顶栏提供静音/取消静音切换
 * · 首次用户交互（点击/滚动/按键）后自动尝试播放环境音
 * · 尊重 prefers-reduced-motion：默认不自动播放，但仍可手动开启
 */

const AMBIENT_URL = 'assets/audio/ng-ambient.wav';
const CHIME_URL = 'assets/audio/ng-chime.wav';

let ctx = null;
let ambientBuffer = null;
let chimeBuffer = null;
let ambientSource = null;
let masterGain = null;
let started = false;
let muted = false;
let reduceMotion = false;
let toggleBtn = null;
let initPromise = null;

function ensureContext() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) throw new Error('Web Audio API not supported');
    ctx = new AC();
  }
  return ctx;
}

async function fetchDecode(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`fetch ${url} -> HTTP ${resp.status}`);
  const arrayBuffer = await resp.arrayBuffer();
  return ensureContext().decodeAudioData(arrayBuffer);
}

async function loadBuffers() {
  if (initPromise) return initPromise;
  initPromise = Promise.all([
    fetchDecode(AMBIENT_URL),
    fetchDecode(CHIME_URL),
  ]).then(([amb, chm]) => {
    ambientBuffer = amb;
    chimeBuffer = chm;
  }).catch((err) => {
    console.warn('[audio] 音效文件加载失败：', err);
    if (toggleBtn) toggleBtn.hidden = true;
    throw err;
  });
  return initPromise;
}

function updateIcon() {
  if (!toggleBtn) return;
  toggleBtn.classList.toggle('is-muted', muted);
  toggleBtn.setAttribute(
    'aria-label',
    muted ? '已静音，点击开启背景音效' : '背景音效已开启，点击静音'
  );
  toggleBtn.title = muted ? '已静音' : '背景音效';
}

function playAmbientLoop() {
  if (!ctx || !ambientBuffer || !masterGain) return;
  ambientSource = ctx.createBufferSource();
  ambientSource.buffer = ambientBuffer;
  ambientSource.loop = true;
  ambientSource.connect(masterGain);
  ambientSource.start(0);
}

async function startAmbient() {
  if (started || muted || !ambientBuffer) return;
  try {
    if (ctx.state === 'suspended') await ctx.resume();

    if (!masterGain) {
      masterGain = ctx.createGain();
      masterGain.gain.value = 0.18; // 轻柔音量
      masterGain.connect(ctx.destination);
    }

    playAmbientLoop();
    started = true;
    updateIcon();
  } catch (err) {
    console.warn('[audio] 自动播放被阻止：', err);
  }
}

function stopAmbient() {
  if (ambientSource) {
    try {
      ambientSource.stop(0);
    } catch {}
    ambientSource.disconnect();
    ambientSource = null;
  }
  started = false;
}

export function toggleMute() {
  muted = !muted;
  if (muted) {
    if (masterGain && ctx) {
      // 200ms 淡出
      masterGain.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
      setTimeout(stopAmbient, 250);
    } else {
      stopAmbient();
    }
  } else {
    startAmbient();
  }
  updateIcon();
}

export function playChime() {
  if (muted || !ctx || !chimeBuffer) return;
  try {
    const src = ctx.createBufferSource();
    src.buffer = chimeBuffer;
    const g = ctx.createGain();
    g.gain.value = 0.32;
    src.connect(g);
    g.connect(ctx.destination);
    src.start(0);
  } catch (err) {
    console.warn('[audio] 提示音播放失败：', err);
  }
}

export function isMuted() {
  return muted;
}

export async function initAudio() {
  toggleBtn = document.getElementById('audioToggle');
  reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 默认静音（减少动效偏好）
  if (reduceMotion) {
    muted = true;
    if (toggleBtn) updateIcon();
  }

  // 预加载音效文件
  try {
    await loadBuffers();
  } catch {
    return;
  }

  if (!toggleBtn) return;

  toggleBtn.addEventListener('click', () => {
    ensureContext();
    toggleMute();
  });

  updateIcon();

  // 首次用户手势后自动播放（若未静音）
  if (reduceMotion) return;

  const gestures = ['click', 'keydown', 'scroll', 'touchstart'];
  const startOnce = async () => {
    ensureContext();
    await startAmbient();
    gestures.forEach((name) => document.removeEventListener(name, startOnce, { passive: true }));
  };
  gestures.forEach((name) => document.addEventListener(name, startOnce, { passive: true }));
}
