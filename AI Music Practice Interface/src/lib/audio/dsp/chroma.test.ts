/**
 * dsp/fft + dsp/chroma 单测（T1.3）
 *
 * **DoD #8 的机器验证在这里**：
 *   注入 generateChordTone([110, 130.81, 164.81, 196])（Am7 = A/C/E/G）
 *   → chroma top-4 音级恰为 {A, C, E, G}，且第 4 名能量 >= 第 5 名的 2 倍。
 *
 * 另外验证"谱峰 + 抛物线插值"确实解决了低频音级错位（见 chroma.ts 头注释）：
 * 110Hz 必须归到 A(pc=9)，而不是被 bin 量化误差带到相邻音级。
 */

import { describe, expect, it } from "vitest"

import { CHROMA_FFT_SIZE } from "@/lib/audio/constants"
import {
  computeChroma,
  computeTonalRatio,
  findSpectralPeaks,
  PITCH_CLASS_COUNT,
  rankPitchClasses,
} from "@/lib/audio/dsp/chroma"
import {
  computeMagnitudeSpectrum,
  computeSpectrumDb,
  fftInPlace,
  hannWindow,
  isPowerOfTwo,
} from "@/lib/audio/dsp/fft"
import {
  allocBuffer,
  generateChordTone,
  generateNoise,
  generatePluckedTone,
  generateSilence,
  generateSine,
} from "@/lib/audio/testing/syntheticAudio"

const SAMPLE_RATE = 48_000

/** 音级索引常量（0 = C） */
const PC = { C: 0, E: 4, G: 7, A: 9 } as const

describe("fft 基础", () => {
  it("isPowerOfTwo 正确识别 2 的幂", () => {
    expect(isPowerOfTwo(1)).toBe(true)
    expect(isPowerOfTwo(4096)).toBe(true)
    expect(isPowerOfTwo(0)).toBe(false)
    expect(isPowerOfTwo(3)).toBe(false)
    expect(isPowerOfTwo(-4)).toBe(false)
  })

  it("非 2 的幂长度直接抛错，而不是静默产出垃圾频谱", () => {
    const re = allocBuffer(3)
    const im = allocBuffer(3)
    expect(() => fftInPlace(re, im)).toThrow(/2 的幂/)
    expect(() => computeMagnitudeSpectrum(allocBuffer(100), 100)).toThrow(/2 的幂/)
  })

  it("hannWindow 端点为 0、中心为 1", () => {
    const w = hannWindow(1024)
    expect(w[0]).toBeCloseTo(0, 6)
    expect(w[512]).toBeCloseTo(1, 6)
  })

  it("单频正弦的幅度谱峰值出现在正确的 bin 且幅度还原", () => {
    const fftSize = 4096
    const binHz = SAMPLE_RATE / fftSize
    // 选一个正好落在 bin 中心的频率，避免泄漏影响幅度还原精度
    const targetBin = 40
    const freq = targetBin * binHz
    const sine = generateSine(freq, SAMPLE_RATE, fftSize, 0.5)
    const spectrum = computeMagnitudeSpectrum(sine, fftSize)

    let peakBin = 0
    for (let k = 1; k < spectrum.length; k += 1) {
      if (spectrum[k] > spectrum[peakBin]) peakBin = k
    }
    expect(peakBin).toBe(targetBin)
    // Hann 窗相干增益已在 computeMagnitudeSpectrum 内补偿，幅度应还原到 0.5
    expect(spectrum[peakBin]).toBeCloseTo(0.5, 2)
  })

  it("computeSpectrumDb 对静音输出 dB 下限，不产生 -Infinity/NaN", () => {
    const db = computeSpectrumDb(generateSilence(SAMPLE_RATE, 4096), 4096)
    for (let k = 0; k < db.length; k += 1) {
      expect(Number.isFinite(db[k])).toBe(true)
    }
  })
})

describe("findSpectralPeaks", () => {
  it("抛物线插值让低频峰的频率估计误差 < 1Hz（110Hz A2）", () => {
    const fftSize = CHROMA_FFT_SIZE
    const sine = generateSine(110, SAMPLE_RATE, fftSize, 0.5)
    const db = computeSpectrumDb(sine, fftSize)
    const peaks = findSpectralPeaks(db, SAMPLE_RATE, fftSize)

    expect(peaks.length).toBeGreaterThan(0)
    // 取最强峰
    const strongest = peaks.reduce((a, b) => (b.magnitude > a.magnitude ? b : a))
    expect(Math.abs(strongest.frequencyHz - 110)).toBeLessThan(1)
  })

  it("静音与非法参数返回空数组", () => {
    const silentDb = computeSpectrumDb(generateSilence(SAMPLE_RATE, 4096), 4096)
    expect(findSpectralPeaks(silentDb, SAMPLE_RATE, 4096)).toHaveLength(0)
    expect(findSpectralPeaks(silentDb, 0, 4096)).toHaveLength(0)
    expect(findSpectralPeaks(new Float32Array(2), SAMPLE_RATE, 4096)).toHaveLength(0)
  })
})

