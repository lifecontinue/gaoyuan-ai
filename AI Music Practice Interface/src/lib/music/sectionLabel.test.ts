/**
 * sectionLabel + progressRatio 单测
 *
 * 覆盖 Phase 2 顶部栏那两处**曾经是硬编码**的显示逻辑：
 *   - `PRACTICE SESSION · VERSE 2 · BARS 17—28` 原本写死在 TopBar.tsx；
 *   - 进度条原本是 CSS 里的 `width:51%`。
 * 两者现在都由数据算出来，这里把它们的退化输入（空乐段 / totalMs=0 / 超界）钉死。
 */

import { describe, expect, it } from "vitest"

import { progressRatio } from "@/lib/audio/ScoreFollower"
import { EMPTY_BAR_RANGE, buildEyebrow, resolveSection, sectionBarRange } from "@/lib/music/sectionLabel"
import { SLOW_DANCING_SCORE } from "@/lib/music/scores/slowDancing"
import type { Measure, Score, Section } from "@/lib/music/types"

const SCORE = SLOW_DANCING_SCORE

/** 造一个只有编号有意义的小节（和弦内容与本文件的断言无关） */
function bar(id: number): Measure {
  return { ...SCORE.sections[0].measures[0], id }
}

function section(id: string, name: string, ids: number[]): Section {
  return { id, name, measures: ids.map(bar) }
}

function scoreWith(sections: Section[]): Score {
  return { ...SCORE, sections }
}

describe("sectionBarRange", () => {
  it("多小节乐段给出闭区间：命中示例谱的 BARS 17—28", () => {
    expect(sectionBarRange(SCORE.sections[0])).toBe("BARS 17—28")
  })

  it("单小节乐段用单数形式，不写成 17—17", () => {
    expect(sectionBarRange(section("solo", "Solo", [17]))).toBe("BAR 17")
  })

  it("空乐段与 null / undefined 一律回落到占位符，绝不产出 undefined 文本", () => {
    expect(sectionBarRange(section("empty", "Empty", []))).toBe(EMPTY_BAR_RANGE)
    expect(sectionBarRange(null)).toBe(EMPTY_BAR_RANGE)
    expect(sectionBarRange(undefined)).toBe(EMPTY_BAR_RANGE)
    expect(sectionBarRange(null)).not.toContain("undefined")
  })

  it("小节编号不连续时取首尾，不假设等差", () => {
    expect(sectionBarRange(section("odd", "Odd", [17, 21, 40]))).toBe("BARS 17—40")
  })
})

describe("resolveSection", () => {
  it("命中 sectionId 时返回该乐段", () => {
    const score = scoreWith([section("a", "Intro", [1]), section("b", "Chorus", [2])])
    expect(resolveSection(score, "b")?.name).toBe("Chorus")
  })

  it("sectionId 为 null（尚未开播）时退回首个乐段", () => {
    expect(resolveSection(SCORE, null)?.id).toBe("verse-2")
  })

  it("sectionId 指向不存在的乐段时退回首个乐段，而不是返回 null", () => {
    expect(resolveSection(SCORE, "ghost-section")?.id).toBe("verse-2")
  })

  it("完全没有乐段的曲谱返回 null，不抛", () => {
    expect(resolveSection(scoreWith([]), null)).toBeNull()
  })
})

describe("buildEyebrow", () => {
  it("重现设计稿文案，但数据来自曲谱而非硬编码", () => {
    expect(buildEyebrow(SCORE, "verse-2")).toBe("PRACTICE SESSION · VERSE 2 · BARS 17—28")
  })

  it("跟随切到别的乐段时文案随之变化", () => {
    const score = scoreWith([
      section("verse-2", "Verse 2", [17, 18]),
      section("chorus-1", "Chorus 1", [19, 20, 21]),
    ])
    expect(buildEyebrow(score, "chorus-1")).toBe("PRACTICE SESSION · CHORUS 1 · BARS 19—21")
  })

  it("空曲谱不崩溃且不出现 undefined", () => {
    const text = buildEyebrow(scoreWith([]), null)
    expect(text).toBe(`PRACTICE SESSION · NO SECTION · ${EMPTY_BAR_RANGE}`)
    expect(text).not.toContain("undefined")
  })
})

describe("progressRatio", () => {
  it("常规比例", () => {
    expect(progressRatio(0, 1000)).toBe(0)
    expect(progressRatio(250, 1000)).toBeCloseTo(0.25, 12)
    expect(progressRatio(1000, 1000)).toBe(1)
  })

  it("超过总长夹到 1 —— 改速那一帧 elapsedMs 会瞬时越界", () => {
    expect(progressRatio(999_999, 1000)).toBe(1)
  })

  it("totalMs 为 0 / 负数（曲谱未加载）返回 0，绝不产出 NaN 或 Infinity", () => {
    expect(progressRatio(500, 0)).toBe(0)
    expect(progressRatio(500, -1)).toBe(0)
    expect(Number.isNaN(progressRatio(500, 0))).toBe(false)
  })

  it("非有限输入一律回落到 0", () => {
    expect(progressRatio(Number.NaN, 1000)).toBe(0)
    expect(progressRatio(500, Number.NaN)).toBe(0)
    expect(progressRatio(Number.POSITIVE_INFINITY, 1000)).toBe(0)
    expect(progressRatio(500, Number.POSITIVE_INFINITY)).toBe(0)
  })

  it("负的已播时长（seek 到曲首前）返回 0", () => {
    expect(progressRatio(-1, 1000)).toBe(0)
  })
})
