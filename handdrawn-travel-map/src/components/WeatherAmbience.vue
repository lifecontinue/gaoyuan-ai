<template>
  <Transition name="ambience">
    <div
      v-if="profile"
      ref="rootEl"
      class="ambience"
      :class="'amb--' + profile.condition"
      :style="ambientStyle"
      @mousemove="onMove"
      @mouseleave="onLeave"
    >
      <!-- 动态天空（WebGL 着色器） -->
      <canvas ref="glCanvas" class="amb-gl"></canvas>
      <!-- 粒子系统（Canvas2D） -->
      <canvas ref="fxCanvas" class="amb-fx"></canvas>
      <!-- 暴风雨闪电 -->
      <div class="amb-flash" :class="{ 'is-on': flash }"></div>
      <!-- 景深暗角 + 玻璃 -->
      <div class="amb-vignette"></div>
      <div class="amb-glass-scrim"></div>

      <!-- 浮动语音气泡（该地点有录音时显示） -->
      <div class="amb-audio-dock" v-if="audios.length">
        <button
          v-for="(a, i) in audios"
          :key="i"
          class="amb-audio-btn"
          :class="{ 'is-playing': audioPlayingIdx === i }"
          :style="{ '--float-delay': (i * 0.6) + 's', '--float-dur': (3.4 + i * 0.45) + 's' }"
          type="button"
          @click="toggleAudio(i)"
          :aria-label="'播放语音 ' + (i + 1)"
        >
          <span class="amb-audio-btn__icon">{{ audioPlayingIdx === i ? '⏸' : '🎙️' }}</span>
          <span class="amb-audio-btn__dur">{{ fmtAudioDur(a.duration) }}</span>
        </button>
      </div>

      <!-- 沉浸式记忆卡片 -->
      <Transition name="card" mode="out-in">
        <div class="amb-card" :key="cardKey" v-if="profile">
          <div class="amb-card__top">
            <span class="amb-card__icon">{{ profile.icon }}</span>
            <div class="amb-card__heading">
              <div class="amb-card__place">{{ place }}</div>
              <div class="amb-card__date">{{ dateLabel }}</div>
            </div>
            <button class="amb-close" type="button" @click="exit" aria-label="退出记忆">✕</button>
          </div>

          <div class="amb-card__weather">
            <span class="amb-weather__label">{{ profile.label }}</span>
            <div class="amb-weather__metrics">
              <span class="metric"><b>{{ profile.temperature }}</b>°C</span>
              <span class="metric">湿度 {{ profile.humidity }}%</span>
              <span class="metric">风 {{ profile.wind }}km/h</span>
            </div>
          </div>

          <p class="amb-card__desc">{{ profile.description }}</p>

          <div class="amb-card__memory">
            <span class="amb-memory__tag">记忆</span>
            <p class="amb-memory__text">{{ memoryText }}</p>
          </div>

          <div class="amb-card__hint">移动鼠标，感受环境的纵深 · 按 Esc 退出这场记忆</div>
        </div>
      </Transition>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue'
import { useUIStore } from '@/stores/ui'
import { useTripStore } from '@/stores/trip'
import { getWeatherProfile, type WeatherProfile, type ParticleType } from '@/utils/weatherProfile'
import { ambienceSound } from '@/utils/ambientSound'

const ui = useUIStore()
const tripStore = useTripStore()

const rootEl = ref<HTMLElement | null>(null)
const glCanvas = ref<HTMLCanvasElement | null>(null)
const fxCanvas = ref<HTMLCanvasElement | null>(null)

const flash = ref(false)

// 当前进入的地点 -> 天气档案
const activeTrip = computed(() => {
  const id = ui.immersive?.tripId
  return id ? tripStore.trips.find(t => t.id === id) || null : null
})
const profile = computed<WeatherProfile | null>(() => {
  const t = activeTrip.value
  return t ? getWeatherProfile(t) : null
})

