/**
 * AudioEngine — Web Audio 封装
 *
 * 管理 AudioContext、麦克风采集、AnalyserNode、合成音源、主时钟。
 *
 * Phase 1 改造要点：
 *   - `fftSize` 2048 → **4096**（E2 在 2048 窗口下只有 3.5 个周期，MPM 会频繁上跳八度）
 *   - `smoothingTimeConstant` 0.2 → **0**（chroma / onset 需要瞬时能量）
 *   - 新增 `attachSyntheticSource`：无麦克风时的注入通道（§1.8 L2），同时是产品的"演示模式"
 *   - 新增 `readTimeDomain` / `readFrequencyDb` / `inputLevelDb`
 *   - 新增 `onStateChange`：把 AudioContext 的生命周期变化上报给 audioStore
 *
 * ⚠️ AudioContext 生命周期：`new AudioContext()` 可以在任意时刻创建（会处于 suspended），
 * 但 `resume()` **必须在用户手势的同步调用栈内**。因此 `requestMic()` 的顺序必须是
 * `start()`（resume）→ `await getUserMedia()`，不能反过来。
 */

import { ANALYSER_SMOOTHING, FRAME_SIZE, MIN_DBFS } from "@/lib/audio/constants"
import { computeRms, rmsToDbfs } from "@/lib/audio/dsp/rms"
import type { AudioEngineState, AudioSourceKind, SyntheticSourceSpec } from "@/lib/audio/types"
import { STANDARD_GUITAR_TUNING } from "@/lib/music/types"

export interface AudioEngineOptions {
  /** 采样率。**不建议指定** —— 强制 44100 在部分设备触发重采样噪声。 */
  sampleRate?: number
  /** 分析窗口大小（默认 FRAME_SIZE = 4096） */
  fftSize?: number
}

export type AudioEngineStateListener = (state: AudioEngineState) => void

/** 分配一个全新的零值缓冲区（显式 ArrayBuffer 泛型参数，TS 5.9 约束） */
function alloc(length: number): Float32Array<ArrayBuffer> {
  return new Float32Array(new ArrayBuffer(length * Float32Array.BYTES_PER_ELEMENT))
}

export class AudioEngine {
  readonly context: AudioContext
  readonly analyser: AnalyserNode

  private micStream: MediaStream | null = null
  private micSource: MediaStreamAudioSourceNode | null = null
  private syntheticNode: OscillatorNode | AudioBufferSourceNode | null = null
  private syntheticGain: GainNode | null = null
  private sourceKind: AudioSourceKind = "none"

  private timeBuffer: Float32Array<ArrayBuffer>
  private freqBuffer: Float32Array<ArrayBuffer>
  private lastLevelDb = MIN_DBFS

  private readonly stateListeners = new Set<AudioEngineStateListener>()
  private _running = false
  private _disposed = false

  constructor(options: AudioEngineOptions = {}) {
    const fftSize = options.fftSize ?? FRAME_SIZE
    this.context = options.sampleRate
      ? new AudioContext({ sampleRate: options.sampleRate })
      : new AudioContext()
    this.analyser = this.context.createAnalyser()
    this.analyser.fftSize = fftSize
    this.analyser.smoothingTimeConstant = ANALYSER_SMOOTHING
    this.timeBuffer = alloc(fftSize)
    this.freqBuffer = alloc(this.analyser.frequencyBinCount)

    this.context.onstatechange = () => {
      this.emitState()
    }
  }

  // -------------------------------------------------------------------------
  // 输入源
  // -------------------------------------------------------------------------

