/**
 * practice/metrics 单测（T3.5）
 *
 * **DoD #7 / #8 的机器验证在这里。**
 *   #7：给定固定的 20 条 Δ fixture，rhythmStability 必须等于手算值（可复现、不漂移）
 *   #8：全 perfect → 100；完全无输入 → 0（不得出现 NaN / undefined 泄漏到 UI）
 *
 * 全部为纯函数，无时钟、无音频依赖。
 */

import { describe, expect, it } from "vitest"

import { clamp, computeMetrics, mean, stdev, timingScore } from "@/lib/practice/metrics"
import type { MeasureStats, SessionAnalytics } from "@/lib/practice/types"

/** 造一个 MeasureStats，未指定的字段取"完美"默认值 */
function measure(overrides: Partial<MeasureStats> & { measureId: number }): MeasureStats {
  return {
    onsetCount: 4,
    offsets: [0, 0, 0, 0],
    chordConfidence: 1,
    pitchAccuracy: 100,
    rhythmStability: 100,
    missed: false,
    hasActivity: true,
    ...overrides,
  }
}

/** 造一个 SessionAnalytics */
function analytics(
  measures: MeasureStats[],
  timingOffsets: number[],
): SessionAnalytics {
  return {
    measures,
    timingOffsets,
    practicedMeasures: measures.filter((m) => m.hasActivity).map((m) => m.measureId),
  }
}

describe("clamp / mean / stdev", () => {
  it("clamp 夹在闭区间内", () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-1, 0, 10)).toBe(0)
    expect(clamp(11, 0, 10)).toBe(10)
    expect(clamp(0, 0, 10)).toBe(0)
    expect(clamp(10, 0, 10)).toBe(10)
  })

  it("mean 空数组返回 0（不是 NaN）", () => {
    expect(mean([])).toBe(0)
    expect(mean([2, 4, 6])).toBe(4)
    expect(mean([-1, 1])).toBe(0)
  })

  it("stdev 空数组返回 0，常量数组返回 0", () => {
    expect(stdev([])).toBe(0)
    expect(stdev([7, 7, 7, 7])).toBe(0)
    // 总体标准差（除以 N）：[0,2] → mean 1，方差 1 → 1
    expect(stdev([0, 2])).toBeCloseTo(1, 9)
    // [2,4,4,4,5,5,7,9] 的总体标准差 = 2
    expect(stdev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2, 9)
  })
})

describe("timingScore：§1.7 ② 线性公式", () => {
  it("|Δ| ≤ 40 一律 100 分（perfect 平台区）", () => {
    expect(timingScore(0)).toBe(100)
    expect(timingScore(40)).toBe(100)
    expect(timingScore(-40)).toBe(100)
    expect(timingScore(20)).toBe(100)
  })

  it("|Δ| = 160 归零，超出仍为 0（不出现负分）", () => {
    expect(timingScore(160)).toBeCloseTo(0, 9)
    expect(timingScore(-160)).toBeCloseTo(0, 9)
    expect(timingScore(500)).toBe(0)
    expect(timingScore(-500)).toBe(0)
  })

  it("中间点线性：|Δ|=100 → 50 分，|Δ|=70 → 75 分", () => {
    // 100 - (100-40)*(100/120) = 100 - 50 = 50
    expect(timingScore(100)).toBeCloseTo(50, 9)
    expect(timingScore(-100)).toBeCloseTo(50, 9)
    // 100 - (70-40)*(100/120) = 100 - 25 = 75
    expect(timingScore(70)).toBeCloseTo(75, 9)
  })

  it("对称：正负偏差同分（EARLY 与 LATE 惩罚一致）", () => {
    for (const d of [10, 45, 90, 120, 155]) {
      expect(timingScore(d)).toBeCloseTo(timingScore(-d), 9)
    }
  })

  it("单调不增：|Δ| 越大分越低（或持平）", () => {
    let prev = timingScore(0)
    for (let d = 5; d <= 200; d += 5) {
      const cur = timingScore(d)
      expect(cur).toBeLessThanOrEqual(prev + 1e-9)
      prev = cur
    }
  })
})

