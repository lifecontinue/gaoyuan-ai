/**
 * 当前曲谱的统一兜底入口。
 *
 * TopBar / ControlBar / PracticeStage 都要在 `sessionStore.currentScore === null`
 * 时退回内置示例谱。把这个兜底集中在一处，避免三个组件各写一份、
 * 某天改了其中一处就出现"标题是 A 谱、时间轴是 B 谱"的错位。
 */

import { SLOW_DANCING_SCORE } from "@/lib/music/scores/slowDancing"
import type { Score } from "@/lib/music/types"

/** 未选曲时使用的内置示例谱 */
export const DEFAULT_SCORE: Score = SLOW_DANCING_SCORE

/** 取当前曲谱；为空时回落到内置示例谱（返回值恒非 null） */
export function resolveScore(score: Score | null | undefined): Score {
  return score ?? DEFAULT_SCORE
}
