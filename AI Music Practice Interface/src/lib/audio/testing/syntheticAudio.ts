/**
 * 合成音频生成器（DEVELOPMENT_PLAN §1.8 L1）
 *
 * 沙箱 / CI 内 `getUserMedia` 不可用，整条分析链路必须能脱离麦克风被驱动。
 * 本模块产出**确定性**（无 Math.random）的时域波形，供：
 *   1. vitest 单测直接喂给 dsp / PitchDetector / AnalysisPipeline
 *   2. 浏览器"演示模式"（`?audio=synth`）通过 AudioBufferSourceNode 播放
 *
 * 约束：不依赖 window / AudioContext / performance，node 可直接运行。
 * 所有缓冲区显式标注 `Float32Array<ArrayBuffer>`（TS 5.9 TypedArray 泛型化）。
 */

/** 拨弦音的默认谐波幅度包络（基频 + 4 次谐波），近似钢弦吉他 */
export const DEFAULT_PLUCK_HARMONICS: readonly number[] = [1, 0.5, 0.33, 0.25, 0.2]

/** 拨弦音默认衰减时间常数（秒） */
export const DEFAULT_PLUCK_TAU_SEC = 0.8

/** 扫弦时相邻两根弦之间的默认时间差（毫秒） */
export const DEFAULT_STRUM_SPREAD_MS = 12

/** 分配一个全新的零值缓冲区（显式 ArrayBuffer 泛型参数） */
export function allocBuffer(lengthSamples: number): Float32Array<ArrayBuffer> {
  return new Float32Array(new ArrayBuffer(lengthSamples * Float32Array.BYTES_PER_ELEMENT))
}

/**
 * 确定性伪随机数发生器（mulberry32）。
 * 用它而不是 Math.random，保证噪声测试可复现。
 */
export function createRandom(seed: number = 0x9e3779b9): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * 纯正弦波。
 *
 * @param freqHz     频率
 * @param sampleRate 采样率
 * @param lengthSamples 样本数
 * @param amplitude  峰值幅度（默认 0.5）
 */
export function generateSine(
  freqHz: number,
  sampleRate: number,
  lengthSamples: number,
  amplitude: number = 0.5,
): Float32Array<ArrayBuffer> {
  const out = allocBuffer(lengthSamples)
  const omega = (2 * Math.PI * freqHz) / sampleRate
  for (let i = 0; i < lengthSamples; i += 1) {
    out[i] = amplitude * Math.sin(omega * i)
  }
  return out
}

/** `generatePluckedTone` 的可选参数 */
export interface PluckedToneOptions {
  /** 峰值幅度（默认 0.5） */
  amplitude?: number
  /** 谐波幅度序列（默认 DEFAULT_PLUCK_HARMONICS） */
  harmonics?: readonly number[]
  /** 指数衰减时间常数（秒，默认 0.8） */
  tauSec?: number
  /** 起始时间偏移（秒）—— 用于把同一根音的包络对齐到扫弦时间点 */
  startOffsetSec?: number
  /** 攻击段时长（秒，默认 3ms），避免包络在 t=0 处的阶跃产生宽带冲激 */
  attackSec?: number
}

/**
 * 拨弦音：基频 + 若干谐波，整体套指数衰减包络。
 *
 * 这是本项目最重要的测试激励 —— 低音 E2（82.41Hz）含 5 次谐波时，
 * 是 MPM/YIN 最容易发生八度误判的场景（DoD #5 就是针对它）。
 */