  /**
   * 请求麦克风权限并接入分析链。**必须在用户手势内调用。**
   *
   * 关闭 echoCancellation / noiseSuppression / autoGainControl —— 这三项都会
   * 破坏乐器信号的谐波结构与动态，让音高与力度检测失真。
   */
  async requestMic(): Promise<MediaStream> {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    })
    this.detachSource()
    this.micStream = stream
    this.micSource = this.context.createMediaStreamSource(stream)
    this.micSource.connect(this.analyser)
    this.sourceKind = "microphone"
    return stream
  }

  /**
   * 接入合成音源，替代麦克风（§1.8 L2）。
   *
   * 其余链路完全不变 —— 分析器看到的东西和真实拾音没有区别，
   * 因此这条通道既是沙箱验收手段，也是麦克风被拒绝时的降级路径。
   *
   * 注意：合成音源**不连到 destination**，只连 analyser，避免演示模式外放啸叫。
   */
  attachSyntheticSource(spec: SyntheticSourceSpec): void {
    this.detachSource()

    const gain = this.context.createGain()
    gain.gain.value = spec.gain ?? 0.6
    gain.connect(this.analyser)
    this.syntheticGain = gain

    if (spec.kind === "oscillator") {
      const oscillator = this.context.createOscillator()
      oscillator.type = "sine"
      oscillator.frequency.value = spec.freqHz
      oscillator.connect(gain)
      oscillator.start()
      this.syntheticNode = oscillator
    } else {
      const buffer = this.context.createBuffer(1, spec.samples.length, this.context.sampleRate)
      buffer.copyToChannel(spec.samples, 0)
      const source = this.context.createBufferSource()
      source.buffer = buffer
      source.loop = spec.loop ?? true
      source.connect(gain)
      source.start()
      this.syntheticNode = source
    }
    this.sourceKind = "synthetic"
  }

  /** 断开并释放当前输入源（麦克风或合成音） */
  detachSource(): void {
    if (this.syntheticNode) {
      try {
        this.syntheticNode.stop()
      } catch {
        // 已经停止过的节点再次 stop 会抛 InvalidStateError，忽略即可
      }
      this.syntheticNode.disconnect()
      this.syntheticNode = null
    }
    if (this.syntheticGain) {
      this.syntheticGain.disconnect()
      this.syntheticGain = null
    }
    if (this.micSource) {
      this.micSource.disconnect()
      this.micSource = null
    }
    if (this.micStream) {
      this.micStream.getTracks().forEach((track) => track.stop())
      this.micStream = null
    }
    this.sourceKind = "none"
  }

  // -------------------------------------------------------------------------
  // 生命周期
  // -------------------------------------------------------------------------

  /** 启动引擎（resume AudioContext）。必须在用户手势的同步调用栈内首次调用。 */
  start(): void {
    if (this._disposed) return
    this._running = true
    if (this.context.state === "suspended") {
      void this.context.resume().then(
        () => this.emitState(),
        () => this.emitState(),
      )
    }
    this.emitState()
  }

  /** 暂停引擎 */
  stop(): void {
    this._running = false
    if (this.context.state === "running") {
      void this.context.suspend().then(
        () => this.emitState(),
        () => this.emitState(),
      )
    }
    this.emitState()
  }

  /** 释放所有资源 */
  dispose(): void {
    if (this._disposed) return
    this._disposed = true
    this._running = false
    this.detachSource()
    this.context.onstatechange = null
    void this.context.close()
    this.emitState()
    this.stateListeners.clear()
  }

  /** 订阅引擎状态变化。@returns 取消订阅函数 */
  onStateChange(listener: AudioEngineStateListener): () => void {
    this.stateListeners.add(listener)
    listener(this.state)
    return () => {
      this.stateListeners.delete(listener)
    }
  }

  private emitState(): void {
    const state = this.state
    for (const listener of this.stateListeners) {
      try {
        listener(state)
      } catch (error) {
        console.error("[AudioEngine] 状态订阅者抛出异常，已隔离:", error)
      }
    }
  }

  // -------------------------------------------------------------------------
  // 数据读取
  // -------------------------------------------------------------------------

  /** 读取时域数据到调用方提供的缓冲区（保留骨架签名，供 PitchDetector 使用） */
  getFloatTimeDomainData(target: Float32Array<ArrayBuffer>): void {
    this.analyser.getFloatTimeDomainData(target)
  }

  /** 读取频域 dB 数据到调用方提供的缓冲区 */
  getFloatFrequencyData(target: Float32Array<ArrayBuffer>): void {
    this.analyser.getFloatFrequencyData(target)
  }

  /**
   * 读取一帧时域数据，返回**内部复用缓冲区**（不要长期持有）。
   * 顺带更新 `inputLevelDb`，避免为了电平表再算一次 rms。
   */
  readTimeDomain(): Float32Array<ArrayBuffer> {
    if (this.timeBuffer.length !== this.analyser.fftSize) {
      this.timeBuffer = alloc(this.analyser.fftSize)
    }
    this.analyser.getFloatTimeDomainData(this.timeBuffer)
    this.lastLevelDb = rmsToDbfs(computeRms(this.timeBuffer))
    return this.timeBuffer
  }

  /** 读取一帧频域 dB 数据，返回**内部复用缓冲区**（不要长期持有） */
  readFrequencyDb(): Float32Array<ArrayBuffer> {
    if (this.freqBuffer.length !== this.analyser.frequencyBinCount) {
      this.freqBuffer = alloc(this.analyser.frequencyBinCount)
    }
    this.analyser.getFloatFrequencyData(this.freqBuffer)
    return this.freqBuffer
  }

  // -------------------------------------------------------------------------
  // 只读属性
  // -------------------------------------------------------------------------

  /** 当前时间（秒，AudioContext 时钟 —— 全项目唯一权威时间源） */
  now(): number {
    return this.context.currentTime
  }

  /** 最近一次 `readTimeDomain()` 得到的输入电平（dBFS） */
  get inputLevelDb(): number {
    return this.lastLevelDb
  }

  get running(): boolean {
    return this._running
  }

  get disposed(): boolean {
    return this._disposed
  }

  /** 当前输入源类型 */
  get inputSource(): AudioSourceKind {
    return this.sourceKind
  }

  /** 是否已接入任意输入源 */
  get hasSource(): boolean {
    return this.sourceKind !== "none"
  }

  /** 对外暴露的引擎状态 */
  get state(): AudioEngineState {
    if (this._disposed || this.context.state === "closed") return "closed"
    if (this.context.state === "running") return "running"
    if (this.context.state === "suspended") return this._running ? "suspended" : "idle"
    return "idle"
  }

  /** AnalyserNode 的频率桶数量 */
  get frequencyBinCount(): number {
    return this.analyser.frequencyBinCount
  }

  /** 标准吉他调弦（默认） */
  static readonly STANDARD_TUNING = STANDARD_GUITAR_TUNING
}
