/**
 * 行迹 · 沉浸式天气环境音
 * 用 Web Audio 合成「白噪音」式环境声 —— 噪声缓冲 → 双二阶滤波 → 增益,
 * 加 LFO 增益摆动模拟风声起伏。匹配 8 种天气状况，雷阵雨额外叠加低频雷声。
 */

import type { WeatherCondition } from './weatherProfile'

// ============================================================
// 每种天气的音频参数
// ============================================================
interface SoundShape {
  type: BiquadFilterType
  freq: number
  q: number
  gain: number
  lfoFreq: number
  lfoDepth: number
  thunder?: boolean
}

const SHAPES: Record<WeatherCondition, SoundShape> = {
  rainy:  { type: 'bandpass', freq: 1400, q: 0.4, gain: 0.50, lfoFreq: 0.25, lfoDepth: 0.12 },
  storm:  { type: 'bandpass', freq: 1100, q: 0.5, gain: 0.62, lfoFreq: 0.30, lfoDepth: 0.16, thunder: true },
  snow:   { type: 'lowpass',  freq: 500,  q: 0.7, gain: 0.16, lfoFreq: 0.10, lfoDepth: 0.05 },
  fog:    { type: 'lowpass',  freq: 260,  q: 0.7, gain: 0.12, lfoFreq: 0.06, lfoDepth: 0.04 },
  cloudy: { type: 'bandpass', freq: 520,  q: 0.8, gain: 0.30, lfoFreq: 0.14, lfoDepth: 0.12 },
  sunny:  { type: 'bandpass', freq: 900,  q: 0.6, gain: 0.14, lfoFreq: 0.08, lfoDepth: 0.05 },
  petals: { type: 'bandpass', freq: 1000, q: 0.6, gain: 0.13, lfoFreq: 0.12, lfoDepth: 0.05 },
  autumn: { type: 'bandpass', freq: 750,  q: 0.7, gain: 0.20, lfoFreq: 0.18, lfoDepth: 0.09 },
}

// ============================================================
// AmbientSoundEngine — 单例（整个页面只有一个环境音播放器）
// ============================================================
class AmbientSoundEngine {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private noiseGain: GainNode | null = null
  private filter: BiquadFilterNode | null = null
  private source: AudioBufferSourceNode | null = null
  private lfo: OscillatorNode | null = null
  private lfoGain: GainNode | null = null
  private noiseBuffer: AudioBuffer | null = null
  private thunderTimer: ReturnType<typeof setTimeout> | null = null
  private condition: WeatherCondition | null = null
  private gen = 0 // 代际计数器：防止快速切/退时的残留计时器误销毁新实例

  private ensureCtx(): AudioContext | null {
    if (this.ctx) return this.ctx
    const AC = window.AudioContext || (window as any).webkitAudioContext
    if (!AC) return null
    this.ctx = new AC()
    return this.ctx
  }

