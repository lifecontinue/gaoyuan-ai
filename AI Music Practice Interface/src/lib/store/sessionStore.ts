/**
 * Session Store — 练习会话状态
 *
 * 管理：flow 状态机、当前曲谱、当前小节、检测数据、AI 建议。
 * 这是整个练习过程的核心状态。
 *
 * ## §1.3 状态机护栏（Phase 2 补齐）
 * FlowState 的迁移过去完全没有校验，任何组件都能把状态改成任意值 ——
 * 一旦出现"从 idle 直接跳 reviewed"这种越级迁移，UI 会渲染出根本不该存在的分支，
 * 而且**没有任何报错**，只能靠人肉复现。
 * 现在把合法迁移表显式写出来，DEV 下越级迁移立刻在控制台报警
 * （`VITE_STRICT_FLOW=1` 时直接抛，便于在 CI 里把它当硬门槛）。
 * 生产构建里 `import.meta.env.DEV === false`，零开销。
 *
 * ## 高频数据不在这里
 * 小节内进度（measureProgress）已从本 store 移除 —— 它每帧都变，
 * 走 `TimelineBus`（§1.4）。这里只保留"小节切换 / 拍点切换"这类离散状态。
 */

import { create } from "zustand"
import type { Score, Chord } from "@/lib/music/types"
import type { PracticeAdvice } from "@/lib/coach/schema"
import type { DetectedChord, TimingOffset } from "@/lib/coach/agent"
import type { JudgementKind } from "@/lib/practice/types"

/** 练习流程状态机 */
export type FlowState =
  | "idle" // 初始/未开始
  | "requesting_mic" // 正在请求麦克风权限
  | "listening" // 已开始监听，等待演奏
  | "playing_along" // 已检测到合规演奏，正在跟随
  | "analyzing" // 正在调用 AI 分析
  | "streaming" // AI 建议正在流式输出
  | "reviewed" // AI 建议已输出完成
  | "error" // 错误（细分见 errorType）
  | "stopped" // 手动停止

/**
 * 错误细分。
 *
 * `audio_error` 与 `mic_error` 必须区分：UI 对 `mic_error` 会提供"切换到演示模式"的降级入口，
 * 而演示音源本身启动失败时再给这个入口，只会把用户导回刚刚失败的同一条路径。
 */
export type ErrorType = "mic_error" | "audio_error" | "network_error" | null

// ---------------------------------------------------------------------------
// §1.3 合法迁移表
// ---------------------------------------------------------------------------

/**
 * 合法迁移表：`from → 允许到达的 to 列表`。
 *
 * 通用规则（已内建，不必逐条列出）：
 *   - `from === to` 的自迁移一律合法（幂等重设）
 *   - `error` / `stopped` 是"随时可达"的逃生出口，因此几乎每个状态都列了它们
 *
 * `error → playing_along` 是**有意保留**的恢复路径：CoachPanel 的 network_error
 * 分支目前就是这么退回去的。该分支的语义重构排在 Phase 4 的 CoachPanel 重写里，
 * 此处先把它承认为合法迁移，避免制造无意义的告警噪音。
 */
export const FLOW_TRANSITIONS: Record<FlowState, readonly FlowState[]> = {
  idle: ["requesting_mic", "listening", "error", "stopped"],
  requesting_mic: ["listening", "idle", "error", "stopped"],
  listening: ["playing_along", "analyzing", "requesting_mic", "idle", "error", "stopped"],
  playing_along: [
    "analyzing",
    "streaming",
    "listening",
    "requesting_mic",
    "idle",
    "error",
    "stopped",
  ],
  analyzing: ["streaming", "reviewed", "playing_along", "error", "stopped"],
  streaming: ["reviewed", "analyzing", "error", "stopped"],
  reviewed: ["idle", "listening", "playing_along", "requesting_mic", "analyzing", "error", "stopped"],
  error: ["idle", "requesting_mic", "listening", "playing_along", "stopped"],
  stopped: ["idle", "requesting_mic", "listening", "error"],
}

/** 纯谓词：`from → to` 是否是一次合法迁移（自迁移恒合法） */
export function isLegalFlowTransition(from: FlowState, to: FlowState): boolean {
  if (from === to) return true
  return FLOW_TRANSITIONS[from].includes(to)
}

/** DEV 下才做校验；生产构建会被摇掉 */
const FLOW_ASSERT_ENABLED = Boolean(import.meta.env.DEV)
/** 置 `VITE_STRICT_FLOW=1` 后非法迁移直接抛异常（CI 硬门槛用） */
const FLOW_ASSERT_STRICT = import.meta.env.VITE_STRICT_FLOW === "1"