describe("computeChroma", () => {
  it("110Hz 纯音归到音级 A（低频不错位）", () => {
    const fftSize = CHROMA_FFT_SIZE
    const db = computeSpectrumDb(generateSine(110, SAMPLE_RATE, fftSize, 0.5), fftSize)
    const chroma = computeChroma(db, SAMPLE_RATE, fftSize)
    expect(chroma).toHaveLength(PITCH_CLASS_COUNT)
    expect(rankPitchClasses(chroma)[0]).toBe(PC.A)
    // 归一化后最大值必须是 1
    expect(Math.max(...Array.from(chroma))).toBeCloseTo(1, 6)
  })

  it("DoD #8：Am7 和弦 [110,130.81,164.81,196] 的 top-4 音级 = {A,C,E,G}", () => {
    const fftSize = CHROMA_FFT_SIZE
    const chord = generateChordTone([110, 130.81, 164.81, 196], SAMPLE_RATE, fftSize, 0.5)
    const db = computeSpectrumDb(chord, fftSize)
    const chroma = computeChroma(db, SAMPLE_RATE, fftSize)

    const ranked = rankPitchClasses(chroma)
    const top4 = new Set(ranked.slice(0, 4))
    expect(top4).toEqual(new Set([PC.A, PC.C, PC.E, PC.G]))

    // 第 4 名与第 5 名之间必须有明显断层（>= 2 倍），说明和弦内外音分得开
    const fourth = chroma[ranked[3]]
    const fifth = chroma[ranked[4]]
    expect(fourth).toBeGreaterThanOrEqual(fifth * 2)
  })

  it("静音 / 宽带噪声不产生尖锐的音级归属", () => {
    const fftSize = 4096
    const silentDb = computeSpectrumDb(generateSilence(SAMPLE_RATE, fftSize), fftSize)
    const silentChroma = computeChroma(silentDb, SAMPLE_RATE, fftSize)
    for (let i = 0; i < PITCH_CLASS_COUNT; i += 1) {
      expect(silentChroma[i]).toBe(0)
    }

    // 噪声即使过了门限也不该形成"一个音级独大"的形态
    const noiseDb = computeSpectrumDb(generateNoise(SAMPLE_RATE, fftSize, -20), fftSize)
    const noiseChroma = computeChroma(noiseDb, SAMPLE_RATE, fftSize)
    const ranked = rankPitchClasses(noiseChroma)
    expect(noiseChroma[ranked[11]] / noiseChroma[ranked[0]]).toBeGreaterThan(0.15)
  })
})

describe("computeTonalRatio", () => {
  it("全部能量落在期望音级时接近 1，完全不匹配时接近 0", () => {
    const chroma = new Float32Array(PITCH_CLASS_COUNT)
    chroma[PC.A] = 1
    chroma[PC.C] = 0.8
    chroma[PC.E] = 0.6

    expect(computeTonalRatio(chroma, [PC.A, PC.C, PC.E])).toBeCloseTo(1, 6)
    expect(computeTonalRatio(chroma, [1, 3, 6])).toBeCloseTo(0, 6)
    expect(computeTonalRatio(chroma, [PC.A])).toBeCloseTo(1 / 2.4, 4)
  })

  it("总能量为 0 时返回 0 而不是 NaN", () => {
    expect(computeTonalRatio(new Float32Array(PITCH_CLASS_COUNT), [0, 4, 7])).toBe(0)
  })
})

/**
 * ★ 跨 Phase 风险闭环（qa-p1 在 Phase 1 标出）—— **已闭环，结论：方向 1（统一 16384）**
 *
 * 原始担忧：离线 chroma 用 16384 FFT，实时路径若复用 AnalyserNode 的 4096 FFT，
 * 两条路径口径不一致，实时和弦识别可能失效。
 *
 * 实测结论（下面两条用例即为机器证据）：
 *   - 4096 @ 48kHz → 11.72Hz/bin。A2(110) 与 C3(130.81) 相距 20.8Hz ≈ 1.8 bin，
 *     小于 Hann 主瓣宽度（约 4 bin），两个基频**物理上合并**。即便换成含丰富谐波
 *     的真实拨弦激励（generatePluckedTone）也救不回来：A 的奇次谐波给 E/C 投票、
 *     E 的谐波给 B 投票，top-4 漂成 {E,G,B,C} —— C 在里面纯属巧合，A 直接掉出前四。
 *   - 16384 @ 48kHz → 2.93Hz/bin。同两音相距 7.1 bin，可分辨；同一拨弦激励下
 *     top-4 稳定收敛到 {A,C,E,G} 且第 4/5 名有断层。
 *
 * 因此实时路径**不再**用 AnalyserNode 的 4096 频谱算 chroma，改为在 AnalysisPipeline
 * 内维护 16384 的 chroma 环形缓冲（见 AnalysisPipeline.pushToChromaRing/readChromaWindow）。
 * FRAME_SIZE=4096 只服务 pitch/YIN 与 onset（这两者要低延迟、且不需要低频分辨率）。
 *
 * 下面两条用例是这个决定的**双向守卫**：
 *   1. 正向（生产口径，必须绿）：16384 + 拨弦 Am7 → top-4 = {A,C,E,G} 且有断层。
 *   2. 边界（硬约束，防回退）：4096 + 同一激励 → top-4 显式 ≠ {A,C,E,G}。
 *      若哪天有人把实时 chroma 改回 4096 并"看起来能跑"，这条会立刻转红。
 */