export function generatePluckedTone(
  freqHz: number,
  sampleRate: number,
  lengthSamples: number,
  options: PluckedToneOptions = {},
): Float32Array<ArrayBuffer> {
  const amplitude = options.amplitude ?? 0.5
  const harmonics = options.harmonics ?? DEFAULT_PLUCK_HARMONICS
  const tauSec = options.tauSec ?? DEFAULT_PLUCK_TAU_SEC
  const startOffsetSec = options.startOffsetSec ?? 0
  const attackSec = options.attackSec ?? 0.003

  // 归一化系数：保证 |x| <= amplitude（谐波同相叠加的最坏情况）
  let harmonicSum = 0
  for (const h of harmonics) harmonicSum += Math.abs(h)
  const norm = harmonicSum > 0 ? amplitude / harmonicSum : 0

  const out = allocBuffer(lengthSamples)
  for (let i = 0; i < lengthSamples; i += 1) {
    const t = i / sampleRate + startOffsetSec
    if (t < 0) continue
    const decay = Math.exp(-t / tauSec)
    const attack = attackSec > 0 ? Math.min(1, t / attackSec) : 1
    const envelope = decay * attack
    let sample = 0
    for (let h = 0; h < harmonics.length; h += 1) {
      const partialHz = freqHz * (h + 1)
      // 超过奈奎斯特的谐波直接丢弃，避免混叠
      if (partialHz >= sampleRate / 2) break
      sample += harmonics[h] * Math.sin(2 * Math.PI * partialHz * t)
    }
    out[i] = norm * envelope * sample
  }
  return out
}

/**
 * 多个纯正弦叠加（和弦内音）。
 * 用于 chroma 的音级归属验证（DoD #8）。
 *
 * @param freqsHz 各分量频率
 * @param amplitude 合成后的峰值幅度（默认 0.5）
 */
export function generateChordTone(
  freqsHz: readonly number[],
  sampleRate: number,
  lengthSamples: number,
  amplitude: number = 0.5,
): Float32Array<ArrayBuffer> {
  const out = allocBuffer(lengthSamples)
  if (freqsHz.length === 0) return out
  const norm = amplitude / freqsHz.length
  for (let i = 0; i < lengthSamples; i += 1) {
    let sample = 0
    for (const f of freqsHz) {
      sample += Math.sin((2 * Math.PI * f * i) / sampleRate)
    }
    out[i] = norm * sample
  }
  return out
}

/** 绝对静音（全 0） */
export function generateSilence(
  _sampleRate: number,
  lengthSamples: number,
): Float32Array<ArrayBuffer> {
  return allocBuffer(lengthSamples)
}

/**
 * 白噪声，rms 精确等于给定的 dBFS。
 *
 * @param dbfs 目标电平（如 -70 → rms ≈ 0.000316）
 * @param seed PRNG 种子，保证可复现
 */
export function generateNoise(
  _sampleRate: number,
  lengthSamples: number,
  dbfs: number,
  seed: number = 12345,
): Float32Array<ArrayBuffer> {
  const out = allocBuffer(lengthSamples)
  if (lengthSamples === 0) return out
  const random = createRandom(seed)
  // 先生成 [-1,1) 均匀噪声
  for (let i = 0; i < lengthSamples; i += 1) {
    out[i] = random() * 2 - 1
  }
  // 再精确缩放到目标 rms
  let sumSquares = 0
  for (let i = 0; i < lengthSamples; i += 1) sumSquares += out[i] * out[i]
  const currentRms = Math.sqrt(sumSquares / lengthSamples)
  if (currentRms === 0) return out
  const targetRms = Math.pow(10, dbfs / 20)
  const scale = targetRms / currentRms
  for (let i = 0; i < lengthSamples; i += 1) out[i] *= scale
  return out
}

