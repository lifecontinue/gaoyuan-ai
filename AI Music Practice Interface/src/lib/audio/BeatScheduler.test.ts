/**
 * BeatScheduler 单测 —— 节拍器与播放头"同源"的机器化证明（Phase 2 / 缺陷 D4）
 *
 * 这里验证的核心命题只有一句：
 *   **节拍点的 AudioContext 时刻 = 起始时刻 + 该拍的音乐时间**，
 *   且这条关系在 BPM±、SLOW PRACTICE、循环 A—B、后台 throttle 下都不破。
 *
 * 只要它成立，节拍器就不可能和播放头分家（D4 的本质是这条关系被 performance.now 打断）。
 */

import { describe, expect, it } from "vitest"
import {
  DEFAULT_LOOKAHEAD_MS,
  collectDueBeats,
  initialBeatCursor,
  type ScheduledBeat,
} from "@/lib/audio/BeatScheduler"
import { beatDurationMs, totalDurationMs, type LoopRange } from "@/lib/audio/ScoreFollower"
import { SLOW_DANCING_SCORE } from "@/lib/music/scores/slowDancing"
import { flattenMeasures } from "@/lib/music/types"

/** 12 小节，id 17-28，全部 4/4，bpm 92 */
const MEASURES = flattenMeasures(SLOW_DANCING_SCORE.sections)
const BPM = SLOW_DANCING_SCORE.bpm // 92
/** 权威锚值：60000 / 92 = 652.1739130434783 */
const BEAT_MS = beatDurationMs(BPM, 100)
const TOTAL_MS = totalDurationMs(MEASURES, BPM, 100)
/** 起始时钟秒数取一个非 0 值，确保代码里没有"默认从 0 开始"的隐含假设 */
const CLOCK_ORIGIN_SEC = 12.75

/**
 * 用固定步长模拟 rAF 推进，收集整段时间里排出的所有拍。
 *
 * @param durationMs   模拟总时长
 * @param stepMs       每轮推进的毫秒数（默认 16.7 ≈ 60fps）
 * @param loopRange    循环范围
 * @param speedPercent SLOW PRACTICE 百分比
 */
function simulate(
  durationMs: number,
  stepMs: number = 1000 / 60,
  loopRange: LoopRange | null = null,
  speedPercent: number = 100,
): ScheduledBeat[] {
  const collected: ScheduledBeat[] = []
  let cursor = -1
  for (let elapsedMs = 0; elapsedMs <= durationMs; elapsedMs += stepMs) {
    const result = collectDueBeats({
      measures: MEASURES,
      bpm: BPM,
      speedPercent,
      loopRange,
      elapsedMs,
      nowSec: CLOCK_ORIGIN_SEC + elapsedMs / 1000,
      lastScheduledBeat: cursor,
    })
    collected.push(...result.beats)
    cursor = result.lastScheduledBeat
  }
  return collected
}

describe("initialBeatCursor", () => {
  it("曲首返回 -1，保证第 0 拍（强拍）不会被吞掉", () => {
    expect(initialBeatCursor(0, BEAT_MS)).toBe(-1)
  })

  it("刚过第 0 拍返回 0", () => {
    expect(initialBeatCursor(1, BEAT_MS)).toBe(0)
  })

  it("恰好落在第 1 拍边界上时返回 0（该拍仍应被排出）", () => {
    expect(initialBeatCursor(BEAT_MS, BEAT_MS)).toBe(0)
  })

  it("负时间与非法拍长都回落到 -1，绝不返回 NaN", () => {
    expect(initialBeatCursor(-500, BEAT_MS)).toBe(-1)
    expect(initialBeatCursor(1000, 0)).toBe(-1)
    expect(initialBeatCursor(1000, Number.POSITIVE_INFINITY)).toBe(-1)
  })
})

