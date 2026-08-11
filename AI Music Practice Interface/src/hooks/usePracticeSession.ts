/**
 * usePracticeSession — Phase 2 编排层
 *
 * 把 AudioEngine（时钟 / AudioContext）、ScoreFollower（时间轴）、Metronome（发声执行器）、
 * transportStore（播放意图）、sessionStore（离散跟随状态）、TimelineBus（高频播放头）
 * 串成一条链。**整个应用只应挂载一次**（PracticeStage 里）。
 *
 * ## 三条硬约束
 *
 * 1. **单一时间源（修缺陷 D4）**
 *    ScoreFollower 与 Metronome 共用 `AudioContext.currentTime`：
 *    follower 用 `createAudioContextClock(() => ctx.currentTime)` 算 elapsedMs，
 *    节拍点再用同一个 `clockSec` 换算成 `osc.start(t)` 的绝对时刻。
 *    本文件**不得出现** `performance.now()` / `Date.now()`。
 *
 * 2. **播放头渲染禁令（§1.4）**
 *    位置每帧都变（≈60Hz），只能经 `TimelineBus` 发布，由订阅方直接改 DOM transform。
 *    只有"小节切换 / 拍点切换"这类**离散**事件才写 zustand —— 4/4 @ BPM 92 下
 *    拍点约 1.5Hz、小节约 0.38Hz，对 store 完全无压力。
 *
 * 3. **AudioContext 只能在用户手势里 resume**
 *    因此 `playPractice()` 是一个**同步**函数：先 `engine.start()`，再置 `playing`。
 *    UI 必须在 onClick 里直接调它，不能塞进 await 之后。
 */

import { useEffect, useRef } from "react"

import { collectDueBeats, initialBeatCursor } from "@/lib/audio/BeatScheduler"
import { Metronome } from "@/lib/audio/Metronome"
import {
  ScoreFollower,
  beatDurationMs,
  positionAt,
  totalDurationMs,
  type LoopRange,
} from "@/lib/audio/ScoreFollower"
import { audioBus } from "@/lib/audio/AudioBus"
import { timelineBus } from "@/lib/audio/TimelineBus"
import { createAudioContextClock } from "@/lib/audio/testing/virtualClock"
import { getAudioEngine, peekAudioEngine } from "@/hooks/useAudioEngine"
import { flattenMeasures, findSectionByMeasure, type Score } from "@/lib/music/types"
import { useSessionStore } from "@/lib/store/sessionStore"
import { useTransportStore, type LoopRange as StoreLoopRange } from "@/lib/store/transportStore"
import { ChordRecognizer } from "@/lib/audio/ChordRecognizer"
import type { AudioFrame } from "@/lib/audio/types"
import { PracticeCollector } from "@/lib/practice/collector"
import { FEEDBACK_TEXT, pickMeasureBubble } from "@/lib/practice/feedback"
import type { TimingJudgement } from "@/lib/practice/types"

// ---------------------------------------------------------------------------
// 模块级单例（React 生命周期之外 —— 与 AudioEngine 同样的理由，见 useAudioEngine 的 D3 注释）
// ---------------------------------------------------------------------------

let follower: ScoreFollower | null = null
let followerScoreId: string | null = null
let metronome: Metronome | null = null
let metronomeContext: AudioContext | null = null

let rafHandle: number | null = null
/** 节拍器排期游标：已排到第几个全局拍（-1 = 还没排过） */
let beatCursor = -1
/** 上一次写入 store 的离散状态，用于去重（绝不每帧写 zustand） */
let lastMeasureId: number | null = null
let lastBeatIndex = -1

// ---------------------------------------------------------------------------
// 实时判定与反馈采集（Phase 3-B）
// ---------------------------------------------------------------------------

let practiceCollector: PracticeCollector | null = null
let chordRecognizer: ChordRecognizer | null = null
/** 每小节的判定缓冲（用于取"代表气泡"），key = measureId */
let feedbackBuffer = new Map<number, TimingJudgement[]>()
/** 已冲刷过气泡的小节（保证同一小节至多 1 次气泡，即使暂停后继续） */
let flushedMeasures = new Set<number>()
/** 当前正在累积判定的小节 */
let feedbackMeasureId: number | null = null
/** 音频帧 musicTimeMs → 曲谱相对时刻的偏移（播放起点校准，见 ingestDetectionFrame） */
let playbackShiftMs: number | null = null
/** audioBus 订阅退订函数 */
let feedbackUnsub: (() => void) | null = null

