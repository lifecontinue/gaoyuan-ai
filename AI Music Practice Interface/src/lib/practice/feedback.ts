/**
 * 反馈气泡节流（纯函数，DEVELOPMENT_PLAN §4 ④）
 *
 * 一条硬约束：同一小节内**最多弹 1 次气泡**（取该小节第一个 onset 的判定），
 * 避免一次扫弦 4 下 / 6 弦把界面刷爆。
 *
 * 把"取小节代表判定"抽成纯函数，便于单测；运行时（usePracticeSession）按小节调用它。
 */

import type { TimingJudgement } from "./types"

/**
 * 取某小节所有 onset 判定中的"代表气泡" —— 即**按起音时间最靠前**的那个。
 *
 * 因为同一小节的多个 onset 物理上几乎同时（扫弦 6 弦在 60ms 内），取第一个即代表
 * 该小节的整体表现；后续 onset 不再弹新气泡。空数组返回 null。
 */
export function pickMeasureBubble(judgements: readonly TimingJudgement[]): TimingJudgement | null {
  if (judgements.length === 0) return null
  let earliest = judgements[0]
  for (let i = 1; i < judgements.length; i += 1) {
    if (judgements[i].onsetTimeMs < earliest.onsetTimeMs) earliest = judgements[i]
  }
  return earliest
}

/** 反馈文案映射（供 UI 直接展示） */
export const FEEDBACK_TEXT: Record<TimingJudgement["kind"], string> = {
  perfect: "PERFECT",
  good: "GOOD",
  early: "EARLY ↗",
  late: "LATE ↘",
  miss: "MISS",
}
