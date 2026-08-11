/**
 * useMetronome — 节拍器的**状态门面**（Phase 2 重写）
 *
 * ## 为什么这里没有任何发声代码
 * 旧实现在 hook 里 `new Metronome(...)` 并 `metronome.start()`，节拍器自带 scheduler
 * 与自己的一份 bpm —— 那是**第二套时间源**，改速或页面被 throttle 后必然和播放头分家
 * （与缺陷 D4 同源）。
 *
 * Phase 2 的分工：
 *   - 拍点：`ScoreFollower` 唯一产出（`BeatScheduler` 纯函数排期）
 *   - 发声：`Metronome.scheduleClick(atCtxSec, accent)` 纯执行
 *   - 编排：`usePracticeSession` 的 rAF 循环
 *   - 本 hook：只读开关状态 + 转发 store action，可被任意组件安全调用
 *
 * ## 串音提醒
 * 节拍器接在 `context.destination` 上，外放会被麦克风拾回污染音高检测。
 * 因此默认关闭、默认音量 0.25，UI 侧必须给出「建议佩戴耳机」提示。
 */

import type { Metronome } from "@/lib/audio/Metronome"
import { peekPracticeMetronome } from "@/hooks/usePracticeSession"
import { useTransportStore } from "@/lib/store/transportStore"

/** 外放时的串音提示文案（UI 直接用它，避免各处措辞不一致） */
export const METRONOME_CROSSTALK_HINT = "节拍器外放会被麦克风拾回，建议佩戴耳机"

export interface MetronomeFacade {
  /** 底层执行器（AudioEngine 尚未创建时为 null） */
  metronome: Metronome | null
  enabled: boolean
  volume: number
  /** 串音提示文案 */
  hint: string
  toggle: () => void
  setEnabled: (v: boolean) => void
  setVolume: (v: number) => void
}

export function useMetronome(): MetronomeFacade {
  const enabled = useTransportStore((s) => s.metronomeEnabled)
  const volume = useTransportStore((s) => s.metronomeVolume)
  const toggle = useTransportStore((s) => s.toggleMetronome)
  const setEnabled = useTransportStore((s) => s.setMetronomeEnabled)
  const setVolume = useTransportStore((s) => s.setMetronomeVolume)

  return {
    metronome: peekPracticeMetronome(),
    enabled,
    volume,
    hint: METRONOME_CROSSTALK_HINT,
    toggle,
    setEnabled,
    setVolume,
  }
}