  private getNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noiseBuffer) return this.noiseBuffer
    const len = ctx.sampleRate * 2 // 2s 循环
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
    this.noiseBuffer = buf
    return buf
  }

  // ---- 开始 / 切换 ----

  start(condition: WeatherCondition) {
    ++this.gen
    const ctx = this.ensureCtx()
    if (!ctx) return
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})

    this.condition = condition

    // 已在播放 → 仅调参数（平滑过渡）
    if (this.source) {
      this.applyShape(condition, true)
      return
    }

    const shape = SHAPES[condition]
    this.master = ctx.createGain()
    this.master.gain.value = 0.0001
    this.master.connect(ctx.destination)

    this.filter = ctx.createBiquadFilter()
    this.filter.type = shape.type
    this.filter.frequency.value = shape.freq
    this.filter.Q.value = shape.q

    this.noiseGain = ctx.createGain()
    this.noiseGain.gain.value = shape.gain

    this.source = ctx.createBufferSource()
    this.source.buffer = this.getNoiseBuffer(ctx)
    this.source.loop = true
    this.source.connect(this.filter)
    this.filter.connect(this.noiseGain)
    this.noiseGain.connect(this.master)

    // LFO 增益摆动（风 / 雨声起伏）
    if (shape.lfoDepth > 0) {
      this.lfo = ctx.createOscillator()
      this.lfo.type = 'sine'
      this.lfo.frequency.value = shape.lfoFreq
      this.lfoGain = ctx.createGain()
      this.lfoGain.gain.value = shape.gain * shape.lfoDepth
      this.lfo.connect(this.lfoGain)
      this.lfoGain.connect(this.noiseGain.gain)
      this.lfo.start()
    }

    this.source.start()
    this.master.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 2.5)

    if (shape.thunder) this.scheduleThunder()
  }

  /** 切换天气（不重建整条链，只改参数） */
  setCondition(condition: WeatherCondition) {
    if (!this.ctx || !this.source) {
      this.start(condition)
      return
    }
    ++this.gen
    this.condition = condition
    this.applyShape(condition, true)
  }

  private applyShape(condition: WeatherCondition, fade = false) {
    const ctx = this.ctx
    if (!ctx || !this.filter || !this.noiseGain) return
    const shape = SHAPES[condition]
    const t = ctx.currentTime
    if (fade) {
      this.filter.frequency.linearRampToValueAtTime(shape.freq, t + 1.2)
      this.noiseGain.gain.linearRampToValueAtTime(shape.gain, t + 1.2)
    } else {
      this.filter.frequency.value = shape.freq
      this.noiseGain.gain.value = shape.gain
    }
    this.filter.type = shape.type
    this.filter.Q.value = shape.q

    if (shape.thunder && !this.thunderTimer) this.scheduleThunder()
    if (!shape.thunder && this.thunderTimer) {
      clearTimeout(this.thunderTimer)
      this.thunderTimer = null
    }

    if (this.lfo && this.lfoGain) {
      this.lfo.frequency.value = shape.lfoFreq
      this.lfoGain.gain.value = shape.gain * shape.lfoDepth
    }
  }

  // ---- 雷声调度 ----

  private scheduleThunder() {
    if (!this.ctx) return
    const delay = 2500 + Math.random() * 6500
    this.thunderTimer = setTimeout(() => {
      this.thunderTimer = null
      this.boom()
      if (this.condition && SHAPES[this.condition].thunder) this.scheduleThunder()
    }, delay)
  }

  /** 一次低频轰响（噪声 → 低通 → 快速 attack / 慢衰减包络） */
  private boom() {
    const ctx = this.ctx
    if (!ctx || !this.master) return
    const t = ctx.currentTime
    const src = ctx.createBufferSource()
    src.buffer = this.getNoiseBuffer(ctx)
    src.loop = true
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.setValueAtTime(60, t)
    lp.frequency.exponentialRampToValueAtTime(38, t + 2.2)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.9, t + 0.06)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4)
    src.connect(lp)
    lp.connect(g)
    g.connect(this.master)
    src.start(t)
    src.stop(t + 2.6)
  }

  // ---- 停止 ----

  stop() {
    const g = ++this.gen
    const ctx = this.ctx
    if (!ctx) return
    if (this.thunderTimer) {
      clearTimeout(this.thunderTimer)
      this.thunderTimer = null
    }
    if (this.master) {
      const m = this.master
      m.gain.cancelScheduledValues(ctx.currentTime)
      m.gain.setValueAtTime(m.gain.value, ctx.currentTime)
      m.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.7)
      setTimeout(() => {
        if (this.gen === g) this.teardown()
      }, 800)
    } else {
      this.teardown()
    }
  }

  private teardown() {
    try { this.source?.stop() } catch { /* already stopped */ }
    try { this.lfo?.stop() } catch { /* */ }
    this.source?.disconnect()
    this.filter?.disconnect()
    this.noiseGain?.disconnect()
    this.lfo?.disconnect()
    this.lfoGain?.disconnect()
    this.master?.disconnect()
    this.source = null
    this.filter = null
    this.noiseGain = null
    this.lfo = null
    this.lfoGain = null
    this.master = null
    this.condition = null
  }
}

/** 页面级单例 */
export const ambienceSound = new AmbientSoundEngine()
