/**
 * PracticeStage — 练习舞台
 *
 * 包含：TAB 谱渲染（三行×四列）、真实播放头、循环 A—B 标记、反馈气泡、控制栏。
 *
 * Phase 2 变更：
 *   - 删除 `flash` 定时器 mock 与 `activeId = currentMeasureId ?? 19` 硬编码，
 *     高亮小节完全由 ScoreFollower 驱动；
 *   - 播放头改为 **rAF + DOM transform**（订阅 TimelineBus），
 *     位置数据一帧都不进 React state（§1.4 渲染禁令）；
 *   - 弦高亮改为真实强拍脉冲（拍号 0），不再是 2400ms 的假闪烁。
 */

import { useEffect, useRef } from "react"

import { timelineBus } from "@/lib/audio/TimelineBus"
import { ControlBar } from "@/components/controls/ControlBar"
import { PitchMonitor } from "@/components/stage/PitchMonitor"
import { useAudioEngine } from "@/hooks/useAudioEngine"
import { usePitchDetection } from "@/hooks/usePitchDetection"
import { usePracticeSession, seekPracticeToMeasure } from "@/hooks/usePracticeSession"
import { FeedbackBubble } from "@/components/feedback/FeedbackBubble"
import { resolveScore } from "@/lib/music/activeScore"
import { flattenMeasures, type Measure, type Score } from "@/lib/music/types"
import { useSessionStore } from "@/lib/store/sessionStore"
import { useTransportStore } from "@/lib/store/transportStore"

/** 把 6 弦指法值转为显示字符 */
function fretLabel(v: number | "x"): string {
  return v === "x" ? "x" : String(v)
}

/** 小节在循环 A—B 中的角色（用于 CSS 标记） */
type LoopMark = "" | "loop-a" | "loop-b" | "loop-in" | "loop-a loop-armed"

/**
 * 播放头。
 *
 * 🚨 位置**绝不**经 React state：每帧 setState 会把整棵练习页重渲染，帧率直接崩。
 * 这里订阅 TimelineBus，在回调里直接改 `transform` —— 合成层位移，零布局重排。
 * 只接受属于本小节的帧，避免小节切换的那一帧出现"旧小节播放头闪回起点"。
 */
function Playhead({ measureId }: { measureId: number }) {
  const trackRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = trackRef.current
    if (!el) return
    return timelineBus.subscribe((frame) => {
      if (frame.position.measureId !== measureId) return
      const ratio = Math.min(1, Math.max(0, frame.position.progress))
      el.style.transform = `translate3d(${(ratio * 100).toFixed(3)}%, 0, 0)`
    })
  }, [measureId])

  return (
    <div className="playhead">
      <div className="playhead-track" ref={trackRef}>
        <i />
      </div>
    </div>
  )
}

interface TabMeasureProps {
  measure: Measure
  active: boolean
  /** 是否正处在本小节的强拍（真实拍点，非 mock 闪烁） */
  downbeat: boolean
  loopMark: LoopMark
  onSelect: (measureId: number) => void
}

/** 单个小节的 TAB 渲染 */
function TabMeasure({ measure, active, downbeat, loopMark, onSelect }: TabMeasureProps) {
  const strings = measure.chord.guitarFingering?.strings ?? ["x", "x", "x", "x", "x", "x"]
  const flagLabel = loopMark.startsWith("loop-a") ? "A" : loopMark === "loop-b" ? "B" : null

  return (
    <div
      className={`measure ${active ? "measure-active" : ""} ${loopMark}`.trim()}
      onClick={() => onSelect(measure.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onSelect(measure.id)
        }
      }}
      aria-label={`跳到第 ${measure.id} 小节（${measure.chord.name}）`}
    >
      {flagLabel && <span className="loop-flag">{flagLabel}</span>}
      <div className="measure-head">
        <span>BAR {measure.id}</span>
        <strong>{measure.chord.name}</strong>
      </div>
      <div className="tab-lines">
        {strings.map((note, i) => (
          <div className="tab-line" key={i}>
            <span className={downbeat && i > 1 && i < 5 ? "hit-note" : ""}>{fretLabel(note)}</span>
          </div>
        ))}
      </div>
      {active && <Playhead measureId={measure.id} />}
    </div>
  )
}

/** 把小节数组按 n 个一组分块 */
function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size))
  }
  return result
}

/** 这些流程状态下应当保持实时采集 */
const LISTENING_FLOW_STATES = new Set(["listening", "playing_along"])

export function PracticeStage() {
  const currentScore = useSessionStore((s) => s.currentScore) as Score | null
  const currentMeasureId = useSessionStore((s) => s.currentMeasureId)
  const currentBeatIndex = useSessionStore((s) => s.currentBeatIndex)
  const flowState = useSessionStore((s) => s.flowState)

  const playing = useTransportStore((s) => s.playing)
  const looping = useTransportStore((s) => s.looping)
  const loopRange = useTransportStore((s) => s.loopRange)
  const loopPointA = useTransportStore((s) => s.loopPointA)

  // Phase 1: 真实拾音。engine 由 audioStore.engineReady 驱动（缺陷 D3 已修复）。
  const { engine } = useAudioEngine()
  usePitchDetection(engine, LISTENING_FLOW_STATES.has(flowState))

  const score = resolveScore(currentScore)
  // Phase 2: 唯一的时间轴编排层（follower / metronome / TimelineBus 都在里面）
  usePracticeSession(score)

  const measures = flattenMeasures(score.sections)
  const rows = chunk(measures, 4)
  // 未开播时落在首小节 —— 不再是设计稿遗留的 19
  const activeId = currentMeasureId ?? measures[0]?.id ?? null

  const activeLoop = looping ? loopRange : null

  const loopMarkFor = (measure: Measure): LoopMark => {
    if (activeLoop) {
      if (measure.id === activeLoop.startMeasureId) return "loop-a"
      if (measure.id === activeLoop.endMeasureId) return "loop-b"
      if (measure.id > activeLoop.startMeasureId && measure.id < activeLoop.endMeasureId) {
        return "loop-in"
      }
      return ""
    }
    return loopPointA === measure.id ? "loop-a loop-armed" : ""
  }

  return (
    <section className="practice-stage">
      <div className="score-zone">
        <div className="three-row-score">
          {rows.map((row, i) => (
            <div className={`measure-rail row-${i + 1}`} key={i}>
              {row.map((m) => (
                <TabMeasure
                  key={m.id}
                  measure={m}
                  active={m.id === activeId}
                  downbeat={playing && m.id === activeId && currentBeatIndex === 0}
                  loopMark={loopMarkFor(m)}
                  onSelect={seekPracticeToMeasure}
                />
              ))}
            </div>
          ))}
        </div>
        <FeedbackBubble />
      </div>
      <PitchMonitor />
      <ControlBar />
    </section>
  )
}
