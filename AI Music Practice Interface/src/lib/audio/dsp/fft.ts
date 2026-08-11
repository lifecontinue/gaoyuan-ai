/**
 * 极简 radix-2 FFT + 幅度谱工具（纯函数，node 可运行）。
 *
 * 为什么需要它（架构说明，DEVELOPMENT_PLAN 未列出，属于实现补充）：
 * `computeChroma` 的输入是频域数据。实时路径下这份数据由 `AnalyserNode.getFloatFrequencyData`
 * 提供（浏览器原生 FFT）；但 §1.8 要求 `AnalysisPipeline.processBuffer(samples, ...)`
 * 必须能在**没有 AudioContext 的 node 环境**里跑通，因此必须自带一份 JS FFT。
 *
 * 硬性约束：本目录不得引用 window / AudioContext / performance。
 */

import { MIN_DBFS } from "@/lib/audio/constants"

/** 判断是否 2 的整数次幂 */
export function isPowerOfTwo(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0
}

/** 分配一个全新的零值 Float32 缓冲区（显式 ArrayBuffer 泛型参数，TS 5.9 约束） */
function alloc(length: number): Float32Array<ArrayBuffer> {
  return new Float32Array(new ArrayBuffer(length * Float32Array.BYTES_PER_ELEMENT))
}

/**
 * 原地 radix-2 Cooley-Tukey FFT。
 *
 * @param re 实部（长度必须是 2 的幂）
 * @param im 虚部（与 re 等长）
 */
export function fftInPlace(re: Float32Array<ArrayBuffer>, im: Float32Array<ArrayBuffer>): void {
  const n = re.length
  if (n !== im.length) {
    throw new Error(`fftInPlace: 实部虚部长度不一致 (${n} vs ${im.length})`)
  }
  if (!isPowerOfTwo(n)) {
    throw new Error(`fftInPlace: 长度必须是 2 的幂，收到 ${n}`)
  }
  if (n === 1) return

  // ---- 1. 位反转置换 ----
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) {
      j ^= bit
    }
    j ^= bit
    if (i < j) {
      const tr = re[i]
      re[i] = re[j]
      re[j] = tr
      const ti = im[i]
      im[i] = im[j]
      im[j] = ti
    }
  }

  // ---- 2. 蝶形运算 ----
  for (let len = 2; len <= n; len <<= 1) {
    const angle = (-2 * Math.PI) / len
    const wRealStep = Math.cos(angle)
    const wImagStep = Math.sin(angle)
    for (let start = 0; start < n; start += len) {
      let wReal = 1
      let wImag = 0
      const half = len >> 1
      for (let k = 0; k < half; k += 1) {
        const evenIndex = start + k
        const oddIndex = evenIndex + half
        const oddRe = re[oddIndex] * wReal - im[oddIndex] * wImag
        const oddIm = re[oddIndex] * wImag + im[oddIndex] * wReal
        re[oddIndex] = re[evenIndex] - oddRe
        im[oddIndex] = im[evenIndex] - oddIm
        re[evenIndex] += oddRe
        im[evenIndex] += oddIm
        const nextWReal = wReal * wRealStep - wImag * wImagStep
        wImag = wReal * wImagStep + wImag * wRealStep
        wReal = nextWReal
      }
    }
  }
}

/**
 * 生成 Hann 窗（周期型，与 Web Audio 的 Blackman 不同但特性接近且主瓣更窄）。
 */
export function hannWindow(length: number): Float32Array<ArrayBuffer> {
  const w = alloc(length)
  if (length === 1) {
    w[0] = 1
    return w
  }
  for (let i = 0; i < length; i += 1) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / length))
  }
  return w
}

/**
 * 计算单边线性幅度谱。
 *
 * 输入长度不足 `fftSize` 时右侧补 0；超出时取**最后** `fftSize` 个样本
 * （分析总是关心最近的信号）。
 *
 * @returns 长度 fftSize/2 的幅度谱，已按窗函数相干增益归一化
 */
export function computeMagnitudeSpectrum(
  samples: ArrayLike<number>,
  fftSize: number,
): Float32Array<ArrayBuffer> {
  if (!isPowerOfTwo(fftSize)) {
    throw new Error(`computeMagnitudeSpectrum: fftSize 必须是 2 的幂，收到 ${fftSize}`)
  }
  const re = alloc(fftSize)
  const im = alloc(fftSize)
  // 局部变量命名为 hann，避免遮蔽全局 window 也避免 grep 误报（item #5 nit）
  const hann = hannWindow(fftSize)

  const offset = samples.length > fftSize ? samples.length - fftSize : 0
  const copyLength = Math.min(fftSize, samples.length)
  for (let i = 0; i < copyLength; i += 1) {
    re[i] = samples[offset + i] * hann[i]
  }

  fftInPlace(re, im)

  // Hann 窗相干增益 0.5；单边谱再乘 2 补回负频能量
  const scale = 2 / (fftSize * 0.5)
  const bins = fftSize >> 1
  const magnitude = alloc(bins)
  for (let k = 0; k < bins; k += 1) {
    magnitude[k] = Math.sqrt(re[k] * re[k] + im[k] * im[k]) * scale
  }
  return magnitude
}

/**
 * 计算单边 dB 幅度谱 —— 与 `AnalyserNode.getFloatFrequencyData` 的语义对齐
 * （即 20*log10(magnitude)，静默区截断到 MIN_DBFS）。
 */
export function computeSpectrumDb(
  samples: ArrayLike<number>,
  fftSize: number,
  floorDb: number = MIN_DBFS,
): Float32Array<ArrayBuffer> {
  const magnitude = computeMagnitudeSpectrum(samples, fftSize)
  const out = alloc(magnitude.length)
  for (let k = 0; k < magnitude.length; k += 1) {
    const m = magnitude[k]
    out[k] = m > 0 ? Math.max(floorDb, 20 * Math.log10(m)) : floorDb
  }
  return out
}
