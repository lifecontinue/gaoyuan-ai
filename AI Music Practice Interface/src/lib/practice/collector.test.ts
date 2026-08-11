/**
 * PracticeCollector 单测（T3.5）
 *
 * 这里重点验证**双入口 API** 的正确性 —— 它是 Phase 3 最容易出错的一处设计：
 * 判定归属的小节（期望拍点所在小节）与产生它的那一帧所在的小节**可能不同**。
 * 若两者被合并成一个入口，抢在小节线前 30ms 的 PERFECT 就会被记到上一小节头上。
 */

import { describe, expect, it } from "vitest"

import type { ChordMatch } from "@/lib/audio/ChordRecognizer"
import { PracticeCollector } from "@/lib/practice/collector"
import { timingScore } from "@/lib/practice/metrics"
import type { JudgementKind, TimingJudgement } from "@/lib/practice/types"
import { buildChord } from "@/lib/music/theory"
import type { Chord } from "@/lib/music/types"

const AM7 = buildChord("Am7", 2) // pc {9,0,4,7}

/** 构造一个 12 维 chroma */
function chroma(pitchClasses: readonly number[], value = 1): Float32Array<ArrayBuffer> {
  const c = new Float32Array(new ArrayBuffer(12 * 4))
  for (const pc of pitchClasses) c[pc] = value
  return c
}

/** 构造一条判定 */
function judgement(
  kind: JudgementKind,
  measureId: number,
  offsetMs: number,
): TimingJudgement {
  return { kind, offsetMs, measureId, onsetTimeMs: 0, expectedMs: 0, beatIndex: 0 }
}

/** 构造一个和弦匹配结果（只有 confidence 会被 collector 消费） */
function match(confidence: number, chord: Chord = AM7): ChordMatch {
  return { chord, confidence, matchedNotes: [], missingNotes: [], extraNotes: [] }
}

describe("PracticeCollector.ingestFrame", () => {
  it("无活动的帧只登记小节存在性，不污染任何均值", () => {
    const c = new PracticeCollector()
    c.ingestFrame({
      measureId: 17,
      hasActivity: false,
      chroma: chroma([9, 0, 4, 7]),
      expectedChord: AM7,
      chordMatch: match(1),
      centsScore: 100,
    })

    const a = c.finalize()
    expect(a.measures).toHaveLength(1)
    expect(a.measures[0].measureId).toBe(17)
    expect(a.measures[0].hasActivity).toBe(false)
    expect(a.measures[0].chordConfidence).toBe(0)
    expect(a.measures[0].pitchAccuracy).toBe(0)
    expect(a.practicedMeasures).toEqual([])
  })

  it("有活动的帧累积 tonalRatio / chordConfidence / centsScore", () => {
    const c = new PracticeCollector()
    for (let i = 0; i < 4; i += 1) {
      c.ingestFrame({
        measureId: 17,
        hasActivity: true,
        chroma: chroma([9, 0, 4, 7]),
        expectedChord: AM7,
        chordMatch: match(0.8),
        centsScore: null,
      })
    }

    const a = c.finalize()
    expect(a.measures[0].hasActivity).toBe(true)
    expect(a.measures[0].chordConfidence).toBeCloseTo(0.8, 9)
    // 全部能量落在期望音级 → tonalRatio = 1 → pitchAccuracy = 100（无 cents 分支）
    expect(a.measures[0].pitchAccuracy).toBeCloseTo(100, 9)
    // practiced 现以「真实起音」为准（onsetCount>0）；本例只喂帧、未喂判定，故不计入。
    expect(a.practicedMeasures).toEqual([])
  })

  it("§1.7 ① 双分支：有 cents 时 pitchAccuracy = 0.6·tonal×100 + 0.4·cents", () => {
    const c = new PracticeCollector()
    c.ingestFrame({
      measureId: 17,
      hasActivity: true,
      chroma: chroma([9, 0, 4, 7]),
      expectedChord: AM7,
      chordMatch: null,
      centsScore: 50,
    })

    const a = c.finalize()
    // tonalRatio = 1 → 0.6*100 + 0.4*50 = 80
    expect(a.measures[0].pitchAccuracy).toBeCloseTo(80, 9)
  })

  it("chroma 能量一半落在和弦外 → tonalRatio 折半，pitchAccuracy 同步下降", () => {
    const c = new PracticeCollector()
    // 期望音级 A(9) 能量 1，和弦外 D#(3) 能量 1 → tonalRatio = 1/2
    c.ingestFrame({
      measureId: 17,
      hasActivity: true,
      chroma: chroma([9, 3]),
      expectedChord: AM7,
      chordMatch: null,
      centsScore: null,
    })

    const a = c.finalize()
    expect(a.measures[0].pitchAccuracy).toBeCloseTo(50, 9)
  })

  it("expectedChord 为 null → tonalRatio 为 0（没有期望就没有命中）", () => {
    const c = new PracticeCollector()
    c.ingestFrame({
      measureId: 17,
      hasActivity: true,
      chroma: chroma([9, 0, 4, 7]),
      expectedChord: null,
      chordMatch: null,
      centsScore: null,
    })
    expect(c.finalize().measures[0].pitchAccuracy).toBe(0)
  })

  it("chordMatch 为 null 的帧不进 chordConfidence 均值（不被 0 拉低）", () => {
    const c = new PracticeCollector()
    const base = {
      measureId: 17,
      hasActivity: true,
      chroma: chroma([9, 0, 4, 7]),
      expectedChord: AM7,
      centsScore: null,
    }
    c.ingestFrame({ ...base, chordMatch: match(0.9) })
    c.ingestFrame({ ...base, chordMatch: null })
    c.ingestFrame({ ...base, chordMatch: match(0.7) })

    expect(c.finalize().measures[0].chordConfidence).toBeCloseTo(0.8, 9)
  })
})