/** 单音音准分：|cents| ≤ 10 → 100 分，40 cents 处归零，线性过渡（与 offlineRunner 同口径） */
function centsToScore(centsOffValue: number): number {
  return Math.max(0, Math.min(100, 100 - Math.max(0, Math.abs(centsOffValue) - 10) * (100 / 30)))
}

/** 重置实时判定采集状态（切歌 / 停止 / 重新开始时调用） */
function resetFeedbackState(): void {
  practiceCollector = new PracticeCollector()
  feedbackBuffer.clear()
  flushedMeasures.clear()
  feedbackMeasureId = null
  playbackShiftMs = null
  if (chordRecognizer) chordRecognizer.setExpected(null)
}

/** 冲刷"当前正在累积"的小节：取代表判定写入 lastFeedback（暂停时保留显示） */
function flushCurrentFeedback(): void {
  if (feedbackMeasureId === null) return
  if (flushedMeasures.has(feedbackMeasureId)) return
  const cur = feedbackBuffer.get(feedbackMeasureId)
  if (cur && cur.length > 0) {
    const rep = pickMeasureBubble(cur)
    if (rep) {
      useSessionStore.getState().setLastFeedback({
        kind: rep.kind,
        offsetMs: rep.offsetMs,
        measureId: rep.measureId,
        message: FEEDBACK_TEXT[rep.kind],
      })
    }
  }
  flushedMeasures.add(feedbackMeasureId)
  feedbackBuffer.delete(feedbackMeasureId)
}

/**
 * 把一帧音频分析结果喂入判定链（follower → collector），并在小节切换时冲刷反馈气泡。
 *
 * ⚠️ 关键校准：live 路径的 `frame.musicTimeMs` 是 **绝对** 声学时刻
 * （= `ctx.currentTime*1000 - latency`），而曲谱小节是从 t=0 起算的。
 * 直接拿它给 `positionAt` 会把判定归到错误的小节。因此首帧时以
 * `frame.musicTimeMs - follower.elapsedMs()` 反推一个偏移，使后续帧的
 * 相对时刻与 follower 时间轴（elapsedMs）对齐 —— 这样气泡才贴在当前演奏的小节上。
 */
function ingestDetectionFrame(frame: AudioFrame): void {
  if (!follower) return
  if (playbackShiftMs === null) {
    playbackShiftMs = frame.musicTimeMs - follower.elapsedMs()
  }
  const relMusicMs = frame.musicTimeMs - playbackShiftMs
  const relOnsetMs = frame.onsetTimeMs - playbackShiftMs
  const relFrame: AudioFrame = { ...frame, musicTimeMs: relMusicMs, onsetTimeMs: relOnsetMs }

  if (!practiceCollector) practiceCollector = new PracticeCollector()
  if (!chordRecognizer) chordRecognizer = new ChordRecognizer()

  const pos = positionAt(
    follower.measuresList,
    follower.currentBpm,
    follower.currentSpeedPercent,
    follower.currentLoop,
    relMusicMs,
  )
  const expectedChord = follower.measuresList[pos.measureIndex]?.chord ?? null
  chordRecognizer.setExpected(expectedChord)
  const chordMatch =
    expectedChord && relFrame.aboveGate
      ? chordRecognizer.recognizeFromChroma(relFrame.chroma, expectedChord)
      : null

  const judgements = follower.ingestFrame(relFrame)
  practiceCollector.ingestJudgements(judgements)
  practiceCollector.ingestFrame({
    measureId: pos.measureId,
    hasActivity: relFrame.aboveGate,
    chroma: relFrame.chroma,
    expectedChord,
    chordMatch,
    centsScore: relFrame.confirmedNote ? centsToScore(relFrame.confirmedNote.centsOff) : null,
  })

  for (const j of judgements) {
    const arr = feedbackBuffer.get(j.measureId) ?? []
    arr.push(j)
    feedbackBuffer.set(j.measureId, arr)
  }

  // 小节切换：冲刷上一小节的"代表气泡"（同一小节至多 1 次）
  if (pos.measureId !== feedbackMeasureId) {
    if (feedbackMeasureId !== null) flushCurrentFeedback()
    feedbackMeasureId = pos.measureId
  }
}

/** 把 store 的循环范围（按 measureId）转成 follower 的形状 */
function toFollowerLoop(range: StoreLoopRange | null, looping: boolean): LoopRange | null {
  if (!looping || !range) return null
  return { startId: range.startMeasureId, endId: range.endMeasureId }
}

