/**
 * AnalysisPipeline — 每帧分析总装线
 *
 * 输入一帧时域样本，输出一个完整的 `AudioFrame`（rms / pitch / confirmedNote / chroma / onset）。
 *
 * 两条等价入口（§1.8）：
 *   - `processBuffer(samples, sampleRate, timeSec)`：**纯计算**，自带 JS FFT，node 可跑，单测与离线回放用
 *   - `processFrame(samples, spectrumDb, sampleRate, timeSec)`：实时路径，可复用 AnalyserNode 的频域数据
 *
 * ## Phase 3 口径统一（team-lead 拍板"方向 1"）
 * 曾经的设计是：离线 chroma 用 16384 FFT，实时 chroma 直接吃 AnalyserNode 的 4096 频谱。
 * Phase 3 的守卫用例证伪了它背后的假设 —— 4096 @48kHz 下 A2(110Hz) 与 C3(130.81Hz)
 * 只差 1.8 个 bin（< Hann 主瓣 4 bin），即便加上丰富谐波，Am7 的 top-4 也会漂成 {E,G,B,C}。
 * 于是**两条路径统一走 16384 的 chroma 环形缓冲**：
 *   - `chromaFftSize`(16384) → 只服务 chroma
 *   - `frameSize`(4096)      → 只服务 pitch/YIN 与 onset（低延迟需求在这一侧）
 * 传入的 `spectrumDb` 因此**只用于 onset**，不再参与 chroma。
 * 这样"离线测出来的分 == 线上跑出来的分"，测试口径即生产口径。
 *
 * 本类只负责组装，不含 DSP 细节；DSP 全在 `dsp/` 下的纯函数里。
 */

import {
  CHROMA_FFT_SIZE,
  FRAME_SIZE,
  HOP_SIZE,
  NOISE_GATE_DBFS,
  SAMPLE_RATE_FALLBACK,
  analysisLatencyMs,
} from "@/lib/audio/constants"
import { computeChroma } from "@/lib/audio/dsp/chroma"
import { computeSpectrumDb } from "@/lib/audio/dsp/fft"
import { computeRms, isAboveGate, rmsToDbfs } from "@/lib/audio/dsp/rms"
import { OnsetDetector } from "@/lib/audio/OnsetDetector"
import { NoteStabilizer } from "@/lib/audio/NoteStabilizer"
import { PitchDetector } from "@/lib/audio/PitchDetector"
import type { AudioFrame } from "@/lib/audio/types"

export interface AnalysisPipelineOptions {
  /** 采样率（默认 48000，实时路径请传 `AudioContext.sampleRate`） */
  sampleRate?: number
  /** 分析窗口大小（默认 FRAME_SIZE = 4096），服务 pitch/YIN 与 onset */
  frameSize?: number
  /** 相邻帧前进的样本数（默认 HOP_SIZE = 1024），决定 chroma 环形缓冲的写入量 */
  hopSize?: number
  /** chroma 的 FFT 长度（默认 CHROMA_FFT_SIZE = 16384；实时与离线**统一**用它） */
  chromaFftSize?: number
  /** 噪声门限 dBFS（默认 -50） */
  noiseGateDbfs?: number
  /** 注入自定义检测器（测试用） */
  detector?: PitchDetector
  /** 注入自定义稳定器（测试用） */
  stabilizer?: NoteStabilizer
  /**
   * ★ 变异守卫开关：置 `false` 摘掉 OnsetDetector 的峰值拾取级。
   * 只允许测试用来证明那一级真的在承重，生产路径永远不传。
   */
  onsetPeakPicking?: boolean
}

/** 分配一个全新的零值缓冲区（显式 ArrayBuffer 泛型参数，TS 5.9 约束） */
function alloc(length: number): Float32Array<ArrayBuffer> {
  return new Float32Array(new ArrayBuffer(length * Float32Array.BYTES_PER_ELEMENT))
}

/** 复用的全 0 chroma（静音帧返回它的拷贝，避免每帧分配） */
const EMPTY_CHROMA_LENGTH = 12

