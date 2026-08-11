/**
 * RMS / 电平相关的纯 DSP 函数。
 *
 * 硬性约束（DEVELOPMENT_PLAN §1.1）：
 * 本目录**不得引用 window / AudioContext / performance**，保证 node 环境可单测。
 */

import { MIN_DBFS, NOISE_GATE_DBFS, NOISE_GATE_RMS } from "@/lib/audio/constants"

/**
 * 均方根电平（线性 0-1）。
 *
 * @param samples 时域样本
 * @returns rms，空数组返回 0
 */
export function computeRms(samples: ArrayLike<number>): number {
  const length = samples.length
  if (length === 0) return 0
  let sumSquares = 0
  for (let i = 0; i < length; i += 1) {
    const v = samples[i]
    sumSquares += v * v
  }
  return Math.sqrt(sumSquares / length)
}

/**
 * 峰值幅度（线性 0-1）。
 */
export function computePeak(samples: ArrayLike<number>): number {
  let peak = 0
  for (let i = 0; i < samples.length; i += 1) {
    const abs = Math.abs(samples[i])
    if (abs > peak) peak = abs
  }
  return peak
}

/**
 * 线性幅度 → dBFS，并在 `floorDb` 处截断。
 *
 * 截断的意义：rms = 0 时 log10 会返回 -Infinity，直接进 UI 会渲染成 "-Infinity dB"，
 * 进统计会污染均值。统一截到 MIN_DBFS（-100）。
 *
 * @param rms     线性幅度（>= 0）
 * @param floorDb 下限（默认 MIN_DBFS = -100）
 */
export function rmsToDbfs(rms: number, floorDb: number = MIN_DBFS): number {
  if (!(rms > 0)) return floorDb
  const db = 20 * Math.log10(rms)
  return db < floorDb ? floorDb : db
}

/**
 * dBFS → 线性幅度。
 */
export function dbfsToRms(dbfs: number): number {
  return Math.pow(10, dbfs / 20)
}

/**
 * 噪声门限判定。**必须先于音高检测执行**（省 CPU + 从根上杜绝静音乱报）。
 *
 * @param rms       线性幅度
 * @param gateDbfs  门限（默认 NOISE_GATE_DBFS = -50 dBFS，对应 rms ≈ 0.00316）
 * @returns true 表示信号足够强，可以进入后续分析
 */
export function isAboveGate(rms: number, gateDbfs: number = NOISE_GATE_DBFS): boolean {
  const threshold = gateDbfs === NOISE_GATE_DBFS ? NOISE_GATE_RMS : dbfsToRms(gateDbfs)
  return rms >= threshold
}

/**
 * 把 dBFS 映射到 0-1 的显示比例（用于电平条）。
 *
 * @param dbfs  输入电平
 * @param minDb 量程下界（映射到 0）
 * @param maxDb 量程上界（映射到 1）
 */
export function dbfsToLevelRatio(dbfs: number, minDb: number, maxDb: number): number {
  if (maxDb <= minDb) return 0
  const ratio = (dbfs - minDb) / (maxDb - minDb)
  if (ratio < 0) return 0
  if (ratio > 1) return 1
  return ratio
}