describe("collectDueBeats —— 冷启动", () => {
  it("elapsedMs=0 时只排出第 0 拍：下一拍在 652.17ms 之后，超出 150ms 提前量", () => {
    const { beats, lastScheduledBeat } = collectDueBeats({
      measures: MEASURES,
      bpm: BPM,
      speedPercent: 100,
      loopRange: null,
      elapsedMs: 0,
      nowSec: CLOCK_ORIGIN_SEC,
      lastScheduledBeat: -1,
    })
    expect(beats).toHaveLength(1)
    expect(beats[0].beatNumber).toBe(0)
    expect(beats[0].elapsedMs).toBe(0)
    expect(beats[0].atCtxSec).toBeCloseTo(CLOCK_ORIGIN_SEC, 12)
    expect(beats[0].accent).toBe(true)
    expect(beats[0].measureId).toBe(17)
    expect(beats[0].beatIndex).toBe(0)
    expect(lastScheduledBeat).toBe(0)
  })

  it("提前量放大到一小节时，一次排出前 5 拍（第 4 拍恰好是第 18 小节的强拍）", () => {
    const { beats } = collectDueBeats({
      measures: MEASURES,
      bpm: BPM,
      speedPercent: 100,
      loopRange: null,
      elapsedMs: 0,
      nowSec: CLOCK_ORIGIN_SEC,
      lastScheduledBeat: -1,
      lookaheadMs: 4 * BEAT_MS,
    })
    expect(beats.map((b) => b.beatNumber)).toEqual([0, 1, 2, 3, 4])
    expect(beats.map((b) => b.accent)).toEqual([true, false, false, false, true])
    expect(beats.map((b) => b.measureId)).toEqual([17, 17, 17, 17, 18])
    expect(beats[4].beatIndex).toBe(0)
    // 第 4 拍 = 2608.6957ms，正是权威锚值里 17→18 的切换点
    expect(beats[4].elapsedMs).toBeCloseTo(2608.6957, 3)
  })

  it("measures 为空时静默返回空排期，不抛异常", () => {
    const { beats, lastScheduledBeat } = collectDueBeats({
      measures: [],
      bpm: BPM,
      speedPercent: 100,
      loopRange: null,
      elapsedMs: 0,
      nowSec: CLOCK_ORIGIN_SEC,
      lastScheduledBeat: -1,
    })
    expect(beats).toEqual([])
    expect(lastScheduledBeat).toBe(-1)
  })
})

describe("collectDueBeats —— 连续推进（rAF 模拟）", () => {
  const beats = simulate(8000)

  it("拍号连续无重复、无遗漏", () => {
    expect(beats.length).toBeGreaterThan(10)
    beats.forEach((beat, i) => {
      expect(beat.beatNumber).toBe(i)
    })
  })

  it("每一拍的 AudioContext 时刻 = 起始时刻 + 拍号×拍长（这就是「同源」的定义）", () => {
    for (const beat of beats) {
      expect(beat.atCtxSec).toBeCloseTo(CLOCK_ORIGIN_SEC + (beat.beatNumber * BEAT_MS) / 1000, 9)
    }
  })

  it("强拍恰好落在每小节第一拍（4/4 → 每 4 拍一次）", () => {
    for (const beat of beats) {
      expect(beat.accent).toBe(beat.beatNumber % 4 === 0)
      expect(beat.beatIndex).toBe(beat.beatNumber % 4)
      expect(beat.measureId).toBe(17 + Math.floor(beat.beatNumber / 4))
    }
  })

  it("换用 5ms 的细步长，排期结果与 60fps 完全一致（不依赖 rAF 频率）", () => {
    const fine = simulate(8000, 5)
    expect(fine.map((b) => b.beatNumber)).toEqual(beats.map((b) => b.beatNumber))
    fine.forEach((beat, i) => {
      expect(beat.atCtxSec).toBeCloseTo(beats[i].atCtxSec, 9)
      expect(beat.accent).toBe(beats[i].accent)
    })
  })
})

describe("collectDueBeats —— SLOW PRACTICE 变速", () => {
  it("50% 速度：拍长翻倍到 1304.35ms，强拍仍落在小节头", () => {
    const slow = simulate(12000, 1000 / 60, null, 50)
    const slowBeatMs = beatDurationMs(BPM, 50)
    expect(slowBeatMs).toBeCloseTo(1304.3478, 3)
    slow.forEach((beat, i) => {
      expect(beat.beatNumber).toBe(i)
      expect(beat.atCtxSec).toBeCloseTo(CLOCK_ORIGIN_SEC + (i * slowBeatMs) / 1000, 9)
      expect(beat.accent).toBe(i % 4 === 0)
    })
    // 第 4 拍 = 5217.39ms，正是 50% 速度下的小节切换锚值
    expect(slow[4].elapsedMs).toBeCloseTo(5217.3913, 3)
    expect(slow[4].measureId).toBe(18)
  })

  it("75% 速度：小节时长 3478.26ms，第 4 拍即第 18 小节强拍", () => {
    const slow = simulate(8000, 1000 / 60, null, 75)
    expect(slow[4].elapsedMs).toBeCloseTo(3478.2609, 3)
    expect(slow[4].measureId).toBe(18)
    expect(slow[4].accent).toBe(true)
  })
})

