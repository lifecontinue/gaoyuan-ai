/**
 * ScoreFollower 单测（Phase 2 / DoD #1–#6）
 *
 * 全部用 `VirtualClock` 驱动 —— 不依赖 `performance.now()` / AudioContext / rAF，
 * 因此在 node 环境下**完全确定性**（这正是 D4 修复带来的可测性）。
 *
 * 权威锚值（qa-p1 锁定，改动必须同步 review）：
 *   bpm=92 / 4-4 / speed=100 → 一小节 4 × 60000/92 = 2608.6957ms
 *     elapsedMs = 2608 → measureId 17；elapsedMs = 2609 → measureId 18（切换点误差 < 1ms）
 *   speed=50  → 一小节 5217.3913ms
 *   speed=75  → 一小节 3478.2609ms
 *   loopRange={17,20}, elapsedMs = 4×2608.70+100 → 回绕到 measureId 17，progress ≈ 0.03833
 *   无循环且 elapsedMs 远超全曲（1e6）→ 夹在末小节，progress === 1，不越界不抛
 */

import { describe, expect, it } from "vitest"
import {
  ScoreFollower,
  beatDurationMs,
  formatClock,
  positionAt,
  totalDurationMs,
  type LoopRange,
} from "@/lib/audio/ScoreFollower"
import { VirtualClock } from "@/lib/audio/testing/virtualClock"
import { SLOW_DANCING_SCORE } from "@/lib/music/scores/slowDancing"
import { flattenMeasures } from "@/lib/music/types"

const MEASURES = flattenMeasures(SLOW_DANCING_SCORE.sections)
const BPM = SLOW_DANCING_SCORE.bpm // 92
/** 一小节（4/4 @ bpm92 @ 100%）= 2608.6956...ms */
const MEASURE_MS = (4 * 60000) / 92
const FIRST_ID = MEASURES[0].id // 17
const LAST_ID = MEASURES[MEASURES.length - 1].id // 28

describe("beatDurationMs / totalDurationMs / formatClock", () => {
  it("命中 qa-p1 锁定的拍长锚值", () => {
    expect(beatDurationMs(92, 100)).toBeCloseTo(652.1739, 4)
    expect(beatDurationMs(92, 50)).toBeCloseTo(1304.3478, 4)
    expect(beatDurationMs(92, 75)).toBeCloseTo(869.5652, 4)
  })

  it("4/4 小节时长 = 4 × 拍长，命中 2608.70 / 5217.39 / 3478.26", () => {
    expect(4 * beatDurationMs(92, 100)).toBeCloseTo(2608.6957, 3)
    expect(4 * beatDurationMs(92, 50)).toBeCloseTo(5217.3913, 3)
    expect(4 * beatDurationMs(92, 75)).toBeCloseTo(3478.2609, 3)
  })

  it("speedPercent = 0 不除零崩溃，时间停滞", () => {
    expect(beatDurationMs(92, 0)).toBe(Number.POSITIVE_INFINITY)
    expect(() => positionAt(MEASURES, 92, 0, null, 5000)).not.toThrow()
  })

  it("全曲总时长与 mm:ss 格式化", () => {
    expect(totalDurationMs(MEASURES, 92, 100)).toBeCloseTo(12 * MEASURE_MS, 3)
    expect(formatClock(totalDurationMs(MEASURES, 92, 100))).toBe("00:31")
    expect(formatClock(totalDurationMs(MEASURES, 92, 75))).toBe("00:41")
    expect(formatClock(0)).toBe("00:00")
    expect(formatClock(-5)).toBe("00:00")
    expect(formatClock(Number.NaN)).toBe("00:00")
    expect(formatClock(65_000)).toBe("01:05")
  })
})

