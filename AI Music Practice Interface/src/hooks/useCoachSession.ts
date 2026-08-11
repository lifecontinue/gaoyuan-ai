/**
 * useCoachSession — AI 教练会话
 *
 * Phase 0: 骨架。Phase 3 实现完整流式调用。
 * 收集 SessionSnapshot → 调 analyzeCoachSession → 流式推入 sessionStore。
 */

import { useCallback } from "react"
import { useSessionStore } from "@/lib/store/sessionStore"
import { useTransportStore } from "@/lib/store/transportStore"
import { analyzeCoachSession, type SessionSnapshot } from "@/lib/coach/agent"
import type { Score } from "@/lib/music/types"

export function useCoachSession() {
  const setFlowState = useSessionStore((s) => s.setFlowState)
  const appendStreamingText = useSessionStore((s) => s.appendStreamingText)
  const setAdvice = useSessionStore((s) => s.setAdvice)
  const detectedChords = useSessionStore((s) => s.detectedChords)
  const timingOffsets = useSessionStore((s) => s.timingOffsets)
  const bpm = useTransportStore((s) => s.bpm)
  const speedPercent = useTransportStore((s) => s.speedPercent)

  const analyze = useCallback(
    async (score: Score, practicedMeasures: number[], durationSec: number) => {
      setFlowState("analyzing")

      const snapshot: SessionSnapshot = {
        score,
        practicedMeasures,
        detectedChords,
        timingOffsets,
        bpm,
        speedPercent,
        durationSec,
      }

      setFlowState("streaming")
      try {
        for await (const chunk of analyzeCoachSession(snapshot)) {
          if (chunk.delta) {
            appendStreamingText(chunk.delta)
          }
          if (chunk.done) {
            if (chunk.advice) {
              setAdvice(chunk.advice)
            }
            setFlowState("reviewed")
          }
        }
      } catch {
        setFlowState("error", "network_error")
      }
    },
    [
      setFlowState,
      appendStreamingText,
      setAdvice,
      detectedChords,
      timingOffsets,
      bpm,
      speedPercent,
    ],
  )

  return { analyze }
}