/** 一次扫弦事件 */
export interface StrumEvent {
  /** 事件起始时间（毫秒，相对整段开头） */
  atMs: number
  /** 该次扫弦发出的各弦频率（从低音弦到高音弦） */
  freqsHz: readonly number[]
  /** 峰值幅度（默认 0.5） */
  amplitude?: number
  /** 相邻弦之间的时间差（毫秒，默认 12） */
  spreadMs?: number
  /**
   * 单音衰减时间常数（秒），默认 `DEFAULT_PLUCK_TAU_SEC`（0.8）。
   *
   * ## 默认值 0.8 就是验收基线，别为了让测试变绿去调短它
   * 0.8 对应钢弦吉他的真实长尾（4×tau ≈ 3.2s），在 BPM 92（拍间 652ms）下
   * 前序尾音与后续扫弦**必然重叠** —— 这正是生产环境的样子，验收就该按它跑。
   *
   * 曾经有一版把测试统一改成 `tauSec: 0.15`，理由是"长尾重叠让 OnsetDetector 误报"。
   * team-lead 的本机实测**证伪了它**：tau=0.15 照样 25 个 onset（tau=0.8 是 26 个），
   * 而且 onset 间隔满屏 107ms（= 锁定期 100ms + 一个 hop 的量化）—— 说明限流的
   * 只有最小间隔，阈值门根本是敞开的。真正的根因在检测器缺"峰值拾取"级，
   * 已在 `OnsetDetector` 补齐（见该文件头注释），与 tau 无关。
   *
   * 传短值（≈0.15s）仍然有意义 —— 它模拟**断奏 / 闷音**这类宽松场景，
   * 可以作为补充用例，但**不能替代 0.8 的基线**。
   */
  tauSec?: number
}

/**
 * 渲染一段扫弦序列 —— Phase 3 离线"虚拟练习会话"的激励源，
 * 也是浏览器演示模式（`?audio=synth`）的音频内容。
 *
 * @param events   扫弦事件列表
 * @param sampleRate 采样率
 * @param totalMs  整段总时长（毫秒）
 */
export function renderStrumSequence(
  events: readonly StrumEvent[],
  sampleRate: number,
  totalMs: number,
): Float32Array<ArrayBuffer> {
  const totalSamples = Math.max(0, Math.round((totalMs / 1000) * sampleRate))
  const out = allocBuffer(totalSamples)
  if (totalSamples === 0) return out

  for (const event of events) {
    const spreadMs = event.spreadMs ?? DEFAULT_STRUM_SPREAD_MS
    const amplitude = event.amplitude ?? 0.5
    const perString = event.freqsHz.length > 0 ? amplitude / Math.sqrt(event.freqsHz.length) : 0

    event.freqsHz.forEach((freqHz, stringIndex) => {
      const startMs = event.atMs + stringIndex * spreadMs
      const startSample = Math.round((startMs / 1000) * sampleRate)
      if (startSample >= totalSamples) return
      const remaining = totalSamples - startSample
      // 单音衰减时间常数：测试可传短值避免尾音重叠（见 StrumEvent.tauSec 注释）
      const tauSec = event.tauSec ?? DEFAULT_PLUCK_TAU_SEC
      // 单音最长渲染 4 个时间常数（此后幅度 < 2%）
      const noteSamples = Math.min(remaining, Math.round(4 * tauSec * sampleRate))
      const tone = generatePluckedTone(freqHz, sampleRate, noteSamples, {
        amplitude: perString,
        tauSec,
      })
      for (let i = 0; i < noteSamples; i += 1) {
        out[startSample + i] += tone[i]
      }
    })
  }

  // 软限幅，避免叠加后越界
  let peak = 0
  for (let i = 0; i < totalSamples; i += 1) {
    const abs = Math.abs(out[i])
    if (abs > peak) peak = abs
  }
  if (peak > 0.95) {
    const scale = 0.95 / peak
    for (let i = 0; i < totalSamples; i += 1) out[i] *= scale
  }
  return out
}

/**
 * 把一段长波形按 hopSize 切成分析帧（长度固定为 frameSize，末尾不足处补 0）。
 * 这是 offline runner 与所有"逐帧跑满 N 秒"类测试的公共工具。
 *
 * @returns 帧数组，第 i 帧覆盖 [i*hopSize, i*hopSize + frameSize)
 */
export function sliceFrames(
  samples: Float32Array<ArrayBuffer>,
  frameSize: number,
  hopSize: number,
): Float32Array<ArrayBuffer>[] {
  const frames: Float32Array<ArrayBuffer>[] = []
  if (frameSize <= 0 || hopSize <= 0) return frames
  for (let start = 0; start + frameSize <= samples.length; start += hopSize) {
    const frame = allocBuffer(frameSize)
    frame.set(samples.subarray(start, start + frameSize))
    frames.push(frame)
  }
  return frames
}
