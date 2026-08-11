/**
 * useScoreFollower — 曲谱跟随的**只读 + 命令**门面（Phase 2 重写）
 *
 * ## 为什么变薄了
 * 旧实现每次调用 `start()` 都 `new ScoreFollower(...)`，于是：
 *   1. 每个使用该 hook 的组件都会造出一个独立的跟随器，各跑各的时间轴；
 *   2. 用回调（onMeasureChange / onProgress）往 store 写 `measureProgress`，
 *      等于每帧 setState —— 直接违反 §1.4 渲染禁令。
 *
 * Phase 2 把"唯一的跟随器 + rAF 编排"收敛进 `usePracticeSession`（模块级单例），
 * 本 hook 只做两件事：暴露离散状态给 UI，转发播放命令。
 * 它可以被任意多个组件安全调用。
 */

import { useMemo } from "react"

import { formatClock } from "@/lib/audio/ScoreFollower"
import type { ScoreFollower } from "@/lib/audio/ScoreFollower"
import {
  computeBeatMs,
  computeTotalMs,
  pausePractice,
  peekPracticeFollower,
  playPractice,
  seekPracticeToMeasure,
  stopPractice,
  togglePractice,
} from "@/hooks/usePracticeSession"
import { resolveScore } from "@/lib/music/activeScore"
import type { Chord, Score } from "@/lib/music/types"
import { useSessionStore } from "@/lib/store/sessionStore"
import { useTransportStore } from "@/lib/store/transportStore"

export interface ScoreFollowerFacade {
  /** 底层跟随器（未创建时为 null；**不要**每帧从它读位置，那是 TimelineBus 的活） */
  follower: ScoreFollower | null
  /** 生效中的曲谱（已做兜底，恒非 null） */
  score: Score
  playing: boolean
  currentMeasureId: number | null
  currentSectionId: string | null
  currentBeatIndex: number
  expectedChord: Chord | null
  /** 全曲总时长（ms，按当前 bpm / 变速折算） */
  totalMs: number
  /** 全曲总时长的 `mm:ss` 文本 */
  totalClock: string
  /** 一拍毫秒数 */
  beatMs: number
  play: () => void
  pause: () => void
  toggle: () => void
  stop: () => void
  seekToMeasure: (measureId: number) => void
}

export function useScoreFollower(score: Score | null): ScoreFollowerFacade {
  const resolved = resolveScore(score)

  const playing = useTransportStore((s) => s.playing)
  const bpm = useTransportStore((s) => s.bpm)
  const speedPercent = useTransportStore((s) => s.speedPercent)

  const currentMeasureId = useSessionStore((s) => s.currentMeasureId)
  const currentSectionId = useSessionStore((s) => s.currentSectionId)
  const currentBeatIndex = useSessionStore((s) => s.currentBeatIndex)
  const expectedChord = useSessionStore((s) => s.expectedChord)

  const totalMs = useMemo(
    () => computeTotalMs(resolved, bpm, speedPercent),
    [resolved, bpm, speedPercent],
  )

  return {
    follower: peekPracticeFollower(),
    score: resolved,
    playing,
    currentMeasureId,
    currentSectionId,
    currentBeatIndex,
    expectedChord,
    totalMs,
    totalClock: formatClock(totalMs),
    beatMs: computeBeatMs(bpm, speedPercent),
    play: playPractice,
    pause: pausePractice,
    toggle: togglePractice,
    stop: stopPractice,
    seekToMeasure: seekPracticeToMeasure,
  }
}
