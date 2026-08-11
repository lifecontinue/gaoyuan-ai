/**
 * 频谱通量（Spectral Flux）—— 纯函数（DEVELOPMENT_PLAN §4 ②）
 *
 * 硬性约束：本目录不得引用 window / AudioContext / performance。
 *
 * 频谱通量衡量"相邻两帧幅度谱的正增量之和"。拨弦 / 起音处能量骤升 → 通量尖峰；
 * 稳态或衰减段能量只降不升 → 通量≈0。因此它是 onset（起音）检测的黄金特征。
 */

/** 分配一个零值缓冲区（显式 ArrayBuffer 泛型参数，TS 5.9 约束） */
function alloc(length: number): Float32Array<ArrayBuffer> {
  return new Float32Array(new ArrayBuffer(length * Float32Array.BYTES_PER_ELEMENT))
}

/**
 * dB 幅度谱 → 线性幅度（mag = 10^(db/20)）。
 *
 * `AnalyserNode.getFloatFrequencyData` 给出的是 dB 值，而通量公式需要线性幅度。
 */
export function dbToMagnitude(spectrumDb: ArrayLike<number>): Float32Array<ArrayBuffer> {
  const out = alloc(spectrumDb.length)
  for (let i = 0; i < spectrumDb.length; i += 1) {
    out[i] = Math.pow(10, spectrumDb[i] / 20)
  }
  return out
}

/**
 * 频谱通量：相邻两帧线性幅度谱的**正增量**之和。
 *
 * 只在能量上升沿累加（`max(0, mag[i] - prevMag[i])`），下降沿不计入 ——
 * 否则衰减段的能量整体下滑也会被算成"有事件"。
 */
export function spectralFlux(prevMag: ArrayLike<number>, mag: ArrayLike<number>): number {
  const n = Math.min(prevMag.length, mag.length)
  let flux = 0
  for (let i = 0; i < n; i += 1) {
    const delta = mag[i] - prevMag[i]
    if (delta > 0) flux += delta
  }
  return flux
}

/**
 * 中位数（不改变入参）。空数组返回 0。
 *
 * 用于 onset 自适应阈值：取最近 N 帧通量的中位数（而非均值）以抗离群尖峰。
 */
export function median(values: readonly number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
}