export class AnalysisPipeline {
  readonly detector: PitchDetector
  readonly stabilizer: NoteStabilizer

  private readonly frameSize: number
  private readonly hopSize: number
  private readonly chromaFftSize: number
  private readonly noiseGateDbfs: number
  private sampleRate: number

  /** chroma 用的时域环形缓冲（比单帧长，换取低频分辨率，见 constants.CHROMA_FFT_SIZE 注释） */
  private readonly chromaRing: Float32Array<ArrayBuffer>
  private chromaWriteIndex = 0
  private chromaFilled = 0
  /** 环形缓冲展开后的线性副本（避免每帧重新分配） */
  private readonly chromaLinear: Float32Array<ArrayBuffer>

  /** 自适应阈值 onset 检测器（FRAME_SIZE 口径的逐帧频谱驱动） */
  private readonly onsetDetector: OnsetDetector

  private frameCount = 0

  constructor(options: AnalysisPipelineOptions = {}) {
    this.sampleRate = options.sampleRate ?? SAMPLE_RATE_FALLBACK
    this.frameSize = options.frameSize ?? FRAME_SIZE
    this.hopSize = options.hopSize ?? HOP_SIZE
    this.chromaFftSize = options.chromaFftSize ?? CHROMA_FFT_SIZE
    this.noiseGateDbfs = options.noiseGateDbfs ?? NOISE_GATE_DBFS
    this.detector =
      options.detector ??
      new PitchDetector(null, {
        bufferSize: this.frameSize,
        noiseGateDbfs: this.noiseGateDbfs,
      })
    this.stabilizer = options.stabilizer ?? new NoteStabilizer()
    this.chromaRing = alloc(this.chromaFftSize)
    this.chromaLinear = alloc(this.chromaFftSize)
    // onset 走 FRAME_SIZE 口径（单边谱长度 = frameSize/2），要的是低延迟而非频率分辨率
    this.onsetDetector = new OnsetDetector(this.frameSize >> 1, {
      peakPicking: options.onsetPeakPicking ?? true,
    })
  }

  /** 已处理的帧数（诊断用） */
  get processedFrames(): number {
    return this.frameCount
  }

  /**
   * 当前采样率与窗口下的分析固有延迟（ms，≈ 42.7ms @ 4096/48kHz）。
   *
   * Phase 3 的 timing 判定必须减掉它，见 `AudioFrame.musicTimeMs`。
   */
  get latencyMs(): number {
    return analysisLatencyMs(this.sampleRate, this.frameSize)
  }

  /** 更新采样率（切换输入设备时调用） */
  setSampleRate(sampleRate: number): void {
    if (sampleRate > 0) this.sampleRate = sampleRate
  }

  /** 清空所有内部状态（重新开始一次会话时调用） */
  reset(): void {
    this.stabilizer.reset()
    this.onsetDetector.reset()
    this.chromaRing.fill(0)
    this.chromaWriteIndex = 0
    this.chromaFilled = 0
    this.frameCount = 0
  }

  /**
   * 纯计算入口（node 可跑）：chroma 由内置 JS FFT 从内部环形缓冲计算。
   *
   * @param samples    时域样本（长度通常等于 frameSize）
   * @param sampleRate 采样率
   * @param timeSec    帧时间（秒）
   */
  processBuffer(
    samples: Float32Array<ArrayBuffer>,
    sampleRate: number,
    timeSec: number,
  ): AudioFrame {
    return this.processFrame(samples, null, sampleRate, timeSec)
  }

