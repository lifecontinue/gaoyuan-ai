/**
 * dsp/rms 单测（T1.3）
 *
 * 覆盖点：rms 数值正确性、dBFS 换算与下限截断、噪声门限边界。
 * 噪声门限是 DoD #6/#7 的第一道闸门，边界必须逐个钉死。
 */

import { describe, expect, it } from "vitest"

import {
  MIN_DBFS,
  NOISE_GATE_DBFS,
  NOISE_GATE_RMS,
} from "@/lib/audio/constants"
import {
  computePeak,
  computeRms,
  dbfsToLevelRatio,
  dbfsToRms,
  isAboveGate,
  rmsToDbfs,
} from "@/lib/audio/dsp/rms"
import {
  generateNoise,
  generateSilence,
  generateSine,
} from "@/lib/audio/testing/syntheticAudio"

const SAMPLE_RATE = 48_000

describe("computeRms", () => {
  it("空数组返回 0，静音返回 0", () => {
    expect(computeRms(new Float32Array(0))).toBe(0)
    expect(computeRms(generateSilence(SAMPLE_RATE, 4096))).toBe(0)
  })

  it("正弦波的 rms = 幅度 / sqrt(2)", () => {
    // 取整数个周期（480 samples = 100Hz @ 48k 的 1 个周期）避免截断误差
    const sine = generateSine(100, SAMPLE_RATE, 4800, 0.8)
    const expected = 0.8 / Math.SQRT2
    expect(computeRms(sine)).toBeCloseTo(expected, 4)
  })

  it("generateNoise 生成的信号 rms 精确等于目标 dBFS", () => {
    const noise = generateNoise(SAMPLE_RATE, 48_000, -70)
    expect(rmsToDbfs(computeRms(noise))).toBeCloseTo(-70, 5)
  })
})

describe("computePeak", () => {
  it("返回绝对值最大的样本", () => {
    const sine = generateSine(100, SAMPLE_RATE, 4800, 0.8)
    expect(computePeak(sine)).toBeCloseTo(0.8, 3)
    expect(computePeak(generateSilence(SAMPLE_RATE, 128))).toBe(0)
  })
})

describe("rmsToDbfs / dbfsToRms", () => {
  it("满刻度 1.0 → 0 dBFS，0.5 → -6.02 dBFS", () => {
    expect(rmsToDbfs(1)).toBeCloseTo(0, 6)
    expect(rmsToDbfs(0.5)).toBeCloseTo(-6.0206, 3)
  })

  it("rms 为 0 或负数时截断到 MIN_DBFS，而不是 -Infinity", () => {
    expect(rmsToDbfs(0)).toBe(MIN_DBFS)
    expect(rmsToDbfs(-1)).toBe(MIN_DBFS)
    expect(Number.isFinite(rmsToDbfs(0))).toBe(true)
  })

  it("极小值也被截断到 MIN_DBFS", () => {
    expect(rmsToDbfs(1e-12)).toBe(MIN_DBFS)
  })

  it("dbfsToRms 是 rmsToDbfs 的逆运算", () => {
    for (const db of [-60, -50, -20, -6, 0]) {
      expect(rmsToDbfs(dbfsToRms(db))).toBeCloseTo(db, 6)
    }
  })
})

describe("isAboveGate", () => {
  it("默认门限常量自洽：NOISE_GATE_RMS === 10^(-50/20)", () => {
    expect(NOISE_GATE_RMS).toBeCloseTo(Math.pow(10, NOISE_GATE_DBFS / 20), 12)
    expect(NOISE_GATE_RMS).toBeCloseTo(0.0031623, 6)
  })

  it("恰好等于门限时判定为通过（>= 语义）", () => {
    expect(isAboveGate(NOISE_GATE_RMS)).toBe(true)
  })

  it("略低于门限时判定为不通过", () => {
    expect(isAboveGate(NOISE_GATE_RMS * 0.999)).toBe(false)
    expect(isAboveGate(0)).toBe(false)
  })

  it("-70dBFS 噪声不过门限，-30dBFS 信号过门限", () => {
    expect(isAboveGate(dbfsToRms(-70))).toBe(false)
    expect(isAboveGate(dbfsToRms(-30))).toBe(true)
  })

  it("支持自定义门限", () => {
    const rms = dbfsToRms(-70)
    expect(isAboveGate(rms, -80)).toBe(true)
    expect(isAboveGate(rms, -60)).toBe(false)
  })
})

describe("dbfsToLevelRatio", () => {
  it("量程内线性映射，量程外钳位到 [0,1]", () => {
    expect(dbfsToLevelRatio(-60, -60, 0)).toBe(0)
    expect(dbfsToLevelRatio(0, -60, 0)).toBe(1)
    expect(dbfsToLevelRatio(-30, -60, 0)).toBeCloseTo(0.5, 6)
    expect(dbfsToLevelRatio(-100, -60, 0)).toBe(0)
    expect(dbfsToLevelRatio(10, -60, 0)).toBe(1)
  })

  it("非法量程返回 0 而不是 NaN", () => {
    expect(dbfsToLevelRatio(-30, 0, 0)).toBe(0)
    expect(dbfsToLevelRatio(-30, 0, -60)).toBe(0)
  })
})