describe("positionAt —— 纯函数（DoD #2 切换点锚值）", () => {
  it("elapsedMs = 2608 落在 measureId 17，2609 落在 measureId 18", () => {
    expect(positionAt(MEASURES, BPM, 100, null, 2608).measureId).toBe(17)
    expect(positionAt(MEASURES, BPM, 100, null, 2609).measureId).toBe(18)
  })

  it("切换点误差 < 1ms：2608.69 仍是 17，2608.70 已是 18", () => {
    expect(positionAt(MEASURES, BPM, 100, null, 2608.69).measureId).toBe(17)
    expect(positionAt(MEASURES, BPM, 100, null, 2608.7).measureId).toBe(18)
  })

  it("t = 0 在首小节开头；恰好一小节整数倍归属下一小节", () => {
    const head = positionAt(MEASURES, BPM, 100, null, 0)
    expect(head.measureId).toBe(FIRST_ID)
    expect(head.measureIndex).toBe(0)
    expect(head.beatIndex).toBe(0)
    expect(head.progress).toBe(0)

    expect(positionAt(MEASURES, BPM, 100, null, MEASURE_MS).measureId).toBe(18)
    expect(positionAt(MEASURES, BPM, 100, null, MEASURE_MS).progress).toBeCloseTo(0, 6)
    expect(positionAt(MEASURES, BPM, 100, null, 2 * MEASURE_MS).measureId).toBe(19)
  })

  it("拍下标随小节内进度推进 0→1→2→3，且不越界", () => {
    const beat = beatDurationMs(BPM, 100)
    for (let b = 0; b < 4; b += 1) {
      const pos = positionAt(MEASURES, BPM, 100, null, b * beat + 1)
      expect(pos.measureId).toBe(FIRST_ID)
      expect(pos.beatIndex).toBe(b)
      expect(pos.beatTimeMs).toBeGreaterThanOrEqual(0)
      expect(pos.beatTimeMs).toBeLessThan(beat)
    }
  })

  it("SLOW PRACTICE 50% / 75% 的小节切换点同样命中锚值", () => {
    expect(positionAt(MEASURES, BPM, 50, null, 5217).measureId).toBe(17)
    expect(positionAt(MEASURES, BPM, 50, null, 5218).measureId).toBe(18)
    expect(positionAt(MEASURES, BPM, 75, null, 3478).measureId).toBe(17)
    expect(positionAt(MEASURES, BPM, 75, null, 3479).measureId).toBe(18)
  })

  it("穷举 0..30000ms：单调不回退、progress 与 beatIndex 恒在合法域", () => {
    let lastIndex = -1
    for (let t = 0; t <= 30_000; t += 1) {
      const pos = positionAt(MEASURES, BPM, 100, null, t)
      expect(pos.measureIndex).toBeGreaterThanOrEqual(lastIndex)
      lastIndex = pos.measureIndex
      expect(pos.measureIndex).toBeLessThan(MEASURES.length)
      expect(pos.measureId).toBe(MEASURES[pos.measureIndex].id)
      expect(pos.progress).toBeGreaterThanOrEqual(0)
      expect(pos.progress).toBeLessThanOrEqual(1)
      expect(pos.beatIndex).toBeGreaterThanOrEqual(0)
      expect(pos.beatIndex).toBeLessThan(MEASURES[pos.measureIndex].beats)
      expect(Number.isFinite(pos.beatTimeMs)).toBe(true)
    }
  })

  it("无循环播过全曲末尾：夹在末小节，progress === 1，不抛不越界", () => {
    const pos = positionAt(MEASURES, BPM, 100, null, 1_000_000)
    expect(pos.measureId).toBe(LAST_ID)
    expect(pos.measureIndex).toBe(MEASURES.length - 1)
    expect(pos.progress).toBe(1)
    expect(() => positionAt(MEASURES, BPM, 100, null, Number.MAX_SAFE_INTEGER)).not.toThrow()
  })

  it("空曲谱不崩溃", () => {
    expect(() => positionAt([], BPM, 100, null, 1234)).not.toThrow()
    expect(positionAt([], BPM, 100, null, 1234).progress).toBe(0)
  })
})

describe("positionAt —— 循环 A–B（DoD #4 边界）", () => {
  const LOOP: LoopRange = { startId: 17, endId: 20 }
  /** 循环区 4 个小节 */
  const LOOP_MS = 4 * MEASURE_MS

  it("锚值：elapsedMs = 4×2608.70+100 回绕到 measureId 17，progress ≈ 0.03833", () => {
    const pos = positionAt(MEASURES, BPM, 100, LOOP, 4 * 2608.7 + 100)
    expect(pos.measureId).toBe(17)
    expect(pos.progress).toBeCloseTo(0.03833, 3)
  })

  it("恰好走完一整圈回到循环起点", () => {
    const pos = positionAt(MEASURES, BPM, 100, LOOP, LOOP_MS)
    expect(pos.measureId).toBe(17)
    expect(pos.progress).toBeCloseTo(0, 6)
  })

  it("循环区末尾前 1ms 仍在 endId 小节内", () => {
    const pos = positionAt(MEASURES, BPM, 100, LOOP, LOOP_MS - 1)
    expect(pos.measureId).toBe(20)
    expect(pos.progress).toBeGreaterThan(0.99)
  })

  it("穷举 0..30000ms：永远不越出 [17, 20]", () => {
    for (let t = 0; t <= 30_000; t += 1) {
      const id = positionAt(MEASURES, BPM, 100, LOOP, t).measureId
      expect(id).toBeGreaterThanOrEqual(17)
      expect(id).toBeLessThanOrEqual(20)
    }
  })

  it("循环区不在曲首时，先顺序播到 A 点再开始回绕", () => {
    const loop: LoopRange = { startId: 21, endId: 22 }
    // 前 4 小节（17-20）照常顺序播放
    expect(positionAt(MEASURES, BPM, 100, loop, 0).measureId).toBe(17)
    expect(positionAt(MEASURES, BPM, 100, loop, 3 * MEASURE_MS + 10).measureId).toBe(20)
    // 进入循环区后在 21/22 之间回绕
    expect(positionAt(MEASURES, BPM, 100, loop, 4 * MEASURE_MS + 10).measureId).toBe(21)
    expect(positionAt(MEASURES, BPM, 100, loop, 5 * MEASURE_MS + 10).measureId).toBe(22)
    expect(positionAt(MEASURES, BPM, 100, loop, 6 * MEASURE_MS + 10).measureId).toBe(21)
    expect(positionAt(MEASURES, BPM, 100, loop, 7 * MEASURE_MS + 10).measureId).toBe(22)
  })

  it("单小节循环也能回绕", () => {
    const loop: LoopRange = { startId: 19, endId: 19 }
    for (let k = 0; k < 6; k += 1) {
      const t = 2 * MEASURE_MS + k * MEASURE_MS + 5
      expect(positionAt(MEASURES, BPM, 100, loop, t).measureId).toBe(19)
    }
  })

  it("非法循环范围（端点不存在 / 反序）退化为无循环，绝不抛", () => {
    const missing: LoopRange = { startId: 999, endId: 1000 }
    expect(positionAt(MEASURES, BPM, 100, missing, 2609).measureId).toBe(18)
    const reversed: LoopRange = { startId: 20, endId: 17 }
    expect(() => positionAt(MEASURES, BPM, 100, reversed, 2609)).not.toThrow()
    expect(positionAt(MEASURES, BPM, 100, reversed, 2609).measureId).toBe(18)
  })
})