const place = computed(() => activeTrip.value?.place || '')
const dateLabel = computed(() => {
  const t = activeTrip.value
  if (!t) return ''
  return t.startDate && t.endDate && t.startDate !== t.endDate
    ? `${t.startDate} ~ ${t.endDate}`
    : (t.startDate || '')
})
const memoryText = computed(() => {
  const t = activeTrip.value
  if (!t) return ''
  const s = t.story || t.summary || '一段安静的旅行回忆。'
  return s.length > 64 ? s.slice(0, 64) + '…' : s
})
const cardKey = computed(() => (profile.value ? profile.value.condition + '|' + place.value : 'none'))
const ambientStyle = computed(() => {
  const p = profile.value
  if (!p) return {}
  return {
    '--sky-top': p.topColor,
    '--sky-bottom': p.bottomColor,
    '--sky-glow': p.glowColor,
    '--accent-c': p.accentColor,
  } as Record<string, string>
})

// ============================================================
// WebGL 动态天空
// ============================================================
let gl: WebGLRenderingContext | null = null
let glProgram: WebGLProgram | null = null
let uni: Record<string, WebGLUniformLocation | null> = {}
let rafId = 0
let running = false

// 当前 / 目标颜色（用于平滑过渡环境）
const cur = {
  top: [0.37, 0.66, 0.9] as number[],
  bottom: [0.81, 0.92, 0.99] as number[],
  glow: [1, 0.9, 0.66] as number[],
  mode: 0,
  intensity: 0.3,
}
let tgt = { ...cur }

