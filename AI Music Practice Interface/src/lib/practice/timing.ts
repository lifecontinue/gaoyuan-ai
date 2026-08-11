/**
 * timing — 拍点对齐与 timing 判定的**纯函数**（DEVELOPMENT_PLAN §1.2）
 *
 * 从 ScoreFollower 里抽出来单独放，理由有二：
 *   1. 判定规则是产品语义的核心（PERFECT/GOOD/EARLY/LATE 的边界），必须能被穷举单测；
 *   2. ScoreFollower 有内部时钟状态，混在一起会让"判定是否正确"依赖"时钟是否正确"，
 *      一旦出错无法二分定位。
 *
 * 符号约定（**全局唯一真源**，与 constants.ts 注释一致）：
 *   offsetMs = expectedMs - actualMs
 *     > 0 → 提前（抢拍 / EARLY ↗）
 *     < 0 → 滞后（拖拍 / LATE ↘）
 */

import {
  TIMING_GOOD_MS,
  TIMING_PERFECT_MS,
  TIMING_WINDOW_MS,
} from "@/lib/audio/constants"
import type { JudgementKind } from "./types"

/**
 * 把 timing 偏差归类。
 *
 * @param offsetMs `expectedMs - actualMs`
 * @returns 判定种类；超出 ±TIMING_WINDOW_MS 返回 null（= 噪声，**不计入任何统计**）
 */
export function classifyOffset(offsetMs: number): JudgementKind | null {
  if (!Number.isFinite(offsetMs)) return null
  const abs = Math.abs(offsetMs)
  if (abs <= TIMING_PERFECT_MS) return "perfect"
  if (abs <= TIMING_GOOD_MS) return "good"
  if (abs <= TIMING_WINDOW_MS) return offsetMs > 0 ? "early" : "late"
  return null
}

/**
 * 在均匀拍格上找离 `timeMs` **最近**的拍点时刻。
 *
 * 曲谱内所有小节共用同一个 `beatDurMs`（变速由 ScoreFollower 统一折算），
 * 因此全局拍格就是 `k * beatDurMs`，取整即可，无需遍历小节。
 *
 * @param timeMs    实际起音的音乐时刻（ms，已扣分析延迟）
 * @param beatDurMs 一拍毫秒数
 * @returns 最近拍点的音乐时刻（ms）；beatDurMs 非法时原样返回 timeMs
 */
export function nearestBeatMs(timeMs: number, beatDurMs: number): number {
  if (!(beatDurMs > 0) || !Number.isFinite(beatDurMs)) return timeMs
  const k = Math.max(0, Math.round(timeMs / beatDurMs))
  return k * beatDurMs
}

/**
 * 对一个 onset 求 timing 偏差（ms）。
 *
 * 🚨 变异守卫点：这里若把 `expected - actual` 写成 `actual - expected`，
 * `offlineRunner.test.ts` 的"延迟 120ms 演奏 → median ∈ [-135,-105]"用例会立刻变红。
 */
export function timingOffsetMs(expectedMs: number, actualMs: number): number {
  return expectedMs - actualMs
}