/** 重置节拍器排期游标（改速 / seek / 启停后必须调，否则会残留旧速度的幽灵拍） */
function resetBeatCursor(): void {
  if (!follower) {
    beatCursor = -1
    return
  }
  beatCursor = initialBeatCursor(follower.elapsedMs(), follower.beatDurMs)
}

// ---------------------------------------------------------------------------
// 单例装配
// ---------------------------------------------------------------------------

/**
 * 取得（或创建）当前曲谱的 ScoreFollower。
 *
 * ⚠️ 会顺带创建 AudioEngine（进而创建 AudioContext）。因此只在**用户已经交互过**
 * 之后调用（play / seek），不要在组件 mount 时无条件调用 —— 否则浏览器会在控制台
 * 抱怨"AudioContext was not allowed to start"。
 */
function ensureFollower(score: Score): ScoreFollower {
  if (follower && followerScoreId === score.id) return follower

  const engine = getAudioEngine()
  const clock = createAudioContextClock(() => engine.context.currentTime)
  follower = new ScoreFollower(score, clock)
  followerScoreId = score.id
  syncTransportToFollower()
  resetBeatCursor()
  resetFeedbackState()
  return follower
}

/** 取得（或创建）节拍器；AudioEngine 尚未创建时返回 null（此时也不该有声音） */
function ensureMetronome(): Metronome | null {
  const engine = peekAudioEngine()
  if (!engine) return null

  if (metronome && !metronome.disposed && metronomeContext === engine.context) {
    return metronome
  }
  metronome?.dispose()

  const transport = useTransportStore.getState()
  metronome = new Metronome(engine.context, { volume: transport.metronomeVolume })
  metronome.setMuted(!transport.metronomeEnabled)
  metronomeContext = engine.context
  return metronome
}

/** 把 transportStore 的当前值灌进 follower（创建时与外部改动时都走这里） */
function syncTransportToFollower(): void {
  if (!follower) return
  const t = useTransportStore.getState()
  follower.setBpm(t.bpm)
  follower.setSpeed(t.speedPercent)
  const loop = toFollowerLoop(t.loopRange, t.looping)
  if (loop) follower.setLoopRange(loop.startId, loop.endId)
  else follower.clearLoop()
}

// ---------------------------------------------------------------------------
// 帧循环
// ---------------------------------------------------------------------------

/** 发布一帧时间轴快照（播放头 / 进度条的唯一数据来源） */
function emitTimelineFrame(): void {
  if (!follower) return
  timelineBus.emit({
    elapsedMs: follower.elapsedMs(),
    totalMs: follower.totalMs,
    running: follower.isRunning,
    position: follower.getPosition(),
  })
}

/**
 * 把离散跟随状态写入 sessionStore。
 *
 * 只在小节或拍号**真的变化**时调用；位置本身（progress）绝不进 store。
 */
function pushDiscreteState(score: Score, measureId: number, beatIndex: number): void {
  if (!follower) return
  const measures = follower.measuresList
  const index = measures.findIndex((m) => m.id === measureId)
  const section = findSectionByMeasure(score.sections, measureId)
  useSessionStore.getState().setFollowerState({
    currentMeasureId: measureId,
    currentSectionId: section?.id ?? null,
    currentBeatIndex: beatIndex,
    expectedChord: index >= 0 ? measures[index].chord : null,
  })
}

/** rAF 主循环：发布位置 → 排节拍 → 写离散状态 → 曲末自动停 */
function tick(score: Score): void {
  rafHandle = null
  const active = follower
  if (!active) return

  const elapsedMs = active.elapsedMs()
  const position = active.getPosition()

  timelineBus.emit({
    elapsedMs,
    totalMs: active.totalMs,
    running: active.isRunning,
    position,
  })

  // ---- 节拍器：拍点与播放头同源，循环 / 变速自动跟随 ----
  const transport = useTransportStore.getState()
  if (transport.metronomeEnabled && active.isRunning) {
    const device = ensureMetronome()
    if (device) {
      const scheduled = collectDueBeats({
        measures: active.measuresList,
        bpm: active.currentBpm,
        speedPercent: active.currentSpeedPercent,
        loopRange: active.currentLoop,
        elapsedMs,
        nowSec: active.clockSec,
        lastScheduledBeat: beatCursor,
      })
      for (const beat of scheduled.beats) {
        device.scheduleClick(beat.atCtxSec, beat.accent)
      }
      beatCursor = scheduled.lastScheduledBeat
    }
  } else {
    // 关着的时候也要推进游标，否则一开启就会补发一大串过期拍
    beatCursor = initialBeatCursor(elapsedMs, active.beatDurMs)
  }

  // ---- 离散状态：只在变化时写 store ----
  if (position.measureId !== lastMeasureId || position.beatIndex !== lastBeatIndex) {
    lastMeasureId = position.measureId
    lastBeatIndex = position.beatIndex
    pushDiscreteState(score, position.measureId, position.beatIndex)
  }

  // ---- 无循环播到曲末：自动停，避免播放头钉在末尾却仍显示"播放中" ----
  if (!active.currentLoop && Number.isFinite(active.totalMs) && elapsedMs >= active.totalMs) {
    useTransportStore.getState().setPlaying(false)
    return
  }

  if (active.isRunning) scheduleFrame(score)
}