function hexToRgb(h: string): number[] {
  const s = h.replace('#', '')
  const n = parseInt(s.length === 3 ? s.split('').map(c => c + c).join('') : s, 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

const VERT = `attribute vec2 a_pos; void main(){ gl_Position = vec4(a_pos, 0.0, 1.0); }`
const FRAG = `
precision highp float;
uniform vec2 u_res;
uniform float u_time;
uniform vec3 u_top;
uniform vec3 u_bottom;
uniform vec3 u_glow;
uniform float u_intensity;
uniform float u_mode;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p){
  vec2 i=floor(p); vec2 f=fract(p);
  float a=hash(i), b=hash(i+vec2(1.0,0.0)), c=hash(i+vec2(0.0,1.0)), d=hash(i+vec2(1.0,1.0));
  vec2 u=f*f*(3.0-2.0*f);
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}
float fbm(vec2 p){
  float v=0.0, a=0.5;
  for(int i=0;i<5;i++){ v+=a*noise(p); p*=2.0; a*=0.5; }
  return v;
}
void main(){
  vec2 uv = gl_FragCoord.xy / u_res.xy;
  vec2 p = uv; p.x *= u_res.x / u_res.y;
  vec3 col = mix(u_bottom, u_top, pow(uv.y, 0.8));
  float t = u_time * 0.02;
  float clouds = fbm(p * 2.6 + vec2(t, t * 0.5));
  clouds = smoothstep(0.35, 0.95, clouds);
  float glow = smoothstep(0.55, 1.0, uv.y);
  col += u_glow * glow * 0.5;
  col = mix(col, mix(col * 0.55, u_glow * 0.4 + col, 0.3), clouds * u_intensity);
  if (u_mode > 2.5 && u_mode < 3.5) { col *= mix(1.0, 0.55, clouds); }      // 暴风雨压暗
  if (u_mode > 4.5 && u_mode < 5.5) { col = mix(col, u_top, 0.4 * clouds + 0.25); } // 雾
  float vig = smoothstep(1.25, 0.2, length(uv - 0.5));
  col *= mix(0.82, 1.0, vig);
  gl_FragColor = vec4(col, 1.0);
}`

function compile(type: number, src: string): WebGLShader | null {
  if (!gl) return null
  const sh = gl.createShader(type)
  if (!sh) return null
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.warn('[WeatherAmbience] shader error:', gl.getShaderInfoLog(sh))
    return null
  }
  return sh
}

function initGL() {
  const canvas = glCanvas.value
  if (!canvas || gl) return
  gl = canvas.getContext('webgl', { premultipliedAlpha: false, antialias: false })
  if (!gl) {
    // 无 WebGL 时退回 CSS 渐变（ambientStyle 已设置变量）
    return
  }
  const vs = compile(gl.VERTEX_SHADER, VERT)
  const fs = compile(gl.FRAGMENT_SHADER, FRAG)
  if (!vs || !fs) { gl = null; return }
  glProgram = gl.createProgram()
  if (!glProgram) { gl = null; return }
  gl.attachShader(glProgram, vs)
  gl.attachShader(glProgram, fs)
  gl.linkProgram(glProgram)
  if (!gl.getProgramParameter(glProgram, gl.LINK_STATUS)) {
    console.warn('[WeatherAmbience] link error'); gl = null; return
  }
  gl.useProgram(glProgram)
  const buf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  const loc = gl.getAttribLocation(glProgram, 'a_pos')
  gl.enableVertexAttribArray(loc)
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
  uni = {
    res: gl.getUniformLocation(glProgram, 'u_res'),
    time: gl.getUniformLocation(glProgram, 'u_time'),
    top: gl.getUniformLocation(glProgram, 'u_top'),
    bottom: gl.getUniformLocation(glProgram, 'u_bottom'),
    glow: gl.getUniformLocation(glProgram, 'u_glow'),
    intensity: gl.getUniformLocation(glProgram, 'u_intensity'),
    mode: gl.getUniformLocation(glProgram, 'u_mode'),
  }
}

function resizeGL() {
  const c = glCanvas.value
  const f = fxCanvas.value
  if (!c || !f) return
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const w = window.innerWidth
  const h = window.innerHeight
  for (const cv of [c, f]) {
    cv.width = Math.floor(w * dpr)
    cv.height = Math.floor(h * dpr)
    cv.style.width = w + 'px'
    cv.style.height = h + 'px'
  }
  if (gl) gl.viewport(0, 0, c.width, c.height)
}

// ============================================================
// 粒子系统（Canvas2D）
// ============================================================
interface P { x: number; y: number; vx: number; vy: number; s: number; r: number; rv: number; a: number }
let particles: P[] = []
let fxCtx: CanvasRenderingContext2D | null = null
let lastType: ParticleType = 'none'

function buildParticles(type: ParticleType) {
  const f = fxCanvas.value
  if (!f) return
  const area = window.innerWidth * window.innerHeight
  const counts: Record<ParticleType, number> = {
    none: 0, mote: Math.round(area / 26000), rain: Math.round(area / 2600),
    storm: Math.round(area / 1600), snow: Math.round(area / 5200),
    fog: 7, petal: Math.round(area / 14000), leaf: Math.round(area / 16000),
  }
  const n = counts[type] || 0
  particles = []
  for (let i = 0; i < n; i++) particles.push(spawnParticle(type, true))
}

function spawnParticle(type: ParticleType, anywhere = false): P {
  const w = window.innerWidth
  const h = window.innerHeight
  const r = Math.random()
  switch (type) {
    case 'rain':
    case 'storm':
      return { x: Math.random() * w, y: anywhere ? Math.random() * h : -20, vx: (type === 'storm' ? -3.2 : -1.8), vy: type === 'storm' ? 19 : 13, s: 1, r: 0, rv: 0, a: 0.5 }
    case 'snow':
      return { x: Math.random() * w, y: anywhere ? Math.random() * h : -20, vx: 0, vy: 1 + Math.random() * 1.6, s: 2 + Math.random() * 3, r: 0, rv: 0, a: 0.8 }
    case 'petal':
      return { x: Math.random() * w, y: anywhere ? Math.random() * h : -20, vx: 0.6 + Math.random(), vy: 1.1 + Math.random() * 1.2, s: 5 + Math.random() * 4, r: Math.random() * 6.28, rv: (Math.random() - 0.5) * 0.08, a: 0.9 }
    case 'leaf':
      return { x: Math.random() * w, y: anywhere ? Math.random() * h : -20, vx: 0.8 + Math.random() * 1.4, vy: 1.3 + Math.random() * 1.3, s: 7 + Math.random() * 5, r: Math.random() * 6.28, rv: (Math.random() - 0.5) * 0.1, a: 0.92 }
    case 'fog':
      return { x: Math.random() * w, y: Math.random() * h, vx: 0.2 + Math.random() * 0.4, vy: 0, s: 220 + Math.random() * 220, r: 0, rv: 0, a: 0.06 }
    case 'mote':
    default:
      return { x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - 0.5) * 0.3, vy: -0.15 - Math.random() * 0.25, s: 1 + Math.random() * 2, r: 0, rv: 0, a: 0.5 }
  }
}

