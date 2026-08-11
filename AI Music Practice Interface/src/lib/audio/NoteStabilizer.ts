/**
 * NoteStabilizer — 连续帧确认 + 八度纠错
 *
 * 单帧的 MPM/YIN 结果在真实拨弦上会抖：起振瞬态、拨片噪声、低音弦倍频，
 * 都会让个别帧跳到错误的音。本类把"逐帧原始音高"收敛成"稳定的确认音"。
 *
 * 规则（DEVELOPMENT_PLAN §1.6）：
 *   1. 候选 midi = round(frequencyToMidi(freq))
 *   2. 八度纠错：候选与上一确认音相差**整八度**且上一确认音仍新鲜时，
 *      保守采纳较低的那个（吉他低音弦倍频误判的典型形态）。
 *      Phase 3 接上 `expectedChord` 后升级为"按期望和弦内音判定"。
 *   3. 连续 `confirmFrames` 帧落在同一 midi（±`toleranceCents`）→ 输出确认音；
 *      确认后每一帧都继续输出（`isNew=false`），供 UI 做延音显示。
 *   4. 连续 `releaseFrames` 帧无有效音高 → 释放，回到未确认态。
 *
 * 本类不依赖 window / AudioContext，时间一律由调用方传入（虚拟时钟可驱动）。
 */

import {
  OCTAVE_CORRECTION_WINDOW_MS,
  STABILIZER_CONFIRM_FRAMES,
  STABILIZER_RELEASE_FRAMES,
  STABILIZER_TOLERANCE_CENTS,
} from "@/lib/audio/constants"
import { centsOff, midiToNoteName } from "@/lib/audio/noteUtils"
import type { ConfirmedNote, PitchResult } from "@/lib/audio/types"

export interface NoteStabilizerOptions {
  /** 连续多少帧同一 midi 才确认（默认 3） */
  confirmFrames?: number
  /** 判"同一个音"的容差 cents（默认 60） */
  toleranceCents?: number
  /** 连续多少帧无音高后释放（默认 3） */
  releaseFrames?: number
  /** 八度纠错的有效时间窗 ms（默认 250） */
  octaveWindowMs?: number
}

/** 内部候选态 */
interface Candidate {
  midi: number
  frames: number
  firstTimeMs: number
  octaveCorrected: boolean
}

export class NoteStabilizer {
  private readonly confirmFrames: number
  private readonly toleranceCents: number
  private readonly releaseFrames: number
  private readonly octaveWindowMs: number

  private candidate: Candidate | null = null
  private confirmed: ConfirmedNote | null = null
  private silentFrames = 0
  private lastConfirmTimeMs = -Infinity

  /** 期望和弦的音级集合（Phase 3 由 ScoreFollower 注入，Phase 1 恒为 null） */
  private expectedPitchClasses: ReadonlySet<number> | null = null

  constructor(options: NoteStabilizerOptions = {}) {
    this.confirmFrames = options.confirmFrames ?? STABILIZER_CONFIRM_FRAMES
    this.toleranceCents = options.toleranceCents ?? STABILIZER_TOLERANCE_CENTS
    this.releaseFrames = options.releaseFrames ?? STABILIZER_RELEASE_FRAMES
    this.octaveWindowMs = options.octaveWindowMs ?? OCTAVE_CORRECTION_WINDOW_MS
  }

  /**
   * 设置当前期望和弦的音级集合（0-11）。传 null 关闭该增强。
   * Phase 3 用它把八度纠错从"保守取低八度"升级为"按和弦内音判定"。
   */
  setExpectedPitchClasses(pitchClasses: readonly number[] | null): void {
    this.expectedPitchClasses =
      pitchClasses && pitchClasses.length > 0
        ? new Set(pitchClasses.map((pc) => ((pc % 12) + 12) % 12))
        : null
  }

  /** 最近一次确认的音（未确认时为 null） */
  get lastConfirmed(): ConfirmedNote | null {
    return this.confirmed
  }

  /** 清空所有内部状态 */
  reset(): void {
    this.candidate = null
    this.confirmed = null
    this.silentFrames = 0
    this.lastConfirmTimeMs = -Infinity
  }

