/**
 * ControlBar — 播放控制栏
 *
 * 包含：循环开关、播放/暂停、BPM±、SLOW PRACTICE、LOOP A—B、节拍器。
 *
 * Phase 2 变更：
 *   - 播放键改调 `togglePractice()` —— 它会在**用户手势的同步栈内** resume AudioContext，
 *     这是浏览器自动播放策略的硬性要求，塞进 await 之后就会静默失败；
 *   - LOOP A—B 从死按钮变成真实的三态打点（打 A → 打 B 成环 → 清除），
 *     打点基准是当前跟随到的小节；
 *   - 新增节拍器开关，默认关闭并附带串音提示。
 */

import { LoopIcon, MetronomeIcon, PauseIcon, PlayIcon } from "@/components/common/Icon"
import { useMetronome } from "@/hooks/useMetronome"
import { togglePractice } from "@/hooks/usePracticeSession"
import { resolveScore } from "@/lib/music/activeScore"
import { flattenMeasures } from "@/lib/music/types"
import { useSessionStore } from "@/lib/store/sessionStore"
import { useTransportStore } from "@/lib/store/transportStore"

export function ControlBar() {
  const playing = useTransportStore((s) => s.playing)
  const bpm = useTransportStore((s) => s.bpm)
  const adjustBpm = useTransportStore((s) => s.adjustBpm)
  const speedPercent = useTransportStore((s) => s.speedPercent)
  const cycleSpeed = useTransportStore((s) => s.cycleSpeed)
  const looping = useTransportStore((s) => s.looping)
  const toggleLooping = useTransportStore((s) => s.toggleLooping)
  const loopRange = useTransportStore((s) => s.loopRange)
  const loopPointA = useTransportStore((s) => s.loopPointA)
  const cycleLoopPoint = useTransportStore((s) => s.cycleLoopPoint)

  const currentScore = useSessionStore((s) => s.currentScore)
  const currentMeasureId = useSessionStore((s) => s.currentMeasureId)

  const metronome = useMetronome()

  // 打点基准：优先用当前跟随到的小节，未开播时退回首小节
  const measures = flattenMeasures(resolveScore(currentScore).sections)
  const anchorMeasureId = currentMeasureId ?? measures[0]?.id ?? null

  const loopLabel = loopRange
    ? `LOOP ${loopRange.startMeasureId}—${loopRange.endMeasureId}`
    : loopPointA !== null
      ? `A ${loopPointA} · SET B`
      : "LOOP A—B"

  const loopStateClass = loopRange ? "is-looping" : loopPointA !== null ? "is-armed" : ""

  const loopTitle = loopRange
    ? `循环第 ${loopRange.startMeasureId}—${loopRange.endMeasureId} 小节，点击清除`
    : loopPointA !== null
      ? `已标记 A = 第 ${loopPointA} 小节，点击在第 ${anchorMeasureId ?? "?"} 小节标记 B`
      : `点击在第 ${anchorMeasureId ?? "?"} 小节标记 A 点`

  return (
    <div className="controls">
      <div className="control-chunk playback-chunk">
        <button className="control-icon" onClick={toggleLooping} aria-label="Loop current segment">
          <LoopIcon active={looping} />
        </button>
        <button
          className="play-button"
          onClick={togglePractice}
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? <PauseIcon /> : <PlayIcon />}
        </button>
      </div>
      <div className="control-chunk tempo-chunk">
        <button className="control-icon" onClick={() => adjustBpm(-2)} aria-label="Decrease BPM">
          −
        </button>
        <div className="tempo-readout">
          <b>
            {bpm} <em>BPM</em>
          </b>
        </div>
        <button className="control-icon" onClick={() => adjustBpm(2)} aria-label="Increase BPM">
          +
        </button>
      </div>
      <div className="control-chunk practice-chunk">
        <button className="slow-button" onClick={cycleSpeed}>
          <span>◴</span> SLOW PRACTICE <b>{speedPercent}%</b>
        </button>
        <button
          className={`section-button ${loopStateClass}`.trim()}
          onClick={() => {
            if (anchorMeasureId !== null) cycleLoopPoint(anchorMeasureId)
          }}
          disabled={anchorMeasureId === null}
          title={loopTitle}
          aria-label="Set loop points"
        >
          {loopLabel}
        </button>
        <button
          className={`control-icon metronome-button ${metronome.enabled ? "is-on" : ""}`.trim()}
          onClick={metronome.toggle}
          title={`节拍器${metronome.enabled ? "开" : "关"} · ${metronome.hint}`}
          aria-label="Toggle metronome"
          aria-pressed={metronome.enabled}
        >
          <MetronomeIcon active={metronome.enabled} />
        </button>
      </div>
    </div>
  )
}
