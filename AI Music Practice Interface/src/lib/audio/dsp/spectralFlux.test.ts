/**
 * dsp/spectralFlux 单测（T3.1）
 *
 * 三个纯函数是整条 onset 链路的地基，任何一处符号写反都会让 onset 检测
 * "看起来能跑但全是噪声"。因此这里穷举它们的定义性质，而不是只测 happy path。
 */

import { describe, expect, it } from "vitest"

import { dbToMagnitude, median, spectralFlux } from "@/lib/audio/dsp/spectralFlux"

/** 便捷构造 Float32Array<ArrayBuffer> */
function f32(values: readonly number[]): Float32Array<ArrayBuffer> {
  const out = new Float32Array(new ArrayBuffer(values.length * 4))
  out.set(values)
  return out
}

describe("dbToMagnitude", () => {
  it("0dB → 1，-20dB → 0.1，-40dB → 0.01", () => {
    // 注意：dbToMagnitude 返回 Float32Array，0.1 在 float32 下存为 0.10000000149011612，
    // 因此精度只断言到 6 位（容差 5e-7），而不是 9 位（5e-10）。
    const mag = dbToMagnitude(f32([0, -20, -40]))
    expect(mag[0]).toBeCloseTo(1, 9)
    expect(mag[1]).toBeCloseTo(0.1, 6)
    expect(mag[2]).toBeCloseTo(0.01, 6)
  })

  it("-100dB（dB 下限）映射为极小正数，不是 0 也不是 NaN", () => {
    const mag = dbToMagnitude(f32([-100]))
    expect(mag[0]).toBeGreaterThan(0)
    expect(Number.isFinite(mag[0])).toBe(true)
    expect(mag[0]).toBeLessThan(1e-4)
  })

  it("长度与输入一致；空输入返回空数组", () => {
    expect(dbToMagnitude(f32([-1, -2, -3]))).toHaveLength(3)
    expect(dbToMagnitude(f32([]))).toHaveLength(0)
  })

  it("单调性：dB 越大幅度越大", () => {
    const mag = dbToMagnitude(f32([-60, -30, -10, 0]))
    for (let i = 1; i < mag.length; i += 1) {
      expect(mag[i]).toBeGreaterThan(mag[i - 1])
    }
  })
})

describe("spectralFlux", () => {
  it("只累加正增量：能量下降的 bin 不计入（衰减段不该被当成 onset）", () => {
    const prev = f32([1, 1, 1, 1])
    const next = f32([2, 0, 3, 0]) // +1, -1, +2, -1
    // 若实现误写成 Σ(mag - prevMag)，结果会是 1；正确答案是 3
    expect(spectralFlux(prev, next)).toBeCloseTo(3, 9)
  })

  it("完全相同的两帧 → flux === 0（稳态不产生 onset）", () => {
    const frame = f32([0.3, 0.7, 0.1, 0.9])
    expect(spectralFlux(frame, frame)).toBe(0)
  })

  it("整体衰减（每个 bin 都变小）→ flux === 0", () => {
    expect(spectralFlux(f32([1, 2, 3]), f32([0.5, 1, 1.5]))).toBe(0)
  })

  it("整体骤升 → flux 等于总增量", () => {
    expect(spectralFlux(f32([0, 0, 0]), f32([1, 2, 3]))).toBeCloseTo(6, 9)
  })

  it("非对称：flux(a,b) 与 flux(b,a) 不同（方向性是本函数的核心语义）", () => {
    const a = f32([1, 0])
    const b = f32([0, 1])
    expect(spectralFlux(a, b)).toBeCloseTo(1, 9)
    expect(spectralFlux(b, a)).toBeCloseTo(1, 9)
    // 用不对称的一对再验一次，避免上面的对称样本造成假象
    expect(spectralFlux(f32([0, 0]), f32([1, 1]))).toBeCloseTo(2, 9)
    expect(spectralFlux(f32([1, 1]), f32([0, 0]))).toBe(0)
  })

  it("长度不一致时按较短者截断，不越界不 NaN", () => {
    expect(spectralFlux(f32([0, 0, 0, 0]), f32([1, 1]))).toBeCloseTo(2, 9)
    expect(spectralFlux(f32([0, 0]), f32([1, 1, 1, 1]))).toBeCloseTo(2, 9)
    expect(spectralFlux(f32([]), f32([1, 2]))).toBe(0)
  })
})

describe("median", () => {
  it("奇数长度取中间值", () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([5])).toBe(5)
  })

  it("偶数长度取中间两数均值", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5)
    expect(median([4, 1])).toBe(2.5)
  })

  it("空数组返回 0（而不是 NaN —— 否则自适应阈值第一帧就污染整条链）", () => {
    expect(median([])).toBe(0)
  })

  it("抗离群值：单个巨大尖峰不拉高中位数（这正是不用均值的原因）", () => {
    const base = [1, 1, 1, 1, 1]
    const withSpike = [1, 1, 1, 1, 1000]
    expect(median(base)).toBe(1)
    expect(median(withSpike)).toBe(1)
  })

  it("不改变入参数组的顺序（纯函数）", () => {
    const input = [3, 1, 2]
    median(input)
    expect(input).toEqual([3, 1, 2])
  })
})
