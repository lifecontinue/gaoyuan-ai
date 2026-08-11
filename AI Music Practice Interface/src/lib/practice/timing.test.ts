/**
 * practice/timing 单测（T3.2）
 *
 * 判定窗口的边界是产品语义的核心。这里**逐个边界点**验证（40 / 41 / 90 / 91 / 160 / 161），
 * 而不是随手挑几个中间值 —— 边界写成 `<` 还是 `<=` 是最常见也最难发现的一类偏差。
 *
 * 同时钉死 §1.2 的符号约定：offsetMs = expectedMs - actualMs，正数 = 抢拍。
 */

import { describe, expect, it } from "vitest"

import {
  TIMING_GOOD_MS,
  TIMING_PERFECT_MS,
  TIMING_WINDOW_MS,
} from "@/lib/audio/constants"
import { classifyOffset, nearestBeatMs, timingOffsetMs } from "@/lib/practice/timing"

describe("timingOffsetMs：符号约定（§1.2 唯一真源）", () => {
  it("抢拍（实际早于期望）→ 正数", () => {
    // 期望在 1000ms，玩家 950ms 就弹了 → 早了 50ms
    expect(timingOffsetMs(1000, 950)).toBe(50)
  })

  it("拖拍（实际晚于期望）→ 负数", () => {
    expect(timingOffsetMs(1000, 1080)).toBe(-80)
  })

  it("完全准时 → 0", () => {
    expect(timingOffsetMs(1000, 1000)).toBe(0)
  })

  it("🚨 变异守卫：若实现写反成 actual - expected，本组期望值会整体变号", () => {
    // 显式钉死"抢拍为正"这一条 —— UI 的 ↗/↘ 箭头与 EARLY/LATE 文案全部依赖它
    expect(Math.sign(timingOffsetMs(1000, 900))).toBe(1)
    expect(Math.sign(timingOffsetMs(1000, 1100))).toBe(-1)
  })
})

describe("classifyOffset：窗口边界逐点验证", () => {
  it("|Δ| ≤ 40 → perfect（含边界 40）", () => {
    expect(classifyOffset(0)).toBe("perfect")
    expect(classifyOffset(39)).toBe("perfect")
    expect(classifyOffset(TIMING_PERFECT_MS)).toBe("perfect")
    expect(classifyOffset(-TIMING_PERFECT_MS)).toBe("perfect")
  })

  it("40 < |Δ| ≤ 90 → good（含边界 90）", () => {
    expect(classifyOffset(TIMING_PERFECT_MS + 1)).toBe("good")
    expect(classifyOffset(-(TIMING_PERFECT_MS + 1))).toBe("good")
    expect(classifyOffset(TIMING_GOOD_MS)).toBe("good")
    expect(classifyOffset(-TIMING_GOOD_MS)).toBe("good")
  })

  it("90 < Δ ≤ 160 → early（正数 = 抢拍）", () => {
    expect(classifyOffset(TIMING_GOOD_MS + 1)).toBe("early")
    expect(classifyOffset(120)).toBe("early")
    expect(classifyOffset(TIMING_WINDOW_MS)).toBe("early")
  })

  it("-160 ≤ Δ < -90 → late（负数 = 拖拍）", () => {
    expect(classifyOffset(-(TIMING_GOOD_MS + 1))).toBe("late")
    expect(classifyOffset(-120)).toBe("late")
    expect(classifyOffset(-TIMING_WINDOW_MS)).toBe("late")
  })

  it("超出 ±160 → null（视为噪声，绝不计入统计）", () => {
    expect(classifyOffset(TIMING_WINDOW_MS + 1)).toBeNull()
    expect(classifyOffset(-(TIMING_WINDOW_MS + 1))).toBeNull()
    expect(classifyOffset(5000)).toBeNull()
    expect(classifyOffset(-5000)).toBeNull()
  })

  it("非有限值 → null（NaN/Infinity 不得穿透成一次判定）", () => {
    expect(classifyOffset(Number.NaN)).toBeNull()
    expect(classifyOffset(Number.POSITIVE_INFINITY)).toBeNull()
    expect(classifyOffset(Number.NEGATIVE_INFINITY)).toBeNull()
  })

  it("对称性：|Δ| 相同的正负值，除 early/late 外分类一致", () => {
    for (const abs of [0, 10, 40, 41, 70, 90]) {
      expect(classifyOffset(abs)).toBe(classifyOffset(-abs))
    }
    // early/late 是唯一按符号分叉的一档
    expect(classifyOffset(120)).not.toBe(classifyOffset(-120))
  })
})

describe("nearestBeatMs：拍格对齐", () => {
  /** bpm=92 → 652.1739ms/拍（qa-p1 锁定的权威锚值） */
  const BEAT = 60000 / 92

  it("恰好落在拍点上 → 返回该拍点", () => {
    expect(nearestBeatMs(0, BEAT)).toBeCloseTo(0, 6)
    expect(nearestBeatMs(BEAT, BEAT)).toBeCloseTo(BEAT, 6)
    expect(nearestBeatMs(BEAT * 4, BEAT)).toBeCloseTo(BEAT * 4, 6)
  })

  it("略早 / 略晚都吸附到同一个最近拍点", () => {
    expect(nearestBeatMs(BEAT * 3 - 30, BEAT)).toBeCloseTo(BEAT * 3, 6)
    expect(nearestBeatMs(BEAT * 3 + 30, BEAT)).toBeCloseTo(BEAT * 3, 6)
  })

  it("落在两拍正中间时按 Math.round 向上吸附（行为确定，不留歧义）", () => {
    expect(nearestBeatMs(BEAT * 0.5, BEAT)).toBeCloseTo(BEAT, 6)
  })

  it("负时刻夹到 0，不产生负拍点", () => {
    expect(nearestBeatMs(-500, BEAT)).toBe(0)
    expect(nearestBeatMs(-1, BEAT)).toBe(0)
  })

  it("beatDurMs 非法（0 / 负 / Infinity）时原样返回，不产生 NaN", () => {
    expect(nearestBeatMs(1234, 0)).toBe(1234)
    expect(nearestBeatMs(1234, -10)).toBe(1234)
    expect(nearestBeatMs(1234, Number.POSITIVE_INFINITY)).toBe(1234)
  })

  it("与 classifyOffset 串起来：拍格上 ±30ms 的演奏一律 perfect", () => {
    for (let k = 0; k < 16; k += 1) {
      const expectedMs = k * BEAT
      for (const jitter of [-30, -10, 0, 10, 30]) {
        const actual = expectedMs + jitter
        const beat = nearestBeatMs(actual, BEAT)
        expect(classifyOffset(timingOffsetMs(beat, actual))).toBe("perfect")
      }
    }
  })
})