/**
 * §1.3 断言：非法迁移在 DEV 下报警。
 * @returns 是否合法（调用方仍会执行迁移，避免把 UI 卡死在半途状态）
 */
export function assertLegalFlowTransition(from: FlowState, to: FlowState): boolean {
  if (isLegalFlowTransition(from, to)) return true
  if (!FLOW_ASSERT_ENABLED) return false
  const message =
    `[sessionStore] 非法 FlowState 迁移: "${from}" → "${to}"。` +
    `合法目标: ${FLOW_TRANSITIONS[from].join(" | ") || "(无)"}。` +
    `若这是新增的合法路径，请同步更新 FLOW_TRANSITIONS，而不是绕过本断言。`
  if (FLOW_ASSERT_STRICT) throw new Error(message)
  console.warn(message)
  return false
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

/**
 * 实时反馈气泡状态（Phase 3-B）。
 *
 * 由编排层在「每小节第一个 onset」时写入（节流：同一小节至多 1 次），
 * UI 的 `FeedbackBubble` 直接读它渲染 5 种判定之一。
 */
export interface FeedbackState {
  /** 判定种类（perfect / good / early / late / miss） */
  kind: JudgementKind
  /** timing 偏差（ms），§1.2 符号：>0 抢拍、<0 拖拍 */
  offsetMs: number
  /** 该判定所属小节编号 */
  measureId: number
  /** 展示文案（FEEDBACK_TEXT 已含方向箭头） */
  message: string
}

interface SessionState {
  // 视图
  view: "practice" | "library"

  // flow 状态机
  flowState: FlowState
  errorType: ErrorType

  // 当前曲谱
  currentScore: Score | null

  // 曲谱跟随状态（**只放离散量**；小节内进度走 TimelineBus）
  currentMeasureId: number | null
  currentSectionId: string | null
  currentBeatIndex: number
  expectedChord: Chord | null

  // 检测数据（本次会话累积）
  detectedChords: DetectedChord[]
  timingOffsets: TimingOffset[]

  // AI 建议
  advice: PracticeAdvice | null
  /** 流式输出中的临时文本（打字机） */
  streamingText: string

  // 反馈（Phase 3-B：实时判定气泡，5 种 JudgementKind）
  lastFeedback: FeedbackState | null

  // actions
  setView: (v: "practice" | "library") => void
  setFlowState: (s: FlowState, errorType?: ErrorType) => void
  setCurrentScore: (s: Score | null) => void
  setFollowerState: (partial: {
    currentMeasureId?: number | null
    currentSectionId?: string | null
    currentBeatIndex?: number
    expectedChord?: Chord | null
  }) => void
  addDetectedChord: (d: DetectedChord) => void
  addTimingOffset: (t: TimingOffset) => void
  appendStreamingText: (delta: string) => void
  setAdvice: (a: PracticeAdvice | null) => void
  setLastFeedback: (f: SessionState["lastFeedback"]) => void
  resetSession: () => void
}

const initialFollower = {
  currentMeasureId: null as number | null,
  currentSectionId: null as string | null,
  currentBeatIndex: 0,
  expectedChord: null as Chord | null,
}

export const useSessionStore = create<SessionState>((set) => ({
  view: "practice",
  flowState: "idle",
  errorType: null,
  currentScore: null,
  ...initialFollower,
  detectedChords: [],
  timingOffsets: [],
  advice: null,
  streamingText: "",
  lastFeedback: null,

  setView: (v) => set({ view: v }),
  setFlowState: (s, errorType = null) =>
    set((prev) => {
      // 非法迁移仍然执行（不把 UI 卡在半途），但 DEV 下必定留下报警痕迹
      assertLegalFlowTransition(prev.flowState, s)
      return { flowState: s, errorType }
    }),
  setCurrentScore: (s) => set({ currentScore: s }),
  setFollowerState: (partial) => set(partial),
  addDetectedChord: (d) => set((s) => ({ detectedChords: [...s.detectedChords, d] })),
  addTimingOffset: (t) => set((s) => ({ timingOffsets: [...s.timingOffsets, t] })),
  appendStreamingText: (delta) => set((s) => ({ streamingText: s.streamingText + delta })),
  setAdvice: (a) => set({ advice: a }),
  setLastFeedback: (f) => set({ lastFeedback: f }),
  resetSession: () =>
    set({
      flowState: "idle",
      errorType: null,
      ...initialFollower,
      detectedChords: [],
      timingOffsets: [],
      advice: null,
      streamingText: "",
      lastFeedback: null,
    }),
}))
