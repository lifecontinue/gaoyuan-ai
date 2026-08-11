/**
 * transportStore 单测 — Phase 2 的播放意图状态机
 *
 * 这里钉死三组在 UI 上肉眼很难穷举、但一旦错就直接毁掉练习体验的行为：
 *   1. BPM 夹紧 [50,180] 与 SLOW PRACTICE 50/75/100 的循环顺序；
 *   2. LOOP A—B 三态打点（打 A → 打 B 成环 → 清除）以及反序输入的自动纠正；
 *   3. 节拍器默认**关闭**、默认音量 0.25 —— 这是串音（节拍器被麦克风拾回）的防线，
 *      默认值一旦被人改成 true/1.0，Phase 3 的音高检测会被自己的节拍器污染。
 */

import { beforeEach, describe, expect, it } from "vitest"

import { useTransportStore } from "@/lib/store/transportStore"

/** 每个用例前把 store 复位到出厂值（zustand 全局单例，用例之间会互相污染） */
const INITIAL = {
  playing: false,
  bpm: 92,
  speedPercent: 75,
  looping: true,
  loopRange: null,
  loopPointA: null,
  metronomeEnabled: false,
  metronomeVolume: 0.25,
}

function store() {
  return useTransportStore.getState()
}

beforeEach(() => {
  useTransportStore.setState({ ...INITIAL })
})

describe("默认值（串音防线）", () => {
  it("节拍器默认关闭、音量 0.25", () => {
    expect(store().metronomeEnabled).toBe(false)
    expect(store().metronomeVolume).toBe(0.25)
  })

  it("默认 BPM 92 / 速度 75%，与示例谱一致", () => {
    expect(store().bpm).toBe(92)
    expect(store().speedPercent).toBe(75)
  })
})

describe("BPM", () => {
  it("adjustBpm 累加并四舍五入到整数", () => {
    store().adjustBpm(2)
    expect(store().bpm).toBe(94)
    store().adjustBpm(-4)
    expect(store().bpm).toBe(90)
  })

  it("夹紧到 [50, 180]，连点也冲不出边界", () => {
    for (let i = 0; i < 200; i++) store().adjustBpm(-2)
    expect(store().bpm).toBe(50)
    for (let i = 0; i < 200; i++) store().adjustBpm(2)
    expect(store().bpm).toBe(180)
  })

  it("非有限输入回落到下界，不产生 NaN BPM（会让整条时间轴变成 NaN）", () => {
    store().setBpm(Number.NaN)
    expect(store().bpm).toBe(50)
    store().setBpm(Number.POSITIVE_INFINITY)
    expect(store().bpm).toBe(50)
  })
})

describe("SLOW PRACTICE", () => {
  it("cycleSpeed 按 50 → 75 → 100 → 50 轮转", () => {
    useTransportStore.setState({ speedPercent: 50 })
    store().cycleSpeed()
    expect(store().speedPercent).toBe(75)
    store().cycleSpeed()
    expect(store().speedPercent).toBe(100)
    store().cycleSpeed()
    expect(store().speedPercent).toBe(50)
  })

  it("速度是野值时下一次 cycle 回到 50，不会卡死", () => {
    useTransportStore.setState({ speedPercent: 63 })
    store().cycleSpeed()
    expect(store().speedPercent).toBe(50)
  })

  it("setSpeedPercent 拒绝 0 与负数（除零会让拍长变成 Infinity）", () => {
    store().setSpeedPercent(0)
    expect(store().speedPercent).toBe(100)
    store().setSpeedPercent(-50)
    expect(store().speedPercent).toBe(100)
  })
})

describe("LOOP A—B 三态", () => {
  it("第一次打点 → A；第二次 → B 并成环；第三次 → 清除", () => {
    expect(store().cycleLoopPoint(17)).toBe("A")
    expect(store().loopPointA).toBe(17)
    expect(store().loopRange).toBeNull()

    expect(store().cycleLoopPoint(20)).toBe("B")
    expect(store().loopRange).toEqual({ startMeasureId: 17, endMeasureId: 20 })
    expect(store().looping).toBe(true)

    expect(store().cycleLoopPoint(25)).toBe("clear")
    expect(store().loopRange).toBeNull()
    expect(store().loopPointA).toBeNull()
  })

  it("成环后 loopPointA 必须被清空 —— 它只表示'等待 B'的中间态", () => {
    store().cycleLoopPoint(17)
    store().cycleLoopPoint(20)
    expect(store().loopPointA).toBeNull()
  })

  it("B 打在 A 之前时自动纠正为正序，命中 qa-p1 锁定的 [17,20]", () => {
    store().setLoopPointA(20)
    store().setLoopPointB(17)
    expect(store().loopRange).toEqual({ startMeasureId: 17, endMeasureId: 20 })
  })

  it("A 与 B 打在同一小节时退化为单小节循环，仍然合法", () => {
    store().setLoopPointA(19)
    store().setLoopPointB(19)
    expect(store().loopRange).toEqual({ startMeasureId: 19, endMeasureId: 19 })
  })

  it("未打 A 直接打 B 时按 A 处理，不产生半截 loopRange", () => {
    store().setLoopPointB(21)
    expect(store().loopPointA).toBe(21)
    expect(store().loopRange).toBeNull()
  })

  it("重新打 A 会作废旧的循环范围", () => {
    store().setLoopPointA(17)
    store().setLoopPointB(20)
    store().setLoopPointA(23)
    expect(store().loopRange).toBeNull()
    expect(store().loopPointA).toBe(23)
  })

  it("toggleLooping 只切开关，不破坏已记录的 A—B 区间", () => {
    store().setLoopPointA(17)
    store().setLoopPointB(20)
    store().toggleLooping()
    expect(store().looping).toBe(false)
    expect(store().loopRange).toEqual({ startMeasureId: 17, endMeasureId: 20 })
  })
})

describe("节拍器", () => {
  it("toggleMetronome 在 false / true 之间切换", () => {
    store().toggleMetronome()
    expect(store().metronomeEnabled).toBe(true)
    store().toggleMetronome()
    expect(store().metronomeEnabled).toBe(false)
  })

  it("音量夹紧到 [0,1]，非有限值归 0", () => {
    store().setMetronomeVolume(2)
    expect(store().metronomeVolume).toBe(1)
    store().setMetronomeVolume(-1)
    expect(store().metronomeVolume).toBe(0)
    store().setMetronomeVolume(Number.NaN)
    expect(store().metronomeVolume).toBe(0)
  })
})
