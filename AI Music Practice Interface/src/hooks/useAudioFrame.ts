/**
 * useAudioFrame — 以受控频率消费 AudioBus 的每帧数据（DEVELOPMENT_PLAN §1.4）
 *
 * 分析循环以 ≈47Hz 产帧，但 **UI 更新频率上限是 20Hz**。
 * 本 hook 用 rAF 轮询 `audioBus.getSnapshot()` 并按 `minIntervalMs` 节流，
 * 同一帧对象不会触发重复 setState（引用相等即跳过）。
 *
 * 为什么不用 `useSyncExternalStore(bus.subscribe, ...)`：
 * 直接订阅会让每一帧都进入 React 调度（47Hz 全树对账），节流必须发生在 setState **之前**。
 * rAF 轮询天然满足这一点，且页面隐藏时自动停止。
 */

import { useEffect, useState } from "react"
import { audioBus } from "@/lib/audio/AudioBus"
import { UI_UPDATE_INTERVAL_MS } from "@/lib/audio/constants"
import type { AudioFrame } from "@/lib/audio/types"

/**
 * @param minIntervalMs 最小刷新间隔（默认 50ms = 20Hz）
 * @returns 最近一帧；无数据时为 null
 */
export function useAudioFrame(minIntervalMs: number = UI_UPDATE_INTERVAL_MS): AudioFrame | null {
  const [frame, setFrame] = useState<AudioFrame | null>(() => audioBus.getSnapshot())

  useEffect(() => {
    let rafId = 0
    let lastMs = Number.NEGATIVE_INFINITY
    let cancelled = false

    const tick = (nowMs: number): void => {
      if (cancelled) return
      rafId = requestAnimationFrame(tick)
      if (nowMs - lastMs < minIntervalMs) return
      lastMs = nowMs
      const snapshot = audioBus.getSnapshot()
      setFrame((previous) => (previous === snapshot ? previous : snapshot))
    }

    rafId = requestAnimationFrame(tick)
    return () => {
      cancelled = true
      cancelAnimationFrame(rafId)
    }
  }, [minIntervalMs])

  return frame
}
