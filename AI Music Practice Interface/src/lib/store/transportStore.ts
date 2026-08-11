/**
 * Transport Store — 播放控制状态
 *
 * 管理：播放/暂停、BPM、慢速练习速度、循环 A-B、节拍器开关与音量。
 * 高频数据（播放头位置、每帧音频）不放这里，走 TimelineBus / AudioBus（§1.4）。
 */

import { create } from "zustand"

export interface LoopRange {
  startMeasureId: number
  endMeasureId: number
}

interface TransportState {
  /** 是否播放中 */
  playing: boolean
  /** 当前 BPM */
  bpm: number
  /** 慢速练习百分比（50 / 75 / 100） */
  speedPercent: number
  /** 是否启用循环（loopRange 为 null 时该开关无实际作用） */
  looping: boolean
  /** 循环范围 A-B（null = 未设置） */
  loopRange: LoopRange | null
  /** 已按下的 A 点（等待 B 点；null = 未处于打点流程） */
  loopPointA: number | null
  /**
   * 节拍器开关。
   * 默认 **关闭**：外放时节拍器会被麦克风拾回，污染音高检测（串音）。
   */
  metronomeEnabled: boolean
  /** 节拍器音量 0-1（默认 0.25，同样是为了压低串音） */
  metronomeVolume: number

  // actions
  setPlaying: (v: boolean) => void
  togglePlaying: () => void
  setBpm: (v: number) => void
  adjustBpm: (delta: number) => void
  setSpeedPercent: (v: number) => void
  cycleSpeed: () => void
  setLooping: (v: boolean) => void
  toggleLooping: () => void
  setLoopRange: (range: LoopRange | null) => void
  /** 打 A 点（进入"等待 B 点"状态） */
  setLoopPointA: (measureId: number) => void
  /** 打 B 点：与已有 A 点组成 loopRange；若尚无 A 点则当作 A 点处理 */
  setLoopPointB: (measureId: number) => void
  /** 清掉 A/B 点与循环范围 */
  clearLoopPoints: () => void
  /**
   * LOOP A—B 按钮的三态循环：
   * 无 A 点 → 打 A；有 A 点 → 打 B 并成环；已有环 → 清除。
   * 返回本次动作，便于 UI 给出对应提示。
   */
  cycleLoopPoint: (measureId: number) => "A" | "B" | "clear"
  setMetronomeEnabled: (v: boolean) => void
  toggleMetronome: () => void
  setMetronomeVolume: (v: number) => void
}

const BPM_MIN = 50
const BPM_MAX = 180
const SPEED_CYCLE = [50, 75, 100] as const

/** BPM 夹紧到 [50, 180]；非有限值回落到下界 */
function clampBpm(value: number): number {
  if (!Number.isFinite(value)) return BPM_MIN
  return Math.max(BPM_MIN, Math.min(BPM_MAX, Math.round(value)))
}

/** 音量夹紧到 [0, 1] */
function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}

export const useTransportStore = create<TransportState>((set, get) => ({
  playing: false,
  bpm: 92,
  speedPercent: 75,
  looping: true,
  loopRange: null,
  loopPointA: null,
  metronomeEnabled: false,
  metronomeVolume: 0.25,

  setPlaying: (v) => set({ playing: v }),
  togglePlaying: () => set((s) => ({ playing: !s.playing })),
  setBpm: (v) => set({ bpm: clampBpm(v) }),
  adjustBpm: (delta) => set((s) => ({ bpm: clampBpm(s.bpm + delta) })),
  setSpeedPercent: (v) => set({ speedPercent: v > 0 ? v : 100 }),
  cycleSpeed: () =>
    set((s) => {
      const idx = SPEED_CYCLE.indexOf(s.speedPercent as (typeof SPEED_CYCLE)[number])
      const next = SPEED_CYCLE[(idx + 1) % SPEED_CYCLE.length]
      return { speedPercent: next }
    }),
  setLooping: (v) => set({ looping: v }),
  toggleLooping: () => set((s) => ({ looping: !s.looping })),
  setLoopRange: (range) => set({ loopRange: range }),

  setLoopPointA: (measureId) => set({ loopPointA: measureId, loopRange: null }),
  setLoopPointB: (measureId) =>
    set((s) => {
      if (s.loopPointA === null) return { loopPointA: measureId, loopRange: null }
      const startMeasureId = Math.min(s.loopPointA, measureId)
      const endMeasureId = Math.max(s.loopPointA, measureId)
      // 成环后必须把 loopPointA 清掉：它的语义是"已打 A、等待 B"的**中间态**。
      // 留着的话 UI 会同时画出"已成环的实心 A 标"和"待成环的虚线 A 标"，
      // 而且 looping 被手动关掉时会退化成一个假的打点态。
      return { loopPointA: null, loopRange: { startMeasureId, endMeasureId }, looping: true }
    }),
  clearLoopPoints: () => set({ loopPointA: null, loopRange: null }),

  cycleLoopPoint: (measureId) => {
    const state = get()
    if (state.loopRange) {
      state.clearLoopPoints()
      return "clear"
    }
    if (state.loopPointA === null) {
      state.setLoopPointA(measureId)
      return "A"
    }
    state.setLoopPointB(measureId)
    return "B"
  },

  setMetronomeEnabled: (v) => set({ metronomeEnabled: v }),
  toggleMetronome: () => set((s) => ({ metronomeEnabled: !s.metronomeEnabled })),
  setMetronomeVolume: (v) => set({ metronomeVolume: clampVolume(v) }),
}))