function drawParticles(dt: number) {
  const f = fxCanvas.value
  if (!f || !fxCtx) return
  const w = window.innerWidth, h = window.innerHeight
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  fxCtx.setTransform(1, 0, 0, 1, 0, 0)
  fxCtx.clearRect(0, 0, f.width, f.height)
  fxCtx.setTransform(dpr, 0, 0, dpr, 0, 0)
  const type = lastType
  const tint = type === 'snow' ? '255,255,255'
    : type === 'petal' ? '244,150,184'
    : type === 'leaf' ? '217,139,63'
    : type === 'fog' ? '255,255,255'
    : type === 'mote' ? '255,240,200'
    : '200,225,245'
  for (const p of particles) {
    p.x += p.vx * dt * 0.06
    p.y += p.vy * dt * 0.06
    if (type === 'snow') p.x += Math.sin((p.y + p.r * 40) * 0.01) * 0.6
    if (type === 'petal' || type === 'leaf') { p.r += p.rv; p.x += Math.sin(p.y * 0.02 + p.r) * 0.5 }
    // 回绕
    if (p.y > h + 30) Object.assign(p, spawnParticle(type))
    if (p.x < -40) p.x = w + 30
    if (p.x > w + 40) p.x = -30
    if (type === 'fog') {
      if (p.x - p.s > w) p.x = -p.s
      const g = fxCtx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.s)
      g.addColorStop(0, `rgba(${tint},${p.a})`)
      g.addColorStop(1, `rgba(${tint},0)`)
      fxCtx.fillStyle = g
      fxCtx.beginPath(); fxCtx.arc(p.x, p.y, p.s, 0, 6.2832); fxCtx.fill()
      continue
    }
    if (type === 'rain' || type === 'storm') {
      fxCtx.strokeStyle = `rgba(${tint},${p.a})`
      fxCtx.lineWidth = type === 'storm' ? 2 : 1.3
      fxCtx.beginPath()
      fxCtx.moveTo(p.x, p.y)
      fxCtx.lineTo(p.x - p.vx * 2.2, p.y - p.vy * 2.2)
      fxCtx.stroke()
    } else if (type === 'snow') {
      fxCtx.fillStyle = `rgba(${tint},${p.a})`
      fxCtx.beginPath(); fxCtx.arc(p.x, p.y, p.s, 0, 6.2832); fxCtx.fill()
    } else if (type === 'petal' || type === 'leaf') {
      fxCtx.fillStyle = `rgba(${tint},${p.a})`
      fxCtx.save()
      fxCtx.translate(p.x, p.y); fxCtx.rotate(p.r)
      fxCtx.beginPath()
      fxCtx.ellipse(0, 0, p.s, p.s * 0.5, 0, 0, 6.2832)
      fxCtx.fill()
      fxCtx.restore()
    } else {
      fxCtx.fillStyle = `rgba(${tint},${p.a})`
      fxCtx.beginPath(); fxCtx.arc(p.x, p.y, p.s, 0, 6.2832); fxCtx.fill()
    }
  }
}

// ============================================================
// 主循环
// ============================================================
let lastT = 0
let lightningTimer = 0

function lerp(a: number, b: number, t: number) { return a + (b - a) * t }

