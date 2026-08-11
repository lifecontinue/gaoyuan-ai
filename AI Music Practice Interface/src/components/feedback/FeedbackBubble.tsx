/**
 * FeedbackBubble — Phase 3-B 实时判定气泡
 *
 * 读 `sessionStore.lastFeedback`（编排层在「每小节第一个 onset」写入，节流：同一小节至多 1 次），
 * 渲染 5 种判定之一。方向可辨：early 用 ↗（抢拍）、late 用 ↘（拖拍），配合颜色与文案。
 *
 * ⚠️ 本身是低频离散状态（≤0.38Hz），不在 §1.4 的「每帧禁写 store」禁令内。
 */

import { useSessionStore } from "@/lib/store/sessionStore"
import type { JudgementKind } from "@/lib/practice/types"

/** 5 种判定对应的教练提示（给「下一步怎么做」，与 FEEDBACK_TEXT 的方向箭头互补） */
const FEEDBACK_HINT: Record<JudgementKind, string> = {
  perfect: "Locked the pocket",
  good: "Right on it",
  early: "Rushed — ease the next strum",
  late: "Dragged — push the next strum",
  miss: "No note detected",
}

export function FeedbackBubble() {
  const feedback = useSessionStore((s) => s.lastFeedback)
  if (!feedback) return null

  return (
    <div className={`feedback-pop feedback-${feedback.kind}`} aria-live="polite">
      <span>{feedback.message}</span>
      <em className="feedback-hint">{FEEDBACK_HINT[feedback.kind]}</em>
    </div>
  )
}