describe("chroma FFT 口径守卫（跨 Phase 风险闭环 / 方向 1）", () => {
  /** 实时帧长度（= AnalyserNode.fftSize = FRAME_SIZE）—— 只服务 pitch/onset，不再算 chroma */
  const REAL_TIME_FFT = 4096

  /** Am7 = A2/C3/E3/G3 的基频 */
  const AM7_HZ = [110, 130.81, 164.81, 196] as const

  /** Am7 的期望音级集合 */
  const AM7_PCS = new Set<number>([PC.A, PC.C, PC.E, PC.G])

  /** 用 generatePluckedTone（谐波 + 衰减包络）叠加出"真实拨弦和弦" */
  function buildPluckedChord(
    freqsHz: readonly number[],
    lengthSamples: number,
  ): Float32Array<ArrayBuffer> {
    const out = allocBuffer(lengthSamples)
    const per = 0.5 / Math.sqrt(freqsHz.length)
    for (const f of freqsHz) {
      const tone = generatePluckedTone(f, SAMPLE_RATE, lengthSamples, { amplitude: per })
      for (let i = 0; i < lengthSamples; i += 1) out[i] += tone[i]
    }
    return out
  }

  /** 跑一遍 chroma 并返回排序后的音级 */
  function chromaOf(chord: Float32Array<ArrayBuffer>, fftSize: number) {
    const db = computeSpectrumDb(chord, fftSize)
    const chroma = computeChroma(db, SAMPLE_RATE, fftSize)
    return { chroma, ranked: rankPitchClasses(chroma) }
  }

  it("★生产口径：16384 + 带谐波的拨弦 Am7 → top-4 = {A,C,E,G} 且第 4/5 名断层 >= 2 倍", () => {
    const chord = buildPluckedChord(AM7_HZ, CHROMA_FFT_SIZE)
    const { chroma, ranked } = chromaOf(chord, CHROMA_FFT_SIZE)

    expect(new Set(ranked.slice(0, 4))).toEqual(AM7_PCS)

    // 和弦内音与外音之间必须分得开，否则 ChordRecognizer 的 confidence 会失真
    expect(chroma[ranked[3]]).toBeGreaterThanOrEqual(chroma[ranked[4]] * 2)
  })

  it("★边界守卫：4096 + 同一拨弦激励 → top-4 ≠ {A,C,E,G}（禁止把实时 chroma 改回 4096）", () => {
    const chord = buildPluckedChord(AM7_HZ, REAL_TIME_FFT)
    const { ranked } = chromaOf(chord, REAL_TIME_FFT)

    // 这不是"允许失败"，而是**断言它一定失败** —— 4096 分辨率下低频基频合并是物理事实。
    // 若这条转红，说明有人改了 chroma 算法或 FFT 口径，必须重新评估实时路径。
    expect(new Set(ranked.slice(0, 4))).not.toEqual(AM7_PCS)

    // 更精确地钉住失败形态：A（和弦根音）在 4096 下会掉出 top-4
    expect(ranked.slice(0, 4)).not.toContain(PC.A)
  })

  it("同一激励下 16384 的音级分辨力严格优于 4096（分辨率单调性）", () => {
    const hi = chromaOf(buildPluckedChord(AM7_HZ, CHROMA_FFT_SIZE), CHROMA_FFT_SIZE)
    const lo = chromaOf(buildPluckedChord(AM7_HZ, REAL_TIME_FFT), REAL_TIME_FFT)

    /** 落在 Am7 四个音级上的能量占比 */
    const tonalShare = (chroma: Float32Array<ArrayBuffer>): number => {
      let total = 0
      let inChord = 0
      for (let pc = 0; pc < PITCH_CLASS_COUNT; pc += 1) {
        total += chroma[pc]
        if (AM7_PCS.has(pc)) inChord += chroma[pc]
      }
      return total > 0 ? inChord / total : 0
    }

    expect(tonalShare(hi.chroma)).toBeGreaterThan(tonalShare(lo.chroma))
  })
})
