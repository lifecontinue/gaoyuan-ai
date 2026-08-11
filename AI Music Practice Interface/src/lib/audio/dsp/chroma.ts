/**
 * Chroma（12 维音级能量）—— 纯函数。
 *
 * 硬性约束：本目录不得引用 window / AudioContext / performance。
 *
 * ## 为什么用"谱峰 + 抛物线插值"而不是"逐 bin 直接折叠"
 *
 * 朴素做法是遍历每个 FFT bin，用 bin 中心频率算出音级再累加能量。
 * 这在低频段会**系统性错位**：4096 @ 48kHz 时 bin 间距 11.72Hz，
 * 110Hz（A2）落在 bin 9.39，而 bin 9 / bin 10 的中心频率分别对应 midi 44.27 / 46.10 ——
 * 两个都不是 45（A2）。也就是说低音区的音级归属会被量化误差整体带偏。
 *
 * 改用谱峰检测 + 三点抛物线插值后，峰值频率估计精度可达亚 bin 级
 * （110Hz 处误差 < 1Hz ≈ 15 cents），音级归属才可靠。
 * 附带好处：宽带噪声没有尖锐谱峰，天然被抑制。
 */

import {
  CHROMA_MAX_HZ,
  CHROMA_MIN_HZ,
  CHROMA_PEAK_FLOOR_DB,
  MIN_DBFS,
} from "@/lib/audio/constants"
import { frequencyToMidi } from "@/lib/audio/noteUtils"

/** 音级数量（十二平均律） */
export const PITCH_CLASS_COUNT = 12

/** 分配一个全新的零值缓冲区（显式 ArrayBuffer 泛型参数，TS 5.9 约束） */
function alloc(length: number): Float32Array<ArrayBuffer> {
  return new Float32Array(new ArrayBuffer(length * Float32Array.BYTES_PER_ELEMENT))
}

/** 检测到的一个谱峰 */
export interface SpectralPeak {
  /** 插值后的频率（Hz） */
  frequencyHz: number
  /** 插值后的峰值幅度（线性） */
  magnitude: number
  /** 峰所在的整数 bin */
  bin: number
}

/** `computeChroma` / `findSpectralPeaks` 的可选参数 */
export interface ChromaOptions {
  /** 统计频率下界（Hz，默认 CHROMA_MIN_HZ） */
  minHz?: number
  /** 统计频率上界（Hz，默认 CHROMA_MAX_HZ） */
  maxHz?: number
  /** 相对最强峰的动态范围门限（dB，默认 CHROMA_PEAK_FLOOR_DB = -50） */
  peakFloorDb?: number
}

/**
 * 从 dB 幅度谱中找出所有局部极大值，并用三点抛物线插值细化频率与幅度。
 *
 * @param spectrumDb 单边 dB 幅度谱（长度 = fftSize / 2）
 * @param sampleRate 采样率
 * @param fftSize    FFT 长度
 */