describe("collectDueBeats —— 循环 A—B", () => {
  const LOOP: LoopRange = { startId: 17, endId: 20 }

  it("4 小节循环：第 16 拍回绕到第 17 小节的强拍", () => {
    const beats = simulate(24000, 1000 / 60, LOOP)
    const beat16 = beats.find((b) => b.beatNumber === 16)
    expect(beat16).toBeDefined()
    expect(beat16?.measureId).toBe(17)
    expect(beat16?.beatIndex).toBe(0)
    expect(beat16?.accent).toBe(true)
  })

  it("循环内小节编号按 17→20 周期重复，绝不越界到 21", () => {
    const beats = simulate(30000, 1000 / 60, LOOP)
    for (const beat of beats) {
      expect(beat.measureId).toBe(17 + (Math.floor(beat.beatNumber / 4) % 4))
    }
  })

  it("有循环时会一直排下去，不受全曲总时长限制", () => {
    const beats = simulate(TOTAL_MS + 6000, 1000 / 60, LOOP)
    const maxBeat = Math.max(...beats.map((b) => b.beatNumber))
    expect(maxBeat).toBeGreaterThan(48)
  })
})

describe("collectDueBeats —— 曲末与异常输入", () => {
  it("无循环时排到最后一拍（第 47 拍）为止，不给不存在的小节打拍子", () => {
    const beats = simulate(TOTAL_MS + 4000)
    const maxBeat = Math.max(...beats.map((b) => b.beatNumber))
    expect(MEASURES.length * 4).toBe(48)
    expect(maxBeat).toBe(47)
    expect(beats.every((b) => b.elapsedMs < TOTAL_MS)).toBe(true)
  })

  it("页面被 throttle 后回来：跳过全部过期拍，只补最近一拍，绝不「追赶轰炸」", () => {
    // 游标停在第 0 拍，但音乐已经跑到 10 秒 —— 中间 14 拍都已成为过去
    const { beats } = collectDueBeats({
      measures: MEASURES,
      bpm: BPM,
      speedPercent: 100,
      loopRange: null,
      elapsedMs: 10000,
      nowSec: CLOCK_ORIGIN_SEC + 10,
      lastScheduledBeat: 0,
    })
    expect(beats).toHaveLength(1)
    expect(beats[0].beatNumber).toBe(15)
    // 第 15 拍在 9782.6ms，落后当前时间不到一拍；早于它的拍全部被丢弃
    expect(beats[0].elapsedMs).toBeCloseTo(9782.6087, 3)
    expect(beats[0].atCtxSec).toBeLessThan(CLOCK_ORIGIN_SEC + 10)
  })

  it("提前量给到荒谬值时被 maxBeats 截断，不会死循环", () => {
    const { beats } = collectDueBeats({
      measures: MEASURES,
      bpm: BPM,
      speedPercent: 100,
      loopRange: { startId: 17, endId: 28 },
      elapsedMs: 0,
      nowSec: CLOCK_ORIGIN_SEC,
      lastScheduledBeat: -1,
      lookaheadMs: 1e9,
      maxBeats: 12,
    })
    expect(beats).toHaveLength(12)
    expect(beats[11].beatNumber).toBe(11)
  })

  it("speedPercent=0（时间停滞）不产生任何拍，也不抛异常", () => {
    const { beats, lastScheduledBeat } = collectDueBeats({
      measures: MEASURES,
      bpm: BPM,
      speedPercent: 0,
      loopRange: null,
      elapsedMs: 0,
      nowSec: CLOCK_ORIGIN_SEC,
      lastScheduledBeat: -1,
    })
    expect(beats).toEqual([])
    expect(lastScheduledBeat).toBe(-1)
  })

  it("默认提前量常量保持 150ms（改动会直接影响幽灵拍时长，需显式评审）", () => {
    expect(DEFAULT_LOOKAHEAD_MS).toBe(150)
  })
})
