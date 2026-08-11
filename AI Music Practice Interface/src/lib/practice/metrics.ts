/**
 * metrics — 四维评分公式（DEVELOPMENT_PLAN §1.7，唯一真源）
 *
 * 关键架构决策：四项 metrics 与 overallScore 由前端**本地确定性计算**，不交给 LLM。
 * LLM 只负责文字建议；本地算的分经 zod 校验后**覆盖** LLM 返回的数字（可复现、可回归）。
 *
 * 全部为纯函数、无副作用、无 Web Audio 依赖，必须有单测。
 */

import type { PracticeMetrics, SessionAnalytics } from "./types"

/** 区间夹紧 */
export function clamp(value: number, lo: number, hi: number): number {
  if (value < lo) return lo
  if (value > hi) return hi
  return value
}

/** 算术平均（空数组返回 0） */
export function mean(values: readonly number[]): number {
  if (values.length === 0) return 0
  let sum = 0
  for (const v of values) sum += v
  return sum / values.length
}

/** 样本标准差（空数组返回 0） */
export function stdev(values: readonly number[]): number {
  if (values.length === 0) return 0
  const m = mean(values)
  let sumSq = 0
  for (const v of values) sumSq += (v - m) * (v - m)
  return Math.sqrt(sumSq / values.length)
}

/**
 * 单个 onset 的 timing 评分（§1.7 ②）。
 *   |Δ| ≤ 40ms → 100 分；|Δ| = 160ms → 0 分；线性过渡。
 *
 * @param deltaMs Δ = expectedMs - actualMs（§1.2 符号）
 */
export function timingScore(deltaMs: number): number {
  const abs = Math.abs(deltaMs)
  return clamp(100 - Math.max(0, abs - 40) * (100 / 120), 0, 100)
}

/**
 * 由原始累积统计计算四维评分。
 *
 * 公式（§1.7）：
 *   rhythmStability = mean(timingScore(Δ))                         // 无 onset → 0
 *   chordClarity   = mean(有效小节 chordConfidence) × 100          // 无活动 → 0
 *   pitchAccuracy  = mean(有效小节 pitchAccuracy)                  // 无活动 → 0
 *   consistency    = clamp(100 - stdev(perMeasure) × 2, 0, 100)
 *                    perMeasure_i = 0.5·pitchAccuracy_i + 0.5·rhythmStability_i
 *   overallScore   = round(0.35·pitch + 0.30·rhythm + 0.20·chord + 0.15·consistency)
 */
export function computeMetrics(analytics: SessionAnalytics): PracticeMetrics {
  const rhythmStability =
    analytics.timingOffsets.length === 0
      ? 0
      : mean(analytics.timingOffsets.map(timingScore))

  const active = analytics.measures.filter((m) => m.hasActivity)
  const chordClarity = active.length === 0 ? 0 : mean(active.map((m) => m.chordConfidence)) * 100
  const pitchAccuracy = active.length === 0 ? 0 : mean(active.map((m) => m.pitchAccuracy))

  const perMeasure = active.map((m) => 0.5 * m.pitchAccuracy + 0.5 * m.rhythmStability)
  const consistency = active.length === 0 ? 0 : clamp(100 - stdev(perMeasure) * 2, 0, 100)

  const overallScore = Math.round(
    0.35 * pitchAccuracy + 0.3 * rhythmStability + 0.2 * chordClarity + 0.15 * consistency,
  )

  return { pitchAccuracy, rhythmStability, chordClarity, consistency, overallScore }
}