describe("ScoreFollower —— 注入 Clock（DoD #1 / #3 / #5）", () => {
  function makeFollower() {
    const clock = new VirtualClock(0)
    const follower = new ScoreFollower(SLOW_DANCING_SCORE, clock)
    return { clock, follower }
  }

  it("未启动时 elapsedMs 为 0，且不随时钟推进", () => {
    const { clock, follower } = makeFollower()
    clock.advance(5000)
    expect(follower.elapsedMs()).toBe(0)
    expect(follower.isRunning).toBe(false)
  })

  it("start 后 elapsedMs 完全由注入的 Clock 决定（无 performance.now 参与）", () => {
    const { clock, follower } = makeFollower()
    follower.start()
    clock.advance(2608)
    expect(follower.elapsedMs()).toBeCloseTo(2608, 6)
    expect(follower.getState().currentMeasureId).toBe(17)
    clock.advance(1)
    expect(follower.getState().currentMeasureId).toBe(18)
  })

  it("时钟起点非 0 时同样正确（AudioContext.currentTime 不从 0 开始）", () => {
    const clock = new VirtualClock(12_345.678)
    const follower = new ScoreFollower(SLOW_DANCING_SCORE, clock)
    follower.start()
    clock.advance(2609)
    expect(follower.elapsedMs()).toBeCloseTo(2609, 6)
    expect(follower.getState().currentMeasureId).toBe(18)
  })

  it("pause 冻结、resume 续播，暂停时长不计入音乐时间", () => {
    const { clock, follower } = makeFollower()
    follower.start()
    clock.advance(1000)
    follower.pause()
    expect(follower.isRunning).toBe(false)
    clock.advance(9999)
    expect(follower.elapsedMs()).toBeCloseTo(1000, 6)
    expect(follower.getState().currentMeasureId).toBe(17)

    follower.resume()
    clock.advance(1609)
    expect(follower.elapsedMs()).toBeCloseTo(2609, 6)
    expect(follower.getState().currentMeasureId).toBe(18)
  })

  it("stop 复位到曲首", () => {
    const { clock, follower } = makeFollower()
    follower.start()
    clock.advance(9000)
    follower.stop()
    expect(follower.elapsedMs()).toBe(0)
    expect(follower.getState().currentMeasureId).toBe(17)
  })

  it("seekToMeasure 在停止状态下也能定位，并从该点续播", () => {
    const { clock, follower } = makeFollower()
    follower.seekToMeasure(21)
    expect(follower.getState().currentMeasureId).toBe(21)
    clock.advance(5000) // 未 start，位置必须冻结
    expect(follower.getState().currentMeasureId).toBe(21)

    follower.start()
    clock.advance(MEASURE_MS + 1)
    expect(follower.getState().currentMeasureId).toBe(22)
  })

  it("seekToMeasure 对不存在的小节是空操作", () => {
    const { follower } = makeFollower()
    follower.start()
    follower.seekToMeasure(999)
    expect(follower.getState().currentMeasureId).toBe(17)
  })

  it("getState 带出乐段、期望和弦与拍下标", () => {
    const { clock, follower } = makeFollower()
    follower.start()
    clock.advance(2 * MEASURE_MS + beatDurationMs(BPM, 100) * 2 + 5)
    const state = follower.getState()
    expect(state.currentMeasureId).toBe(19)
    expect(state.currentSectionId).toBe("verse-2")
    expect(state.expectedChord?.name).toBe("C")
    expect(state.currentBeatIndex).toBe(2)
  })

  it("setLoopRange 生效且能自动纠正反序输入；clearLoop 还原", () => {
    const { clock, follower } = makeFollower()
    follower.setLoopRange(20, 17)
    expect(follower.currentLoop).toEqual({ startId: 17, endId: 20 })
    follower.start()
    clock.advance(4 * MEASURE_MS + 100)
    expect(follower.getState().currentMeasureId).toBe(17)

    // 清掉循环后同一个 elapsedMs（4 小节 + 100ms）落到第 5 小节，即 id 21
    follower.clearLoop()
    expect(follower.currentLoop).toBeNull()
    expect(follower.getState().currentMeasureId).toBe(21)
  })
})