  /**
   * 送入一帧原始音高。
   *
   * @param pitch  本帧原始音高，静音/低 clarity 时传 null
   * @param timeMs 本帧时间（毫秒）。不传则用 `pitch.timestamp`。
   * @returns 本帧的确认音；尚未确认时返回 null
   */
  push(pitch: PitchResult | null, timeMs?: number): ConfirmedNote | null {
    const frameTimeMs = timeMs ?? pitch?.timestamp ?? 0

    // ---- 无有效音高：累计静音帧，达到阈值后释放 ----
    if (pitch === null) {
      this.silentFrames += 1
      if (this.silentFrames >= this.releaseFrames) {
        this.candidate = null
        this.confirmed = null
      }
      return null
    }
    this.silentFrames = 0

    // ---- ① 八度纠错 ----
    const { midi: correctedMidi, corrected } = this.applyOctaveCorrection(pitch.midi, frameTimeMs)

    // ---- ② 候选累计 ----
    // 容差要在**折算掉整八度之后**再判定。
    // 八度纠错一旦生效，correctedMidi 与实际频率天然相差 ±1200 cents，
    // 若直接比较，被纠错的帧会永远判为"不是同一个音"→ 候选每帧重置为 1 帧 →
    // 纠错后的音永远无法确认（八度纠错形同虚设）。
    // 折算后本质是在比较**音级层面**的偏差，未纠错时 round(x/1200) 恒为 0，行为不变。
    const rawDeviationCents = centsOff(pitch.frequency, correctedMidi)
    const foldedDeviationCents =
      rawDeviationCents - 1200 * Math.round(rawDeviationCents / 1200)
    const withinTolerance = Math.abs(foldedDeviationCents) <= this.toleranceCents

    if (this.candidate && this.candidate.midi === correctedMidi && withinTolerance) {
      this.candidate.frames += 1
      this.candidate.octaveCorrected = this.candidate.octaveCorrected || corrected
    } else {
      this.candidate = {
        midi: correctedMidi,
        frames: 1,
        firstTimeMs: frameTimeMs,
        octaveCorrected: corrected,
      }
    }

    // ---- ③ 达到确认帧数后输出 ----
    if (this.candidate.frames < this.confirmFrames) {
      return null
    }

    const isNew = this.confirmed === null || this.confirmed.midi !== correctedMidi
    const { name, octave } = midiToNoteName(correctedMidi)
    const confirmedNote: ConfirmedNote = {
      midi: correctedMidi,
      noteName: name,
      octave,
      frequency: pitch.frequency,
      // 同样折算掉整八度：纠错后若直接上报 ±1200 cents，UI 的音准指针会被永久顶到量程边缘
      centsOff: foldedDeviationCents,
      clarity: pitch.clarity,
      onsetTimeMs: isNew ? this.candidate.firstTimeMs : (this.confirmed?.onsetTimeMs ?? frameTimeMs),
      isNew,
      octaveCorrected: this.candidate.octaveCorrected,
    }
    this.confirmed = confirmedNote
    this.lastConfirmTimeMs = frameTimeMs
    return confirmedNote
  }

  /**
   * 八度纠错。
   *
   * Phase 1（简化版）：候选与上一确认音相差整八度、且上一确认音仍在时间窗内 →
   * 采纳较低的那个。低音弦倍频误判总是"向上跳"，取低八度即可消除。
   *
   * Phase 3（增强版，`expectedPitchClasses` 非空时生效）：
   * 两者音级都属于期望和弦时，直接沿用上一确认音（更保守，避免同和弦内跳八度）。
   */
  private applyOctaveCorrection(
    candidateMidi: number,
    frameTimeMs: number,
  ): { midi: number; corrected: boolean } {
    const last = this.confirmed
    if (!last) return { midi: candidateMidi, corrected: false }

    const distance = candidateMidi - last.midi
    if (Math.abs(distance) !== 12) return { midi: candidateMidi, corrected: false }

    const elapsedMs = frameTimeMs - this.lastConfirmTimeMs
    if (!(elapsedMs >= 0 && elapsedMs <= this.octaveWindowMs)) {
      return { midi: candidateMidi, corrected: false }
    }

    if (this.expectedPitchClasses) {
      const candidatePc = ((candidateMidi % 12) + 12) % 12
      const lastPc = ((last.midi % 12) + 12) % 12
      if (this.expectedPitchClasses.has(candidatePc) && this.expectedPitchClasses.has(lastPc)) {
        return { midi: last.midi, corrected: last.midi !== candidateMidi }
      }
      return { midi: candidateMidi, corrected: false }
    }

    const lower = Math.min(candidateMidi, last.midi)
    return { midi: lower, corrected: lower !== candidateMidi }
  }
}