function loop(t: number) {
  if (!running) return
  const dt = Math.min(64, t - lastT || 16)
  lastT = t

  // 颜色与目标平滑过渡（切换记忆时环境渐变）
  const p = profile.value
  if (p) {
    tgt.top = hexToRgb(p.topColor); tgt.bottom = hexToRgb(p.bottomColor); tgt.glow = hexToRgb(p.glowColor)
    tgt.mode = p.shaderMode; tgt.intensity = p.intensity
    if (lastType !== p.particle) { lastType = p.particle; buildParticles(p.particle) }
  }
  const k = 0.06
  for (let i = 0; i < 3; i++) {
    cur.top[i] = lerp(cur.top[i], tgt.top[i], k)
    cur.bottom[i] = lerp(cur.bottom[i], tgt.bottom[i], k)
    cur.glow[i] = lerp(cur.glow[i], tgt.glow[i], k)
  }
  cur.mode = lerp(cur.mode, tgt.mode, k)
  cur.intensity = lerp(cur.intensity, tgt.intensity, k)

  // 视差（鼠标）
  mouseCur.x = lerp(mouseCur.x, mouseTgt.x, 0.08)
  mouseCur.y = lerp(mouseCur.y, mouseTgt.y, 0.08)
  if (rootEl.value) {
    rootEl.value.style.setProperty('--px', mouseCur.x.toFixed(1) + 'px')
    rootEl.value.style.setProperty('--py', mouseCur.y.toFixed(1) + 'px')
  }

  // WebGL 天空
  if (gl && glProgram) {
    gl.useProgram(glProgram)
    gl.uniform2f(uni.res, glCanvas.value!.width, glCanvas.value!.height)
    gl.uniform1f(uni.time, t * 0.001)
    gl.uniform3fv(uni.top, cur.top)
    gl.uniform3fv(uni.bottom, cur.bottom)
    gl.uniform3fv(uni.glow, cur.glow)
    gl.uniform1f(uni.intensity, cur.intensity)
    gl.uniform1f(uni.mode, cur.mode)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  // 粒子
  drawParticles(dt)

  // 闪电
  if (lastType === 'storm') {
    lightningTimer -= dt
    if (lightningTimer <= 0) {
      lightningTimer = 2600 + Math.random() * 4200
      flash.value = true
      setTimeout(() => (flash.value = false), 130)
    }
  }

  rafId = requestAnimationFrame(loop)
}

const mouseTgt = { x: 0, y: 0 }
const mouseCur = { x: 0, y: 0 }
function onMove(e: MouseEvent) {
  mouseTgt.x = e.clientX - window.innerWidth / 2
  mouseTgt.y = e.clientY - window.innerHeight / 2
}
function onLeave() { mouseTgt.x = 0; mouseTgt.y = 0 }

function start() {
  if (running) return
  running = true
  lastT = 0
  fxCtx = fxCanvas.value?.getContext('2d') || null
  resizeGL()
  requestAnimationFrame(loop)
}
function stop() {
  running = false
  if (rafId) cancelAnimationFrame(rafId)
  rafId = 0
}

// ============================================================
// 天气环境音（白噪音式合成）
// ============================================================
function startAmbience() {
  const c = profile.value?.condition
  if (c) ambienceSound.start(c)
}
function setAmbienceCondition() {
  const c = profile.value?.condition
  if (c) ambienceSound.setCondition(c)
}
function stopAmbience() {
  ambienceSound.stop()
}

// ============================================================
// 浮动语音气泡
// ============================================================
const audios = computed(() => activeTrip.value?.audios || [])
const audioPlayingIdx = ref(-1)
let voicePlayer: HTMLAudioElement | null = null

function toggleAudio(i: number) {
  const a = audios.value[i]
  if (!a) return
  if (audioPlayingIdx.value === i && voicePlayer) {
    voicePlayer.pause()
    voicePlayer = null
    audioPlayingIdx.value = -1
    return
  }
  if (voicePlayer) {
    voicePlayer.pause()
    voicePlayer = null
  }
  voicePlayer = new Audio(a.url)
  voicePlayer.onended = () => {
    audioPlayingIdx.value = -1
    voicePlayer = null
  }
  audioPlayingIdx.value = i
  voicePlayer.play().catch(() => {
    audioPlayingIdx.value = -1
    voicePlayer = null
  })
}

function stopVoice() {
  if (voicePlayer) {
    voicePlayer.pause()
    voicePlayer.onended = null
    voicePlayer = null
  }
  audioPlayingIdx.value = -1
}

function fmtAudioDur(sec: number | undefined): string {
  const s = Math.max(0, Math.floor(sec || 0))
  const m = Math.floor(s / 60).toString().padStart(2, '0')
  const ss = (s % 60).toString().padStart(2, '0')
  return m + ':' + ss
}

function exit() {
  stopVoice()
  stopAmbience()
  ui.exitWeather()
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && ui.immersive) exit()
}

