/**
 * usePitchDetection — 实时音高检测循环（Phase 1 重写）
 *
 * 设计要点：
 *   1. **rAF 而非 setInterval**：骨架里的 `setInterval(tick, 30)` 在后台标签页会被
 *      throttle 到 1Hz 且不通知；rAF 会自动暂停且可感知，页面回前台自动恢复。
 *   2. 循环内用 `performance.now()` 与 `lastHopMs` 比较，节流到 HOP_MS（≈21.3ms）。
 *   3. 产出的每帧 `AudioFrame` **只发到 AudioBus**，绝不每帧写 zustand（§1.4）。
 *   4. 只有「首次确认到音」这种**离散事件**才写 sessionStore（listening → playing_along）。
 *      这条正是 Phase 0 里那个 1700ms setTimeout mock 的真实替代物。
 */

import { useEffect } from "react"
import { AnalysisPipeline } from "@/lib/audio/AnalysisPipeline"
import { audioBus } from "@/lib/audio/AudioBus"
import type { AudioEngine } from "@/lib/audio/AudioEngine"
import { HOP_MS, STORE_LEVEL_INTERVAL_MS } from "@/lib/audio/constants"
import { useAudioStore } from "@/lib/store/audioStore"
import { useSessionStore } from "@/lib/store/sessionStore"

/**
 * 启动 / 停止实时检测循环。
 *
 * @param engine 引擎实例（未就绪时传 null）
 * @param active 是否应当采集（通常绑定 flowState）
 */
export function usePitchDetection(engine: AudioEngine | null, active: boolean): void {
  useEffect(() => {
    if (!engine || !active) return

    const pipeline = new AnalysisPipeline({ sampleRate: engine.context.sampleRate })
    const audio = useAudioStore.getState()
    audio.setDetecting(true)

    let rafId = 0
    let lastHopMs = Number.NEGATIVE_INFINITY
    let lastStoreMs = Number.NEGATIVE_INFINITY
    let cancelled = false

    const tick = (nowMs: number): void => {
      if (cancelled) return
      rafId = requestAnimationFrame(tick)

      // rAF 通常 16.7ms 一次，这里节流到 HOP_MS ≈ 21.3ms（≈47 帧/秒）
      if (nowMs - lastHopMs < HOP_MS) return
      lastHopMs = nowMs

      // AudioContext 被浏览器 suspend 时不产帧（§1.5 降级表）
      if (engine.context.state !== "running") return

      const timeDomain = engine.readTimeDomain()
      const spectrumDb = engine.readFrequencyDb()
      const frame = pipeline.processFrame(
        timeDomain,
        spectrumDb,
        engine.context.sampleRate,
        engine.now(),
      )

      // 高频通道：只发总线
      audioBus.emitFrame(frame)

      // 低频通道：粗粒度电平，250ms 一次
      if (nowMs - lastStoreMs >= STORE_LEVEL_INTERVAL_MS) {
        lastStoreMs = nowMs
        useAudioStore.getState().setInputLevelDb(frame.levelDb)
      }

      // 离散事件：检测到第一个稳定音 → listening 迁移到 playing_along
      if (frame.confirmedNote?.isNew) {
        const session = useSessionStore.getState()
        if (session.flowState === "listening") {
          session.setFlowState("playing_along")
        }
      }
    }

    rafId = requestAnimationFrame(tick)

    return () => {
      cancelled = true
      cancelAnimationFrame(rafId)
      pipeline.reset()
      audioBus.clear()
      useAudioStore.getState().setDetecting(false)
    }
  }, [engine, active])
}