describe("PracticeCollector.ingestJudgement", () => {
  it("perfect/good/early/late 计入 onsetCount 与 offsets", () => {
    const c = new PracticeCollector()
    c.ingestJudgement(judgement("perfect", 17, 10))
    c.ingestJudgement(judgement("good", 17, -60))
    c.ingestJudgement(judgement("early", 17, 120))
    c.ingestJudgement(judgement("late", 17, -120))

    const m = c.finalize().measures[0]
    expect(m.onsetCount).toBe(4)
    expect(m.offsets).toEqual([10, -60, 120, -120])
  })

  it("miss 只置 missed 标志，不计入 onsetCount / offsets / timingOffsets", () => {
    const c = new PracticeCollector()
    c.ingestJudgement(judgement("miss", 18, 0))

    const a = c.finalize()
    expect(a.measures[0].missed).toBe(true)
    expect(a.measures[0].onsetCount).toBe(0)
    expect(a.measures[0].offsets).toEqual([])
    expect(a.timingOffsets).toEqual([])
  })

  it("rhythmStability = mean(timingScore(offsets))，无 onset 时为 0", () => {
    const c = new PracticeCollector()
    c.ingestJudgement(judgement("perfect", 17, 0)) //   100
    c.ingestJudgement(judgement("good", 17, 70)) //      75
    c.ingestJudgement(judgement("late", 17, -100)) //    50

    const m = c.finalize().measures[0]
    const expected = (timingScore(0) + timingScore(70) + timingScore(-100)) / 3
    expect(m.rhythmStability).toBeCloseTo(expected, 9)
    expect(m.rhythmStability).toBeCloseTo(75, 9)
  })

  it("★跨小节归属：判定按自身 measureId 入账，与产生它的帧无关", () => {
    const c = new PracticeCollector()
    // 帧还在小节 17，但这个抢拍的 onset 属于小节 18
    c.ingestFrame({
      measureId: 17,
      hasActivity: true,
      chroma: chroma([9, 0, 4, 7]),
      expectedChord: AM7,
      chordMatch: match(1),
      centsScore: null,
    })
    c.ingestJudgement(judgement("perfect", 18, 30))

    const a = c.finalize()
    const m17 = a.measures.find((m) => m.measureId === 17)!
    const m18 = a.measures.find((m) => m.measureId === 18)!

    expect(m17.onsetCount).toBe(0)
    expect(m18.onsetCount).toBe(1)
    expect(m18.offsets).toEqual([30])
    // 练习过 = 该小节有真实起音（onsetCount>0）。本例起音（perfect 判定）落在 18，
    // 故 18 算已练，尽管产生它的帧在 17；17 只有帧、没有起音 → 不计入。
    expect(m18.hasActivity).toBe(false)
    expect(a.practicedMeasures).toEqual([18])
  })

  it("ingestJudgements 批量入口等价于逐条调用", () => {
    const batch = new PracticeCollector()
    const single = new PracticeCollector()
    const list = [judgement("perfect", 17, 5), judgement("miss", 18, 0), judgement("good", 19, -70)]

    batch.ingestJudgements(list)
    for (const j of list) single.ingestJudgement(j)

    expect(batch.finalize()).toEqual(single.finalize())
  })

  it("ingestJudgements([]) 是空操作，不凭空创建小节", () => {
    const c = new PracticeCollector()
    c.ingestJudgements([])
    expect(c.finalize().measures).toEqual([])
  })
})

describe("PracticeCollector.finalize", () => {
  it("measures 与 practicedMeasures 均按 measureId 升序（乱序喂入也要有序输出）", () => {
    const c = new PracticeCollector()
    for (const id of [20, 17, 19, 18]) {
      c.ingestFrame({
        measureId: id,
        hasActivity: true,
        chroma: chroma([9]),
        expectedChord: AM7,
        chordMatch: null,
        centsScore: null,
      })
      // 每小节再喂一个真实起音，practicedMeasures 才能成立（onsetCount>0）
      c.ingestJudgement(judgement("perfect", id, 0))
    }

    const a = c.finalize()
    expect(a.measures.map((m) => m.measureId)).toEqual([17, 18, 19, 20])
    expect(a.practicedMeasures).toEqual([17, 18, 19, 20])
  })

  it("timingOffsets 是所有被计数 onset 的扁平合并（跨小节，按入账顺序）", () => {
    const c = new PracticeCollector()
    c.ingestJudgement(judgement("perfect", 17, 10))
    c.ingestJudgement(judgement("good", 18, -60))
    c.ingestJudgement(judgement("miss", 19, 0))
    c.ingestJudgement(judgement("late", 20, -110))

    expect(c.finalize().timingOffsets).toEqual([10, -60, -110])
  })

  it("返回的是快照：finalize 后继续喂数据不会改动已取出的结果", () => {
    const c = new PracticeCollector()
    c.ingestJudgement(judgement("perfect", 17, 10))
    const first = c.finalize()

    c.ingestJudgement(judgement("good", 17, -70))
    expect(first.timingOffsets).toEqual([10])
    expect(first.measures[0].offsets).toEqual([10])
    expect(c.finalize().timingOffsets).toEqual([10, -70])
  })

  it("空 collector → 三个字段都是空数组，不是 undefined", () => {
    const a = new PracticeCollector().finalize()
    expect(a.measures).toEqual([])
    expect(a.timingOffsets).toEqual([])
    expect(a.practicedMeasures).toEqual([])
  })
})
