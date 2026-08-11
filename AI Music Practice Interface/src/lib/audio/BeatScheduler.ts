/**
 * BeatScheduler — 节拍点排期（纯函数）
 *
 * ## 为什么单独抽出来
 * 节拍器要"提前一点点"把 click 排进 AudioContext 的调度队列（Web Audio 只接受
 * 未来时刻的 `start(t)`），这个 lookahead 逻辑如果写在 rAF 回调里，就永远无法在
 * node 里被验证 —— 而它恰恰是"节拍器与播放头是否同源"的唯一判据。
 *
 * 因此这里把它做成**纯函数**：输入"当前音乐时间 + 上次排到第几拍"，
 * 输出"这一轮该排哪些拍、各自应在哪个 AudioContext 时刻发声"。
 * rAF 只负责喂参数与执行 `metronome.scheduleClick`。
 *
 * ## 与 ScoreFollower 的关系
 * 拍点位置一律由 `positionAt`（ScoreFollower 的纯函数）解析，
 * 所以循环 A—B 回绕、SLOW PRACTICE 变速在节拍器上**自动生效**，
 * 不存在第二套时间源（这正是缺陷 D4 的根因）。
 */

import {
  beatDurationMs,
  positionAt,
  totalDurationMs,
  type LoopRange,
} from "@/lib/audio/ScoreFollower"
import type { Measure } from "@/lib/music/types"

/** 一次待发声的节拍 */
export interface ScheduledBeat {
  /** 自播放开始的全局拍序号（0-based，音乐时间轴上的绝对拍号） */
  beatNumber: number
  /** 该拍在音乐时间轴上的位置（ms） */
  elapsedMs: number
  /** 该拍应发声的 AudioContext 时刻（秒，与 ScoreFollower 的 Clock 同源） */
  atCtxSec: number
  /** 是否强拍（小节第一拍） */
  accent: boolean
  /** 该拍所属小节编号 */
  measureId: number
  /** 该拍在小节内的下标 */
  beatIndex: number
}

export interface BeatScheduleInput {
  /** 展平后的小节数组 */
  measures: Measure[]
  bpm: number
  speedPercent: number
  loopRange: LoopRange | null
  /** 当前音乐时间（ms，来自 ScoreFollower.elapsedMs()） */
  elapsedMs: number
  /** 当前时钟秒数（来自 ScoreFollower.clockSec，与 elapsedMs 同源） */
  nowSec: number
  /** 上一轮已排到的全局拍号；-1 = 尚未排过任何拍 */
  lastScheduledBeat: number
  /** 提前量（ms，默认 150） */
  lookaheadMs?: number
  /** 单轮最多排多少拍（防止极端参数下死循环） */
  maxBeats?: number
}

export interface BeatScheduleResult {
  /** 本轮应排入调度队列的拍 */
  beats: ScheduledBeat[]
  /** 更新后的"已排到第几拍"游标，下一轮原样传回来 */
  lastScheduledBeat: number
}

/**
 * 默认提前量。
 * rAF 约 16.7ms 一轮，150ms 足够覆盖被 throttle 到 ~10Hz 的极端情况，
 * 又不至于长到"改 BPM 后还能听见两三个旧速度的幽灵拍"。
 */
export const DEFAULT_LOOKAHEAD_MS = 150

/** 单轮排期上限（32 拍 @ BPM 180 ≈ 10.7 秒，远超任何合理 lookahead） */
const MAX_BEATS_PER_TICK = 32

/**
 * 判定强拍时给的极小偏移。
 * `positionAt` 的边界语义是"恰好落在边界上归下一小节"，
 * 加上 EPS 可以避免浮点减法把小节首拍算回上一小节的末尾。
 */
const BOUNDARY_EPSILON_MS = 1e-6

/**
 * 计算"从当前音乐时间开始排期"时的游标初值。
 *
 * 返回**小于等于**当前时间的最后一拍的拍号，于是下一拍恰好是第一个未来拍。
 * `elapsedMs = 0` 时返回 -1 —— 曲首的第 0 拍必须被排上，否则第一小节没有强拍。
 */
export function initialBeatCursor(elapsedMs: number, beatDurMs: number): number {
  if (!Number.isFinite(beatDurMs) || beatDurMs <= 0) return -1
  const safeElapsed = Math.max(0, elapsedMs)
  return Math.max(-1, Math.ceil(safeElapsed / beatDurMs) - 1)
}

/**
 * 收集本轮应当排入调度队列的节拍。
 *
 * 纯函数：不读时钟、不碰 AudioContext、不产生副作用。
 */
export function collectDueBeats(input: BeatScheduleInput): BeatScheduleResult {
  const {
    measures,
    bpm,
    speedPercent,
    loopRange,
    elapsedMs,
    nowSec,
    lastScheduledBeat,
    lookaheadMs = DEFAULT_LOOKAHEAD_MS,
    maxBeats = MAX_BEATS_PER_TICK,
  } = input

  const beatDurMs = beatDurationMs(bpm, speedPercent)
  if (measures.length === 0 || !Number.isFinite(beatDurMs) || beatDurMs <= 0) {
    return { beats: [], lastScheduledBeat }
  }

  // 页面被切到后台后 rAF 会停摆，回来时游标可能落后几十拍。
  // 这些拍的发声时刻已经是过去，补发只会变成一串"追赶噪音"，
  // 因此先把游标快进到"当前时间的前一拍"，只保留最多一拍的宽容度。
  const minCursor = initialBeatCursor(elapsedMs - beatDurMs, beatDurMs)
  let cursor = Math.max(lastScheduledBeat, minCursor)

  const totalMs = totalDurationMs(measures, bpm, speedPercent)
  const horizonMs = elapsedMs + Math.max(0, lookaheadMs)
  const beats: ScheduledBeat[] = []

  while (beats.length < maxBeats) {
    const beatNumber = cursor + 1
    const beatElapsedMs = beatNumber * beatDurMs
    if (beatElapsedMs > horizonMs) break
    // 无循环时曲末即止：再往后排就是给不存在的小节打拍子
    if (!loopRange && beatElapsedMs >= totalMs) break

    const position = positionAt(
      measures,
      bpm,
      speedPercent,
      loopRange,
      beatElapsedMs + BOUNDARY_EPSILON_MS,
    )
    beats.push({
      beatNumber,
      elapsedMs: beatElapsedMs,
      atCtxSec: nowSec + (beatElapsedMs - elapsedMs) / 1000,
      accent: position.beatIndex === 0,
      measureId: position.measureId,
      beatIndex: position.beatIndex,
    })
    cursor = beatNumber
  }

  return { beats, lastScheduledBeat: cursor }
}