describe("DoD #7：固定 20 条 Δ fixture → rhythmStability 等于手算值", () => {
  /**
   * 20 条固定偏差（ms）。刻意覆盖四档：
   *   perfect(|Δ|≤40)  ×10 → 各 100 分
   *   good(≤90)        ×6
   *   early/late(≤160) ×4
   */
  const DELTAS: readonly number[] = [
    0, 5, -5, 12, -12, 20, -20, 33, -33, 40, // 10 条 perfect → 100 分
    55, -55, 70, -70, 88, -88, //               6 条 good
    100, -100, 148, -148, //                    4 条 early/late
  ]

  /** 手算期望值（与实现完全独立地写一遍公式，避免"用实现验证实现"） */
  const EXPECTED_SCORES: readonly number[] = [
    100, 100, 100, 100, 100, 100, 100, 100, 100, 100,
    100 - 15 * (100 / 120), // |55| → 87.5
    100 - 15 * (100 / 120),
    100 - 30 * (100 / 120), // |70| → 75
    100 - 30 * (100 / 120),
    100 - 48 * (100 / 120), // |88| → 60
    100 - 48 * (100 / 120),
    100 - 60 * (100 / 120), // |100| → 50
    100 - 60 * (100 / 120),
    100 - 108 * (100 / 120), // |148| → 10
    100 - 108 * (100 / 120),
  ]

  it("每一条 Δ 的 timingScore 都等于手算值", () => {
    expect(DELTAS).toHaveLength(20)
    DELTAS.forEach((d, i) => {
      expect(timingScore(d)).toBeCloseTo(EXPECTED_SCORES[i], 9)
    })
  })

  it("rhythmStability = mean(timingScore) = 78.25（钉死的锚值）", () => {
    const handComputed =
      EXPECTED_SCORES.reduce((s, v) => s + v, 0) / EXPECTED_SCORES.length
    // 10*100 + 2*87.5 + 2*75 + 2*60 + 2*50 + 2*10 = 1000 + 175 + 150 + 120 + 100 + 20 = 1565
    // 1565 / 20 = 78.25
    expect(handComputed).toBeCloseTo(78.25, 9)

    const m = computeMetrics(analytics([measure({ measureId: 1 })], [...DELTAS]))
    expect(m.rhythmStability).toBeCloseTo(78.25, 9)
  })
})

describe("DoD #8：极端输入的边界行为", () => {
  it("全部 perfect（Δ 全 0）→ 四项与总评全部 100", () => {
    const measures = [1, 2, 3, 4].map((id) => measure({ measureId: id }))
    const m = computeMetrics(analytics(measures, Array<number>(16).fill(0)))

    expect(m.rhythmStability).toBe(100)
    expect(m.pitchAccuracy).toBe(100)
    expect(m.chordClarity).toBe(100)
    expect(m.consistency).toBe(100) // stdev = 0 → 100 - 0 = 100
    expect(m.overallScore).toBe(100)
  })

  it("完全无输入（无小节、无 onset）→ 四项与总评全部 0，且无 NaN", () => {
    const m = computeMetrics({ measures: [], timingOffsets: [], practicedMeasures: [] })

    expect(m.rhythmStability).toBe(0)
    expect(m.pitchAccuracy).toBe(0)
    expect(m.chordClarity).toBe(0)
    expect(m.consistency).toBe(0)
    expect(m.overallScore).toBe(0)
    for (const v of Object.values(m)) expect(Number.isFinite(v)).toBe(true)
  })

  it("有小节但全部无活动（只挂空谱，没弹）→ 全 0，不被空数组均值污染", () => {
    const measures = [1, 2].map((id) =>
      measure({
        measureId: id,
        hasActivity: false,
        missed: true,
        onsetCount: 0,
        offsets: [],
        chordConfidence: 0,
        pitchAccuracy: 0,
        rhythmStability: 0,
      }),
    )
    const m = computeMetrics(analytics(measures, []))

    expect(m.pitchAccuracy).toBe(0)
    expect(m.rhythmStability).toBe(0)
    expect(m.chordClarity).toBe(0)
    expect(m.consistency).toBe(0)
    expect(m.overallScore).toBe(0)
  })

  it("无活动的小节被排除在 pitch/chord/consistency 之外（只有 1 个小节真的弹了）", () => {
    const played = measure({ measureId: 1, pitchAccuracy: 80, chordConfidence: 0.9 })
    const skipped = measure({
      measureId: 2,
      hasActivity: false,
      pitchAccuracy: 0,
      chordConfidence: 0,
      rhythmStability: 0,
    })
    const m = computeMetrics(analytics([played, skipped], [0, 0, 0, 0]))

    // 只算 played 这一条，不被 skipped 的 0 拉低
    expect(m.pitchAccuracy).toBeCloseTo(80, 9)
    expect(m.chordClarity).toBeCloseTo(90, 9)
    // 单个有效小节 → stdev = 0 → consistency = 100
    expect(m.consistency).toBe(100)
  })
})

