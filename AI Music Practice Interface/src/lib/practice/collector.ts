/**
 * PracticeCollector — 逐帧累积 → SessionAnalytics（DEVELOPMENT_PLAN §4）
 *
 * 离线回放与实时路径共用：
 *   - 每帧调 `ingestFrame`（累积 chroma / 和弦置信度 / 音准）
 *   - 每条判定调 `ingestJudgement`（累积 timing 偏差与 miss）
 *   - 结束时 `finalize()` 产出 `SessionAnalytics`（computeMetrics 的输入）
 *
 * 为什么两个入口而不是一个：判定归属的小节与产生它的那一帧所在的小节**可能不同**
 * （抢在小节线前 30ms 的 onset 属于下一小节）。合成一个入口就必然要在调用方做
 * "到底记到哪个小节"的判断，那正是最容易出错的地方。
 *
 * 本类不持有任何 Web Audio 依赖，纯累积逻辑，node 可跑。
 */

import type { Chord } from "@/lib/music/types"
import { computeTonalRatio } from "@/lib/audio/dsp/chroma"
import type { ChordMatch } from "@/lib/audio/ChordRecognizer"
import type { MeasureStats, SessionAnalytics, TimingJudgement } from "./types"
import { timingScore } from "./metrics"

/** midi → 音级索引（0-11） */
function pitchClassOf(midi: number): number {
  const pc = midi % 12
  return pc < 0 ? pc + 12 : pc
}

/** 算术平均（空数组返回 0） */
function mean(values: readonly number[]): number {
  if (values.length === 0) return 0
  let sum = 0
  for (const v of values) sum += v
  return sum / values.length
}

/** 每帧喂给 collector 的归一化输入 */
export interface FrameInput {
  /** 该帧所在小节编号 */
  measureId: number
  /** 本帧是否过噪声门限（有活动） */
  hasActivity: boolean
  /** 本帧 12 维音级能量 */
  chroma: ArrayLike<number>
  /** 本帧期望和弦（引导式） */
  expectedChord: Chord | null
  /** 本帧和弦识别结果（可为 null） */
  chordMatch: ChordMatch | null
  /** 本帧单音音准分（0-100，无确认音时为 null） */
  centsScore: number | null
}

interface MeasureAccum {
  measureId: number
  onsetCount: number
  offsets: number[]
  tonalRatios: number[]
  centsScores: number[]
  chordConfidences: number[]
  hasActivity: boolean
  missed: boolean
}

/** 逐帧累积器 */
export class PracticeCollector {
  private readonly acc = new Map<number, MeasureAccum>()
  private readonly timingOffsets: number[] = []

  /** 喂入一帧归一化数据 */
  ingestFrame(input: FrameInput): void {
    const a = this.ensure(input.measureId)
    if (!input.hasActivity) return

    a.hasActivity = true
    const expectedPCs = input.expectedChord
      ? input.expectedChord.notes.map((n) => pitchClassOf(n.midi))
      : []
    a.tonalRatios.push(computeTonalRatio(input.chroma, expectedPCs))
    if (input.chordMatch) a.chordConfidences.push(input.chordMatch.confidence)
    if (input.centsScore !== null) a.centsScores.push(input.centsScore)
  }

  /** 喂入一条 timing 判定（miss 只置标志位，不进 timingOffsets） */
  ingestJudgement(judgement: TimingJudgement): void {
    const a = this.ensure(judgement.measureId)
    if (judgement.kind === "miss") {
      a.missed = true
      return
    }
    a.onsetCount += 1
    a.offsets.push(judgement.offsetMs)
    this.timingOffsets.push(judgement.offsetMs)
  }

  /** 批量喂入判定（`ScoreFollower.ingestFrame` 的返回值可直接透传） */
  ingestJudgements(judgements: readonly TimingJudgement[]): void {
    for (const j of judgements) this.ingestJudgement(j)
  }

  /** 结束累积，产出 SessionAnalytics */
  finalize(): SessionAnalytics {
    const measures: MeasureStats[] = []
    const practiced: number[] = []
    for (const a of this.acc.values()) {
      const m = this.toStats(a)
      measures.push(m)
      // 一小节记为「已练习」当且仅当其中有真实起音（onsetCount > 0）。
      // 末音的长尾会越过小节线继续 above-gate，但那些帧没有 onset，
      // 若按 hasActivity 判定，第 21 小节会被误判为已练（DoD #9 / SLOW 的 practicedMeasures 只该是 17-20）。
      if (a.onsetCount > 0) practiced.push(m.measureId)
    }
    measures.sort((x, y) => x.measureId - y.measureId)
    practiced.sort((x, y) => x - y)
    return {
      measures,
      timingOffsets: [...this.timingOffsets],
      practicedMeasures: practiced,
    }
  }

  private toStats(a: MeasureAccum): MeasureStats {
    const meanTonal = mean(a.tonalRatios)
    const cents = a.centsScores.length ? mean(a.centsScores) : null
    // §1.7 ①：有确认音走双分支，否则退化为 tonalRatio × 100
    const pitchAccuracy = cents === null ? meanTonal * 100 : 0.6 * meanTonal * 100 + 0.4 * cents
    const rhythmStability = a.offsets.length ? mean(a.offsets.map(timingScore)) : 0
    const chordConfidence = mean(a.chordConfidences)
    return {
      measureId: a.measureId,
      onsetCount: a.onsetCount,
      offsets: [...a.offsets],
      chordConfidence,
      pitchAccuracy,
      rhythmStability,
      missed: a.missed,
      hasActivity: a.hasActivity,
    }
  }

  private ensure(measureId: number): MeasureAccum {
    let a = this.acc.get(measureId)
    if (!a) {
      a = {
        measureId,
        onsetCount: 0,
        offsets: [],
        tonalRatios: [],
        centsScores: [],
        chordConfidences: [],
        hasActivity: false,
        missed: false,
      }
      this.acc.set(measureId, a)
    }
    return a
  }
}