export function findSpectralPeaks(
  spectrumDb: ArrayLike<number>,
  sampleRate: number,
  fftSize: number,
  options: ChromaOptions = {},
): SpectralPeak[] {
  const minHz = options.minHz ?? CHROMA_MIN_HZ
  const maxHz = options.maxHz ?? CHROMA_MAX_HZ
  const peakFloorDb = options.peakFloorDb ?? CHROMA_PEAK_FLOOR_DB

  const bins = spectrumDb.length
  const peaks: SpectralPeak[] = []
  if (bins < 3 || fftSize <= 0 || sampleRate <= 0) return peaks

  const binHz = sampleRate / fftSize
  const startBin = Math.max(1, Math.floor(minHz / binHz))
  const endBin = Math.min(bins - 2, Math.ceil(maxHz / binHz))
  if (startBin > endBin) return peaks

  // 先求本帧最强 dB，用于动态范围门限
  let maxDb = -Infinity
  for (let k = startBin; k <= endBin; k += 1) {
    if (spectrumDb[k] > maxDb) maxDb = spectrumDb[k]
  }
  if (!Number.isFinite(maxDb) || maxDb <= MIN_DBFS) return peaks
  const thresholdDb = maxDb + peakFloorDb

  for (let k = startBin; k <= endBin; k += 1) {
    const center = spectrumDb[k]
    if (center < thresholdDb) continue
    const prev = spectrumDb[k - 1]
    const next = spectrumDb[k + 1]
    if (!(center > prev && center >= next)) continue

    // 三点抛物线插值（在 dB 域上做，对 Hann 窗的偏差最小）
    const denominator = prev - 2 * center + next
    let delta = 0
    if (Math.abs(denominator) > 1e-9) {
      delta = (0.5 * (prev - next)) / denominator
    }
    if (delta > 0.5) delta = 0.5
    if (delta < -0.5) delta = -0.5

    const frequencyHz = (k + delta) * binHz
    if (frequencyHz < minHz || frequencyHz > maxHz) continue

    const peakDb = center - 0.25 * (prev - next) * delta
    peaks.push({
      frequencyHz,
      magnitude: Math.pow(10, peakDb / 20),
      bin: k,
    })
  }

  return peaks
}

/**
 * 计算 12 维音级能量（chroma），归一化到 max = 1。
 *
 * @param spectrumDb 单边 dB 幅度谱（`AnalyserNode.getFloatFrequencyData` 或 `computeSpectrumDb` 的输出）
 * @param sampleRate 采样率
 * @param fftSize    FFT 长度（= spectrumDb.length * 2）
 * @returns 长度 12 的 Float32Array，索引 0 = C、1 = C#、… 11 = B；无有效能量时全 0
 */
export function computeChroma(
  spectrumDb: ArrayLike<number>,
  sampleRate: number,
  fftSize: number,
  options: ChromaOptions = {},
): Float32Array<ArrayBuffer> {
  const chroma = alloc(PITCH_CLASS_COUNT)
  const peaks = findSpectralPeaks(spectrumDb, sampleRate, fftSize, options)
  if (peaks.length === 0) return chroma

  for (const peak of peaks) {
    const midi = Math.round(frequencyToMidi(peak.frequencyHz))
    const pitchClass = ((midi % PITCH_CLASS_COUNT) + PITCH_CLASS_COUNT) % PITCH_CLASS_COUNT
    chroma[pitchClass] += peak.magnitude
  }

  let max = 0
  for (let i = 0; i < PITCH_CLASS_COUNT; i += 1) {
    if (chroma[i] > max) max = chroma[i]
  }
  if (max <= 0) return chroma
  for (let i = 0; i < PITCH_CLASS_COUNT; i += 1) {
    chroma[i] /= max
  }
  return chroma
}

/**
 * 按能量降序返回音级索引（用于"top-N 音级"类判定）。
 */
export function rankPitchClasses(chroma: ArrayLike<number>): number[] {
  const indices: number[] = []
  for (let i = 0; i < chroma.length; i += 1) indices.push(i)
  indices.sort((a, b) => chroma[b] - chroma[a])
  return indices
}

/**
 * 期望音级集合在 chroma 中的能量占比（DEVELOPMENT_PLAN §1.7 的 `tonalRatio`）。
 *
 * @param chroma      12 维音级能量
 * @param expectedPCs 期望的音级索引集合（0-11）
 * @returns 0-1；总能量为 0 时返回 0
 */
export function computeTonalRatio(
  chroma: ArrayLike<number>,
  expectedPCs: readonly number[],
): number {
  let total = 0
  for (let i = 0; i < chroma.length; i += 1) total += chroma[i]
  if (total <= 0) return 0
  let matched = 0
  for (const pc of expectedPCs) {
    const index = ((pc % PITCH_CLASS_COUNT) + PITCH_CLASS_COUNT) % PITCH_CLASS_COUNT
    matched += chroma[index]
  }
  const ratio = matched / total
  if (ratio < 0) return 0
  if (ratio > 1) return 1
  return ratio
}