// 当进入/退出时启停渲染与环境音
watch(() => !!ui.immersive, async (active) => {
  if (active) {
    await nextTick()
    initGL()
    resizeGL()
    fxCtx = fxCanvas.value?.getContext('2d') || null
    start()
    startAmbience()
  } else {
    stop()
    stopAmbience()
    stopVoice()
  }
})

watch(() => ui.immersive?.tripId, () => {
  // 切换记忆：重建粒子 + 切换天气环境音
  const p = profile.value
  if (p && running) { lastType = p.particle; buildParticles(p.particle) }
  setAmbienceCondition()
  stopVoice()
})

window.addEventListener('resize', resizeGL)
window.addEventListener('keydown', onKey)
onBeforeUnmount(() => {
  stop()
  stopAmbience()
  stopVoice()
  window.removeEventListener('resize', resizeGL)
  window.removeEventListener('keydown', onKey)
})
</script>

<style scoped>
.ambience {
  position: fixed;
  inset: 0;
  z-index: 2000;
  overflow: hidden;
  cursor: default;
  /* 无 WebGL 时的 CSS 渐变兜底 */
  background: linear-gradient(180deg, var(--sky-top, #5fa8e6), var(--sky-bottom, #cfeafc));
  --px: 0px;
  --py: 0px;
}

.amb-gl,
.amb-fx {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  will-change: transform;
}
.amb-gl {
  transform: translate3d(calc(var(--px) * -0.6px), calc(var(--py) * -0.6px), 0) scale(1.08);
}
.amb-fx {
  transform: translate3d(calc(var(--px) * 1.2px), calc(var(--py) * 1.2px), 0);
}

.amb-vignette {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(120% 90% at 50% 40%, transparent 45%, rgba(20, 16, 28, 0.45) 100%);
  mix-blend-mode: multiply;
}

/* 玻璃模糊层：让背后的地图"沉"进环境里 */
.amb-glass-scrim {
  position: absolute;
  inset: 0;
  pointer-events: none;
  -webkit-backdrop-filter: blur(14px) saturate(120%);
  backdrop-filter: blur(14px) saturate(120%);
  background: rgba(255, 255, 255, 0.04);
}

.amb-flash {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(60% 50% at 50% 30%, rgba(255, 255, 255, 0.9), rgba(255, 255, 255, 0));
  opacity: 0;
  transition: opacity 0.12s ease;
}
.amb-flash.is-on { opacity: 1; }

/* ---------------- 记忆卡片（玻璃拟态） ---------------- */
.amb-card {
  position: absolute;
  left: 50%;
  bottom: 8%;
  transform: translate3d(calc(-50% + var(--px) * -2px), calc(var(--py) * -2px), 0);
  width: min(440px, 86vw);
  padding: 22px 24px 18px;
  border-radius: 22px 18px 24px 16px / 18px 24px 16px 22px;
  background: linear-gradient(160deg, rgba(255, 255, 255, 0.22), rgba(255, 255, 255, 0.08));
  -webkit-backdrop-filter: blur(22px) saturate(180%);
  backdrop-filter: blur(22px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.35);
  box-shadow: 0 24px 60px rgba(20, 16, 28, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.4);
  color: #fff;
  text-shadow: 0 1px 8px rgba(0, 0, 0, 0.35);
}
.amb-card__top {
  display: flex;
  align-items: center;
  gap: 12px;
}
.amb-card__icon {
  font-size: 30px;
  filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.3));
}
.amb-card__heading { flex: 1; min-width: 0; }
.amb-card__place {
  font-family: var(--font-display, serif);
  font-size: 22px;
  font-weight: 800;
  letter-spacing: 1px;
}
.amb-card__date { font-size: 12px; opacity: 0.85; margin-top: 2px; }
.amb-close {
  width: 30px; height: 30px;
  border: 1px solid rgba(255, 255, 255, 0.5);
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.12);
  color: #fff; cursor: pointer;
  font-size: 14px; line-height: 1;
  transition: background 0.2s ease, transform 0.2s ease;
}
.amb-close:hover { background: rgba(255, 255, 255, 0.28); transform: rotate(90deg); }