  /**
   * 通用入口。
   *
   * @param samples    时域样本
   * @param spectrumDb 帧级频域 dB 数据（长度 = frameSize/2）。**只用于 onset**；
   *                   传 null 时用内置 JS FFT 现算。chroma 一律走 16384 环形缓冲，
   *                   不再消费这个参数（见文件头"口径统一"）。
   * @param sampleRate 采样率
   * @param timeSec    帧时间（秒）
   */
  processFrame(
    samples: Float32Array<ArrayBuffer>,
    spectrumDb: Float32Array<ArrayBuffer> | null,
    sampleRate: number,
    timeSec: number,
  ): AudioFrame {
    this.setSampleRate(sampleRate)
    this.frameCount += 1
    // 内部各级（PitchDetector / NoteStabilizer）只关心**帧间相对时间**，
    // 统一偏移不改变它们的行为，因此这里仍用读取时刻，保持既有语义稳定。
    const timeMs = timeSec * 1000
    // 对外则给出补偿后的声学时刻，供 Phase 3 与拍点做减法（§Phase 3 前瞻）。
    const musicTimeMs = timeMs - this.latencyMs

    // ---- ① rms + 噪声门限 ----
    const rms = computeRms(samples)
    const levelDb = rmsToDbfs(rms)
    const aboveGate = isAboveGate(rms, this.noiseGateDbfs)

    // ---- ② 音高（门限内才跑 MPM） ----
    const pitch = aboveGate ? this.detector.detectFromBuffer(samples, sampleRate, timeMs) : null

    // ---- ③ 稳定化 ----
    const confirmedNote = this.stabilizer.push(pitch, timeMs)

    // ---- ④ chroma（**实时与离线统一走 16384 环形缓冲**）----
    this.pushToChromaRing(samples)
    let chroma: Float32Array<ArrayBuffer>
    if (!aboveGate) {
      chroma = alloc(EMPTY_CHROMA_LENGTH)
    } else {
      const chromaWindow = this.readChromaWindow()
      const chromaSpectrumDb = computeSpectrumDb(chromaWindow, this.chromaFftSize)
      chroma = computeChroma(chromaSpectrumDb, sampleRate, this.chromaFftSize)
    }

    // ---- ⑤ onset（帧级频谱，低延迟优先）----
    // 实时路径直接复用 AnalyserNode 的 4096 频谱；离线路径现算一份同口径的。
    const frameSpectrumDb = spectrumDb ?? computeSpectrumDb(samples, this.frameSize)
    const onsetResult = this.onsetDetector.push(frameSpectrumDb, aboveGate, musicTimeMs)

    return {
      timeSec,
      musicTimeMs,
      rms,
      levelDb,
      aboveGate,
      pitch,
      confirmedNote,
      chroma,
      onset: onsetResult.isOnset,
      // 峰值拾取的一个 hop 前瞻延迟已在 OnsetDetector 内部补掉，这里原样透传。
      // 千万别写成 musicTimeMs —— 那等于把补偿又丢了（见 AudioFrame.onsetTimeMs 注释）。
      onsetTimeMs: onsetResult.onsetTimeMs,
      spectralFlux: onsetResult.flux,
    }
  }

  /**
   * 把本帧的**新增样本**写入 chroma 环形缓冲。
   *
   * 相邻分析帧有 (frameSize - hopSize) 的重叠，若整帧写入会造成信号重复拼接（梳状滤波假象），
   * 因此只取末尾 hopSize 个样本 —— 对于按 hop 切帧的离线回放，这恰好无损重建原始信号。
   */
  private pushToChromaRing(samples: Float32Array<ArrayBuffer>): void {
    const take = Math.min(this.hopSize, samples.length)
    const start = samples.length - take
    for (let i = 0; i < take; i += 1) {
      this.chromaRing[this.chromaWriteIndex] = samples[start + i]
      this.chromaWriteIndex = (this.chromaWriteIndex + 1) % this.chromaFftSize
    }
    this.chromaFilled = Math.min(this.chromaFftSize, this.chromaFilled + take)
  }

  /** 把环形缓冲展开成"时间递增"的线性数组（最新样本在末尾） */
  private readChromaWindow(): Float32Array<ArrayBuffer> {
    const size = this.chromaFftSize
    const head = this.chromaWriteIndex
    // [head, size) 是较旧的一段，[0, head) 是较新的一段
    this.chromaLinear.set(this.chromaRing.subarray(head, size), 0)
    this.chromaLinear.set(this.chromaRing.subarray(0, head), size - head)
    return this.chromaLinear
  }
}