function scheduleFrame(score: Score): void {
  if (rafHandle !== null) return
  if (typeof requestAnimationFrame !== "function") return
  rafHandle = requestAnimationFrame(() => tick(score))
}

function cancelFrame(): void {
  if (rafHandle === null) return
  if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(rafHandle)
  rafHandle = null
}

// ---------------------------------------------------------------------------
// 对外命令（供 UI 在**用户手势内**直接调用）
// ---------------------------------------------------------------------------

/**
 * 开始 / 继续播放。
 *
 * 同步创建并 resume AudioContext —— 必须在 onClick 的同步调用栈里调用。
 */
export function playPractice(): void {
  const engine = getAudioEngine()
  engine.start()
  ensureMetronome()
  useTransportStore.getState().setPlaying(true)
}

/** 暂停（音乐时间冻结，再次播放从原位继续） */
export function pausePractice(): void {
  useTransportStore.getState().setPlaying(false)
}

/** 播放 / 暂停切换 */
export function togglePractice(): void {
  if (useTransportStore.getState().playing) pausePractice()
  else playPractice()
}

/** 停止并回到曲首 */
export function stopPractice(): void {
  useTransportStore.getState().setPlaying(false)
  follower?.stop()
  metronome?.stopAll()
  if (feedbackUnsub) {
    feedbackUnsub()
    feedbackUnsub = null
  }
  resetFeedbackState()
  useSessionStore.getState().setLastFeedback(null)
  lastMeasureId = null
  lastBeatIndex = -1
  resetBeatCursor()
  emitTimelineFrame()
}

/** 跳到指定小节的开头（点小节 / 设循环点后对齐用） */
export function seekPracticeToMeasure(measureId: number): void {
  if (!follower) return
  follower.seekToMeasure(measureId)
  metronome?.stopAll()
  resetBeatCursor()
  lastMeasureId = null
  lastBeatIndex = -1
  emitTimelineFrame()
}

/** 当前 follower（只读用途；未创建时为 null） */
export function peekPracticeFollower(): ScoreFollower | null {
  return follower
}

/** 当前节拍器（只读用途；未创建时为 null） */
export function peekPracticeMetronome(): Metronome | null {
  return metronome
}