.amb-card__weather {
  margin-top: 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
}
.amb-weather__label {
  font-size: 15px;
  font-weight: 700;
  padding: 4px 12px;
  border-radius: 12px 8px 14px 9px;
  background: rgba(255, 255, 255, 0.16);
  border: 1px solid rgba(255, 255, 255, 0.3);
}
.amb-weather__metrics { display: flex; gap: 12px; font-size: 12.5px; opacity: 0.92; }
.amb-weather__metrics b { font-size: 16px; }

.amb-card__desc {
  margin: 14px 0 0;
  font-family: var(--font-serif, serif);
  font-size: 14px;
  line-height: 1.7;
  opacity: 0.95;
}

.amb-card__memory {
  margin-top: 14px;
  padding: 12px 14px;
  border-radius: 14px;
  background: rgba(0, 0, 0, 0.18);
  border-left: 3px solid var(--accent-c, #f4c95d);
}
.amb-memory__tag {
  font-size: 11px;
  letter-spacing: 2px;
  opacity: 0.8;
}
.amb-memory__text {
  margin: 4px 0 0;
  font-family: var(--font-serif, serif);
  font-size: 13.5px;
  line-height: 1.7;
}
.amb-card__hint {
  margin-top: 14px;
  font-size: 11px;
  opacity: 0.7;
  text-align: center;
}

/* ---------------- 进入 / 退出过渡 ---------------- */
.ambience-enter-active { transition: opacity 0.9s cubic-bezier(0.22, 1, 0.36, 1); }
.ambience-leave-active { transition: opacity 0.7s ease; }
.ambience-enter-from,
.ambience-leave-to { opacity: 0; }

.card-enter-active { transition: opacity 0.7s ease 0.25s, transform 0.7s cubic-bezier(0.22, 1, 0.36, 1) 0.25s; }
.card-leave-active { transition: opacity 0.35s ease, transform 0.35s ease; }
.card-enter-from { opacity: 0; transform: translate(-50%, 40px); }
.card-leave-to { opacity: 0; transform: translate(-50%, 20px); }

/* ---------------- 浮动语音气泡 ---------------- */
.amb-audio-dock {
  position: absolute;
  right: 4%;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  gap: 18px;
  z-index: 5;
  pointer-events: auto;
}

.amb-audio-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 18px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.16);
  border: 1px solid rgba(255, 255, 255, 0.35);
  -webkit-backdrop-filter: blur(14px);
  backdrop-filter: blur(14px);
  color: #fff;
  font-family: var(--font-body, inherit);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 8px 24px rgba(20, 16, 28, 0.28);
  animation: float-bob var(--float-dur, 4s) ease-in-out var(--float-delay, 0s) infinite;
  transition: background 0.2s ease, transform 0.15s ease, box-shadow 0.2s ease;
}

.amb-audio-btn:hover {
  background: rgba(255, 255, 255, 0.28);
  box-shadow: 0 12px 30px rgba(20, 16, 28, 0.35);
  transform: scale(1.04);
}

.amb-audio-btn:active {
  transform: scale(0.96);
}

.amb-audio-btn.is-playing {
  background: rgba(255, 255, 255, 0.32);
  border-color: rgba(255, 255, 255, 0.5);
}

.amb-audio-btn__icon {
  font-size: 18px;
  line-height: 1;
  filter: drop-shadow(0 1px 4px rgba(0, 0, 0, 0.3));
  transition: transform 0.15s ease;
}

.amb-audio-btn.is-playing .amb-audio-btn__icon {
  animation: audio-pulse 1s ease-in-out infinite;
}

.amb-audio-btn__dur {
  font-variant-numeric: tabular-nums;
  opacity: 0.85;
  font-size: 12px;
}

@keyframes float-bob {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-14px); }
}

@keyframes audio-pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.18); }
}
</style>