describe("computeMetrics：各维度的独立性与加权", () => {
  it("chordClarity = mean(有效小节 chordConfidence) × 100", () => {
    const measures = [
      measure({ measureId: 1, chordConfidence: 0.9 }),
      measure({ measureId: 2, chordConfidence: 0.7 }),
      measure({ measureId: 3, chordConfidence: 0.5 }),
    ]
    const m = computeMetrics(analytics(measures, [0]))
    expect(m.chordClarity).toBeCloseTo(70, 9)
  })

  it("consistency = clamp(100 - stdev(perMeasure)×2, 0, 100)，perMeasure = 0.5·pitch + 0.5·rhythm", () => {
    const measures = [
      measure({ measureId: 1, pitchAccuracy: 100, rhythmStability: 100 }), // 100
      measure({ measureId: 2, pitchAccuracy: 60, rhythmStability: 60 }), //   60
    ]
    // perMeasure = [100, 60] → mean 80 → stdev 20 → 100 - 40 = 60
    const m = computeMetrics(analytics(measures, [0]))
    expect(m.consistency).toBeCloseTo(60, 9)
  })

  it("波动极大时 consistency 被夹到 0，不会变成负分", () => {
    const measures = [
      measure({ measureId: 1, pitchAccuracy: 100, rhythmStability: 100 }),
      measure({ measureId: 2, pitchAccuracy: 0, rhythmStability: 0 }),
    ]
    // perMeasure = [100, 0] → stdev 50 → 100 - 100 = 0
    const m = computeMetrics(analytics(measures, [0]))
    expect(m.consistency).toBe(0)
  })

  it("overallScore 按 0.35/0.30/0.20/0.15 加权并四舍五入", () => {
    const measures = [
      measure({ measureId: 1, pitchAccuracy: 80, rhythmStability: 60, chordConfidence: 0.5 }),
      measure({ measureId: 2, pitchAccuracy: 80, rhythmStability: 60, chordConfidence: 0.5 }),
    ]
    // timingOffsets 全 0 → rhythmStability(全局) = 100（注意：与 measure 内的 60 是两个口径）
    const m = computeMetrics(analytics(measures, [0, 0]))

    expect(m.pitchAccuracy).toBeCloseTo(80, 9)
    expect(m.rhythmStability).toBeCloseTo(100, 9)
    expect(m.chordClarity).toBeCloseTo(50, 9)
    // perMeasure = [70, 70] → stdev 0 → consistency 100
    expect(m.consistency).toBe(100)

    const expected = Math.round(0.35 * 80 + 0.3 * 100 + 0.2 * 50 + 0.15 * 100)
    expect(m.overallScore).toBe(expected)
    expect(m.overallScore).toBe(83) // 28 + 30 + 10 + 15
  })

  it("总评永远是整数且落在 0-100", () => {
    const cases: SessionAnalytics[] = [
      analytics([measure({ measureId: 1 })], [0]),
      analytics([measure({ measureId: 1, pitchAccuracy: 33.333 })], [77, -123]),
      { measures: [], timingOffsets: [], practicedMeasures: [] },
    ]
    for (const a of cases) {
      const m = computeMetrics(a)
      expect(Number.isInteger(m.overallScore)).toBe(true)
      expect(m.overallScore).toBeGreaterThanOrEqual(0)
      expect(m.overallScore).toBeLessThanOrEqual(100)
    }
  })
})