/** 彻底释放编排层持有的资源（切歌 / 测试用） */
export function disposePracticeSession(): void {
  cancelFrame()
  metronome?.dispose()
  metronome = null
  metronomeContext = null
  if (feedbackUnsub) {
    feedbackUnsub()
    feedbackUnsub = null
  }
  resetFeedbackState()
  follower = null
  followerScoreId = null
  beatCursor = -1
  lastMeasureId = null
  lastBeatIndex = -1
  timelineBus.clear()
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * 挂载编排层。**整个应用只能调用一次**（PracticeStage）。
 *
 * @param score 当前曲谱（调用方负责兜底，不接受 null —— 没有谱子就没有时间轴）
 */
export function usePracticeSession(score: Score): void {
  const playing = useTransportStore((s) => s.playing)
  const bpm = useTransportStore((s) => s.bpm)
  const speedPercent = useTransportStore((s) => s.speedPercent)
  const looping = useTransportStore((s) => s.looping)
  const loopRange = useTransportStore((s) => s.loopRange)
  const metronomeEnabled = useTransportStore((s) => s.metronomeEnabled)
  const metronomeVolume = useTransportStore((s) => s.metronomeVolume)

  // 帧循环回调需要最新的 score，但又不该因为 score 变化就重启循环
  const scoreRef = useRef(score)
  scoreRef.current = score

  // ---- 曲谱：切歌时重建 follower，并把首小节写进 store（UI 在未播放时也有落点） ----
  useEffect(() => {
    if (follower && followerScoreId !== score.id) {
      cancelFrame()
      metronome?.stopAll()
      follower = null
      followerScoreId = null
      timelineBus.clear()
    }
    lastMeasureId = null
    lastBeatIndex = -1

    const measures = flattenMeasures(score.sections)
    const first = measures[0]
    const session = useSessionStore.getState()
    if (first && session.currentMeasureId === null) {
      session.setFollowerState({
        currentMeasureId: first.id,
        currentSectionId: findSectionByMeasure(score.sections, first.id)?.id ?? null,
        currentBeatIndex: 0,
        expectedChord: first.chord,
      })
    }
  }, [score])

  // ---- 播放意图 ----
  useEffect(() => {
    if (playing) {
      const active = ensureFollower(scoreRef.current)
      active.start()
      resetBeatCursor()
      scheduleFrame(scoreRef.current)
      // 重新校准播放起点偏移：暂停后继续会从首帧重新反推（见 ingestDetectionFrame）
      playbackShiftMs = null
      // 订阅音频帧 → 实时判定 → 反馈气泡（§1.4：判定只在离散事件写 store）
      if (!feedbackUnsub) feedbackUnsub = audioBus.subscribe(ingestDetectionFrame)
      return
    }
    cancelFrame()
    follower?.pause()
    metronome?.stopAll()
    emitTimelineFrame()
    // 暂停：冲刷当前小节反馈（保持显示），退订避免后台空转
    flushCurrentFeedback()
    if (feedbackUnsub) {
      feedbackUnsub()
      feedbackUnsub = null
    }
  }, [playing])

  // ---- BPM / 变速：保位改速（当前小节不跳变），并清掉已排期的旧速度拍 ----
  useEffect(() => {
    if (!follower) return
    follower.setBpm(bpm)
    metronome?.stopAll()
    resetBeatCursor()
    emitTimelineFrame()
  }, [bpm])

  useEffect(() => {
    if (!follower) return
    follower.setSpeed(speedPercent)
    metronome?.stopAll()
    resetBeatCursor()
    emitTimelineFrame()
  }, [speedPercent])

  // ---- 循环 A—B ----
  useEffect(() => {
    if (!follower) return
    const loop = toFollowerLoop(loopRange, looping)
    if (loop) follower.setLoopRange(loop.startId, loop.endId)
    else follower.clearLoop()
    metronome?.stopAll()
    resetBeatCursor()
    emitTimelineFrame()
  }, [looping, loopRange])

  // ---- 节拍器开关与音量 ----
  useEffect(() => {
    const device = metronome && !metronome.disposed ? metronome : ensureMetronome()
    if (!device) return
    device.setMuted(!metronomeEnabled)
    if (!metronomeEnabled) device.stopAll()
  }, [metronomeEnabled])

  useEffect(() => {
    const device = metronome && !metronome.disposed ? metronome : null
    device?.setVolume(metronomeVolume)
  }, [metronomeVolume])

  // ---- AudioContext 生命周期：被系统挂起时自动暂停，避免"时钟停了但 UI 还在播" ----
  useEffect(() => {
    const engine = peekAudioEngine()
    if (!engine) return
    return engine.onStateChange((state) => {
      if (state === "running") {
        if (useTransportStore.getState().playing && follower && !follower.isRunning) {
          follower.start()
          resetBeatCursor()
          scheduleFrame(scoreRef.current)
        }
        return
      }
      if (follower?.isRunning) {
        follower.pause()
        metronome?.stopAll()
        cancelFrame()
        emitTimelineFrame()
      }
    })
    // engine 是惰性创建的：playing 变化时重新尝试订阅，直到拿到实例
  }, [playing])

  // ---- 卸载（切到 library 视图）：停帧循环并冻结时间，资源不销毁以便返回后继续 ----
  useEffect(() => {
    return () => {
      cancelFrame()
      follower?.pause()
      metronome?.stopAll()
    }
  }, [])
}

/**
 * 纯计算：当前曲谱在给定 bpm / 变速下的总时长（ms）。
 * 供 TopBar 在**尚未播放**时也能显示正确的总时长。
 */
export function computeTotalMs(score: Score, bpm: number, speedPercent: number): number {
  return totalDurationMs(flattenMeasures(score.sections), bpm, speedPercent)
}

/** 纯计算：一拍毫秒数（UI 展示节拍间隔用） */
export function computeBeatMs(bpm: number, speedPercent: number): number {
  return beatDurationMs(bpm, speedPercent)
}