describe("ScoreFollower —— 保位变速（DoD #6，含变异守卫）", () => {
  /** 推进到 measureId 19（index 2）的 50% 处 */
  function advanceToMiddleOfBar19() {
    const clock = new VirtualClock(0)
    const follower = new ScoreFollower(SLOW_DANCING_SCORE, clock)
    follower.start()
    clock.advance(2 * MEASURE_MS + MEASURE_MS / 2)
    const before = follower.getState()
    expect(before.currentMeasureId).toBe(19)
    expect(follower.getPosition().progress).toBeCloseTo(0.5, 6)
    return { clock, follower }
  }

  it("setBpm(120) 后 measureId 仍为 19 且 |progress - 0.5| < 0.01", () => {
    const { follower } = advanceToMiddleOfBar19()
    follower.setBpm(120)
    const after = follower.getState()
    expect(after.currentMeasureId).toBe(19)
    expect(Math.abs(follower.getPosition().progress - 0.5)).toBeLessThan(0.01)
    // 音乐位置守恒：10 拍 × 500ms = 5000ms
    expect(follower.elapsedMs()).toBeCloseTo(5000, 6)
    expect(follower.effectiveBpm).toBe(120)
  })

  it("setSpeed(50) 后 measureId 仍为 19 且 |progress - 0.5| < 0.01", () => {
    const { follower } = advanceToMiddleOfBar19()
    follower.setSpeed(50)
    expect(follower.getState().currentMeasureId).toBe(19)
    expect(Math.abs(follower.getPosition().progress - 0.5)).toBeLessThan(0.01)
    // 10 拍 × 1304.3478ms
    expect(follower.elapsedMs()).toBeCloseTo(10 * 1304.347826, 4)
  })

  it("连续多次改速仍不跳变（BPM± 连点场景）", () => {
    const { follower } = advanceToMiddleOfBar19()
    for (const bpm of [94, 96, 98, 100, 88, 76, 60]) {
      follower.setBpm(bpm)
      expect(follower.getState().currentMeasureId).toBe(19)
      expect(Math.abs(follower.getPosition().progress - 0.5)).toBeLessThan(0.01)
    }
  })

  it("改速后继续推进：新拍长立即生效", () => {
    const { clock, follower } = advanceToMiddleOfBar19()
    follower.setBpm(120) // 小节 = 2000ms，当前处于 19 的 50%（剩 1000ms）
    clock.advance(1001)
    expect(follower.getState().currentMeasureId).toBe(20)
  })

  it("暂停状态下改速也保位", () => {
    const { clock, follower } = advanceToMiddleOfBar19()
    follower.pause()
    clock.advance(7777)
    follower.setBpm(120)
    expect(follower.getState().currentMeasureId).toBe(19)
    expect(Math.abs(follower.getPosition().progress - 0.5)).toBeLessThan(0.01)
    follower.resume()
    clock.advance(1001)
    expect(follower.getState().currentMeasureId).toBe(20)
  })

  it("变异守卫：朴素实现（丢弃 beatsElapsed 记忆）会让 measureId 跳回曲首", () => {
    // 这个用例把"朴素 setBpm"显式建模出来，证明上面的断言不是空转绿：
    // 若 rebaseToBeats 退化成 startCtxSec = clock.nowSec()，elapsedMs 归零，
    // measureId 会从 19 跳回 17、progress 从 0.5 跳到 0。
    const naiveElapsedMs = 0
    const naive = positionAt(MEASURES, 120, 100, null, naiveElapsedMs)
    expect(naive.measureId).toBe(17)
    expect(naive.progress).toBe(0)
    // 与保位实现的结果必须不同 —— 否则该断言无法证伪
    const { follower } = advanceToMiddleOfBar19()
    follower.setBpm(120)
    expect(follower.getState().currentMeasureId).not.toBe(naive.measureId)
  })
})
