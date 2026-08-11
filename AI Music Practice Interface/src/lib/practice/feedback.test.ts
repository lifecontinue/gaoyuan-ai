/**
 * practice/feedback 单测（T3.6）
 *
 * 硬约束：同一小节内**最多弹 1 次气泡**，取该小节起音最早的那条判定。
 * 这条规则若失效，一次扫弦（6 弦 / 60ms）会把界面刷成闪烁灯 —— 是 UI 层最容易翻车的一处。
 */

import { describe, expect, it } from "vitest"

import { FEEDBACK_TEXT, pickMeasureBubble } from "@/lib/practice/feedback"
import type { JudgementKind, TimingJudgement } from "@/lib/practice/types"

/** 造一条判定 */
function judgement(
  kind: JudgementKind,
  onsetTimeMs: number,
  overrides: Partial<TimingJudgement> = {},
): TimingJudgement {
  return {
    kind,
    offsetMs: 0,
    measureId: 17,
    onsetTimeMs,
    expectedMs: onsetTimeMs,
    beatIndex: 0,
    ...overrides,
  }
}

describe("pickMeasureBubble", () => {
  it("空数组 → null（没弹就不该弹气泡）", () => {
    expect(pickMeasureBubble([])).toBeNull()
  })

  it("单条判定 → 原样返回", () => {
    const j = judgement("perfect", 100)
    expect(pickMeasureBubble([j])).toBe(j)
  })

  it("多条判定 → 取 onsetTimeMs 最小的那条（而非数组第一条）", () => {
    const late = judgement("late", 300)
    const earliest = judgement("perfect", 120)
    const middle = judgement("good", 200)
    // 刻意把最早的放中间，防止实现退化成"永远返回 [0]"
    expect(pickMeasureBubble([late, earliest, middle])).toBe(earliest)
  })

  it("一次扫弦 6 弦（12ms 一根）只产出 1 个气泡，且是第一根弦", () => {
    const strum = Array.from({ length: 6 }, (_, i) =>
      judgement(i === 0 ? "perfect" : "good", 1000 + i * 12),
    )
    const bubble = pickMeasureBubble(strum)
    expect(bubble).not.toBeNull()
    expect(bubble!.onsetTimeMs).toBe(1000)
    expect(bubble!.kind).toBe("perfect")
  })

  it("时间相同时取先出现的那条（稳定、可复现，不依赖排序算法）", () => {
    const first = judgement("perfect", 500)
    const second = judgement("good", 500)
    expect(pickMeasureBubble([first, second])).toBe(first)
    expect(pickMeasureBubble([second, first])).toBe(second)
  })

  it("miss 判定同样能被选中（漏弹也要给反馈）", () => {
    const miss = judgement("miss", 0, { offsetMs: 0 })
    expect(pickMeasureBubble([miss])).toBe(miss)
  })

  it("纯函数：不修改入参数组", () => {
    const list = [judgement("late", 300), judgement("perfect", 100)]
    const snapshot = [...list]
    pickMeasureBubble(list)
    expect(list).toEqual(snapshot)
  })

  it("负时刻（曲首前的抢拍）也参与比较，不被当成非法值跳过", () => {
    const early = judgement("early", -20)
    const onTime = judgement("perfect", 10)
    expect(pickMeasureBubble([onTime, early])).toBe(early)
  })
})

describe("FEEDBACK_TEXT", () => {
  it("五种判定各有文案，无遗漏", () => {
    const kinds: JudgementKind[] = ["perfect", "good", "early", "late", "miss"]
    for (const k of kinds) {
      expect(FEEDBACK_TEXT[k]).toBeTruthy()
      expect(typeof FEEDBACK_TEXT[k]).toBe("string")
    }
    expect(Object.keys(FEEDBACK_TEXT).sort()).toEqual([...kinds].sort())
  })

  it("EARLY / LATE 带方向箭头（↗ 抢拍 / ↘ 拖拍），方向不得写反", () => {
    expect(FEEDBACK_TEXT.early).toContain("↗")
    expect(FEEDBACK_TEXT.late).toContain("↘")
    expect(FEEDBACK_TEXT.early).not.toContain("↘")
    expect(FEEDBACK_TEXT.late).not.toContain("↗")
  })

  it("PERFECT / GOOD / MISS 是纯文字，不带箭头", () => {
    expect(FEEDBACK_TEXT.perfect).toBe("PERFECT")
    expect(FEEDBACK_TEXT.good).toBe("GOOD")
    expect(FEEDBACK_TEXT.miss).toBe("MISS")
  })
})
