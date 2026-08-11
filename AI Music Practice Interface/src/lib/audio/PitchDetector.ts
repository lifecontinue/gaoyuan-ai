/**
 * PitchDetector — 基于 pitchy（McLeod Pitch Method）的音高检测
 *
 * Phase 1 改造要点：
 *   1. 新增 `detectFromBuffer(samples, sampleRate)` —— 绕开 AudioEngine 直接测（§1.8 L1）
 *   2. 阈值全部来自 `constants.ts`，不再散落魔法数字
 *   3. **噪声门限先于音高检测执行**（省 CPU + 从根上杜绝静音乱报）
 *   4. `engine` 变为可选 —— node 环境下可以脱离 Web Audio 构造
 *
 * 注意：检测循环不再由本类持有（骨架里的 `setInterval` 在后台标签页会被 throttle 到 1Hz
 * 且不通知）。循环统一由 `usePitchDetection` 用 requestAnimationFrame 驱动。
 */

import { PitchDetector as PitchyDetector } from "pitchy"
import type { AudioEngine } from "@/lib/audio/AudioEngine"
import { centsOff, frequencyToNote } from "@/lib/audio/noteUtils"
import {
  CLARITY_THRESHOLD,
  FRAME_SIZE,
  NOISE_GATE_DBFS,
  PITCH_MAX_HZ,
  PITCH_MIN_HZ,
} from "@/lib/audio/constants"
import { computeRms, isAboveGate } from "@/lib/audio/dsp/rms"
import type { PitchResult } from "@/lib/audio/types"

export type { PitchResult }

export interface PitchDetectorOptions {
  /** 分析窗口大小（默认 FRAME_SIZE = 4096） */
  bufferSize?: number
  /** 有效基频下界（默认 PITCH_MIN_HZ = 70） */
  minFrequency?: number
  /** 有效基频上界（默认 PITCH_MAX_HZ = 1320） */
  maxFrequency?: number
  /** clarity 阈值（默认 CLARITY_THRESHOLD = 0.90） */
  threshold?: number
  /** 噪声门限（dBFS，默认 NOISE_GATE_DBFS = -50） */
  noiseGateDbfs?: number
}

/** 单调递增的毫秒时间戳；node 与浏览器都有 globalThis.performance */
function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now()
}

export class PitchDetector {
  private readonly engine: AudioEngine | null
  private readonly minFreq: number
  private readonly maxFreq: number
  private readonly threshold: number
  private readonly noiseGateDbfs: number
  private readonly defaultBufferSize: number

  /** 按输入长度缓存 pitchy 检测器（pitchy 实例与 inputLength 绑定） */
  private readonly detectorCache = new Map<number, PitchyDetector<Float32Array>>()

  /** 实时路径复用的时域缓冲区 */
  private liveBuffer: Float32Array<ArrayBuffer>

  constructor(engine: AudioEngine | null = null, options: PitchDetectorOptions = {}) {
    this.engine = engine
    this.defaultBufferSize = options.bufferSize ?? FRAME_SIZE
    this.minFreq = options.minFrequency ?? PITCH_MIN_HZ
    this.maxFreq = options.maxFrequency ?? PITCH_MAX_HZ
    this.threshold = options.threshold ?? CLARITY_THRESHOLD
    this.noiseGateDbfs = options.noiseGateDbfs ?? NOISE_GATE_DBFS
    this.liveBuffer = new Float32Array(
      new ArrayBuffer(this.defaultBufferSize * Float32Array.BYTES_PER_ELEMENT),
    )
  }

  /** 取得（或惰性创建）对应输入长度的 pitchy 检测器 */
  private getDetector(inputLength: number): PitchyDetector<Float32Array> {
    let detector = this.detectorCache.get(inputLength)
    if (!detector) {
      detector = PitchyDetector.forFloat32Array(inputLength)
      // pitchy 自带的 clarity 门限设低一点，由本类统一按 constants 判定，
      // 这样 clarity 数值本身仍然可读（用于 UI 与诊断）。
      detector.clarityThreshold = 0.5
      this.detectorCache.set(inputLength, detector)
    }
    return detector
  }

  /**
   * 从任意时域缓冲区检测音高 —— **纯计算入口，无 Web Audio 依赖**。
   *
   * 处理顺序严格遵循 DEVELOPMENT_PLAN §1.6：
   *   1. rms → 噪声门限（不过门限直接返回 null，不跑 MPM）
   *   2. MPM 求 [freq, clarity]
   *   3. clarity / 频率范围过滤
   *
   * @param samples    时域样本
   * @param sampleRate 采样率
   * @param timestampMs 时间戳（毫秒）。不传则取 performance.now()，测试可注入虚拟时钟。
   * @returns 有效音高，或 null
   */
  detectFromBuffer(
    samples: Float32Array<ArrayBuffer>,
    sampleRate: number,
    timestampMs: number = nowMs(),
  ): PitchResult | null {
    if (samples.length === 0 || sampleRate <= 0) return null

    // ① 噪声门限先行
    const rms = computeRms(samples)
    if (!isAboveGate(rms, this.noiseGateDbfs)) return null

    // ② MPM
    const detector = this.getDetector(samples.length)
    const [frequency, clarity] = detector.findPitch(samples, sampleRate)

    // ③ 过滤
    if (!Number.isFinite(frequency) || frequency <= 0) return null
    if (frequency < this.minFreq || frequency > this.maxFreq) return null
    if (clarity < this.threshold) return null

    const note = frequencyToNote(frequency)
    return {
      frequency,
      clarity,
      noteName: note.name,
      octave: note.octave,
      midi: note.midi,
      centsOff: centsOff(frequency, note.midi),
      timestamp: timestampMs,
    }
  }

  /**
   * 从绑定的 AudioEngine 读一帧并检测（实时路径）。
   * 未绑定 engine 时返回 null（不 throw —— 组件层不该为此写 try/catch）。
   */
  detect(timestampMs: number = nowMs()): PitchResult | null {
    if (!this.engine) return null
    if (this.liveBuffer.length !== this.engine.analyser.fftSize) {
      this.liveBuffer = new Float32Array(
        new ArrayBuffer(this.engine.analyser.fftSize * Float32Array.BYTES_PER_ELEMENT),
      )
    }
    this.engine.getFloatTimeDomainData(this.liveBuffer)
    return this.detectFromBuffer(this.liveBuffer, this.engine.context.sampleRate, timestampMs)
  }

  /** 释放缓存（长时间会话切换设备时调用） */
  dispose(): void {
    this.detectorCache.clear()
  }
}
