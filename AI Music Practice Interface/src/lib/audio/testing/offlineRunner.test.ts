/**
 * offlineRunner 端到端验收（★ Phase 3 的最终门禁）
 *
 * **DoD #9 / #10 的机器验证在这里。**
 *   #9  4 小节 × 每小节 4 次准时扫弦 →
 *         rhythmStability ≥ 85 / chordClarity ≥ 80 /
 *         practicedMeasures = 4 / timingOffsets = 16 / |median(timingOffsets)| ≤ 25ms
 *   #10 同样演奏但整体延后 120ms →
 *         rhythmStability ≤ 45 且 median(timingOffsets) ∈ [-135, -105]
 *
 * 另含 **变异守卫**：`ignoreAnalysisLatency: true` 等价于"忘了减 ANALYSIS_LATENCY_MS"，
 * 此时 #9 的 |median| ≤ 25ms 必须**转红**。若它照样绿，说明延迟补偿是摆设。
 *
 * 这条链路与实时路径完全同构（统一 16384 chroma 口径、同一套 onset/判定/累积逻辑），
 * 所以离线绿 == 生产绿。
 */

import { describe, expect, it } from "vitest"

import { ANALYSIS_LATENCY_MS, SAMPLE_RATE_FALLBACK } from "@/lib/audio/constants"
import { beatDurationMs } from "@/lib/audio/ScoreFollower"
import { runOfflineSession } from "@/lib/audio/testing/offlineRunner"
import { renderStrumSequence, type StrumEvent } from "@/lib/audio/testing/syntheticAudio"
import { computeMetrics } from "@/lib/practice/metrics"
import { SLOW_DANCING_SCORE } from "@/lib/music/scores/slowDancing"
import { flattenMeasures } from "@/lib/music/types"

const SAMPLE_RATE = SAMPLE_RATE_FALLBACK
const SCORE = SLOW_DANCING_SCORE

/**
 * ★ 验收基线：真实吉他长尾 tau = 0.8s（`DEFAULT_PLUCK_TAU_SEC`）。
 *
 * BPM 92 拍间 652ms，4×tau ≈ 3.2s 的尾音**必然跨拍重叠** —— 这就是真实演奏的样子，
 * DoD #9 / #10 / SLOW 全部按它验收。曾经为了让用例变绿改成 0.15s，
 * 被 team-lead 实测证伪（短尾照样误报），真根因是检测器缺峰值拾取级，已在
 * `OnsetDetector` 补齐。这里显式写死 0.8 并留注释，防止再被"调绿"。
 */
const STRUM_TAU_SEC = 0.8

/** BPM 92 / speed 100 → 652.1739ms 一拍，4/4 小节 2608.6957ms */
const BEAT_MS = beatDurationMs(SCORE.bpm, 100)

/** 只练前 4 小节（17-20：Am7 / Fmaj7 / C / G） */
const PRACTICE_MEASURES = flattenMeasures(SCORE.sections).slice(0, 4)
const PRACTICE_MEASURE_IDS = PRACTICE_MEASURES.map((m) => m.id)

/** 中位数（测试内独立实现一遍，避免用被测代码验证被测代码） */
function medianOf(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN
  const s = [...values].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid]
}

/**
 * 生成"4 小节 × 每小节 4 拍，每拍扫一次当前小节和弦"的演奏。
 *
 * 扫弦频率直接取自曲谱的 `chord.notes` —— 测试激励与曲谱同源，
 * 避免手抄频率抄错导致 chordClarity 莫名其妙不达标。
 *
 * @param shiftMs 整体时间平移（DoD #10 用 +120 模拟系统性拖拍）
 */
function buildPerformance(shiftMs = 0): StrumEvent[] {
  const events: StrumEvent[] = []
  PRACTICE_MEASURES.forEach((measure, mi) => {
    const freqsHz = measure.chord.notes.map((n) => n.frequency)
    for (let beat = 0; beat < measure.beats; beat += 1) {
      events.push({
        atMs: (mi * measure.beats + beat) * BEAT_MS + shiftMs,
        freqsHz,
        amplitude: 0.6,
        spreadMs: 10,
        tauSec: STRUM_TAU_SEC,
      })
    }
  })
  return events
}

/** 整段音频总时长：4 小节 + 1 秒余量（让末小节的 miss 结算有帧可跑） */
const TOTAL_MS = 4 * 4 * BEAT_MS + 1000

/** 渲染一次演奏 */
function renderPerformance(shiftMs = 0): Float32Array<ArrayBuffer> {
  return renderStrumSequence(buildPerformance(shiftMs), SAMPLE_RATE, TOTAL_MS + shiftMs)
}

describe("offlineRunner：基本形状", () => {
  it("空音频 → 不抛错，analytics 各字段为空/零", () => {
    const result = runOfflineSession(SCORE, renderStrumSequence([], SAMPLE_RATE, 0))
    expect(result.frameCount).toBe(0)
    expect(result.judgements).toEqual([])
    expect(result.analytics.timingOffsets).toEqual([])
    expect(result.analytics.practicedMeasures).toEqual([])
  })

  it("纯静音 3 秒 → 0 个有效 onset，但小节被标记为 miss（漏弹不能被静默吞掉）", () => {
    const silence = renderStrumSequence([], SAMPLE_RATE, 3000)
    const result = runOfflineSession(SCORE, silence)

    expect(result.analytics.timingOffsets).toEqual([])
    expect(result.analytics.practicedMeasures).toEqual([])

    const misses = result.judgements.filter((j) => j.kind === "miss")
    expect(misses.length).toBeGreaterThan(0)
    // 3 秒 ≈ 1.15 个小节 → 至少小节 17 要被判 miss
    expect(misses.map((m) => m.measureId)).toContain(17)
    // 所有 miss 都落在真实存在的小节上
    for (const m of misses) {
      expect(flattenMeasures(SCORE.sections).some((x) => x.id === m.measureId)).toBe(true)
    }
  })

  it("末小节的 miss 被 finalize() 冲刷出来（最容易漏的一条链路）", () => {
    // 只在第 1 小节弹，后面全空 → 第 2 小节必须有 miss
    const partial: StrumEvent[] = [0, 1, 2, 3].map((b) => ({
      atMs: b * BEAT_MS,
      freqsHz: PRACTICE_MEASURES[0].chord.notes.map((n) => n.frequency),
      amplitude: 0.6,
      tauSec: STRUM_TAU_SEC,
    }))
    const audio = renderStrumSequence(partial, SAMPLE_RATE, 2 * 4 * BEAT_MS)
    const result = runOfflineSession(SCORE, audio)

    const missIds = result.judgements.filter((j) => j.kind === "miss").map((j) => j.measureId)
    expect(missIds).toContain(18)
  })
})

describe("DoD #9：4 小节 × 4 次准时扫弦", () => {
  const result = runOfflineSession(SCORE, renderPerformance(0))
  const { analytics } = result
  const metrics = computeMetrics(analytics)
  const median = medianOf(analytics.timingOffsets)

  it("timingOffsets 恰好 16 条（4 小节 × 4 拍，一次扫弦只算一次）", () => {
    expect(analytics.timingOffsets).toHaveLength(16)
  })

  it("practicedMeasures 恰好 4 个，且就是小节 17-20", () => {
    expect(analytics.practicedMeasures).toHaveLength(4)
    expect(analytics.practicedMeasures).toEqual(PRACTICE_MEASURE_IDS)
  })

  it("rhythmStability ≥ 85", () => {
    expect(
      metrics.rhythmStability,
      `rhythmStability=${metrics.rhythmStability.toFixed(2)}，offsets=${JSON.stringify(
        analytics.timingOffsets.map((v) => Math.round(v)),
      )}`,
    ).toBeGreaterThanOrEqual(85)
  })

  it("chordClarity ≥ 80", () => {
    expect(
      metrics.chordClarity,
      `chordClarity=${metrics.chordClarity.toFixed(2)}，各小节 confidence=${JSON.stringify(
        analytics.measures.map((m) => +m.chordConfidence.toFixed(3)),
      )}`,
    ).toBeGreaterThanOrEqual(80)
  })

  it("★|median(timingOffsets)| ≤ 25ms（没有系统性偏置）", () => {
    expect(
      Math.abs(median),
      `median=${median.toFixed(2)}ms —— 若接近 ±${ANALYSIS_LATENCY_MS.toFixed(1)}ms，说明分析延迟补偿出了问题`,
    ).toBeLessThanOrEqual(25)
  })

  it("准时演奏时不应出现 miss（每个小节都弹了）", () => {
    const misses = result.judgements.filter(
      (j) => j.kind === "miss" && PRACTICE_MEASURE_IDS.includes(j.measureId),
    )
    expect(misses).toEqual([])
  })

  it("四维评分全部落在 0-100，总评为整数", () => {
    for (const [key, value] of Object.entries(metrics)) {
      expect(Number.isFinite(value), `${key} 不是有限值`).toBe(true)
      expect(value, `${key}=${value} 越界`).toBeGreaterThanOrEqual(0)
      expect(value, `${key}=${value} 越界`).toBeLessThanOrEqual(100)
    }
    expect(Number.isInteger(metrics.overallScore)).toBe(true)
  })
})

describe("DoD #10：整体延后 120ms 演奏", () => {
  const { analytics } = runOfflineSession(SCORE, renderPerformance(120))
  const metrics = computeMetrics(analytics)
  const median = medianOf(analytics.timingOffsets)

  it("median(timingOffsets) ∈ [-135, -105]（负数 = 拖拍，符合 §1.2 符号）", () => {
    expect(
      median,
      `median=${median.toFixed(2)}ms。若为正数说明 timingOffsetMs 的符号写反了`,
    ).toBeGreaterThanOrEqual(-135)
    expect(median).toBeLessThanOrEqual(-105)
  })

  it("rhythmStability ≤ 45（拖 120ms 必须被明显扣分）", () => {
    expect(
      metrics.rhythmStability,
      `rhythmStability=${metrics.rhythmStability.toFixed(2)}`,
    ).toBeLessThanOrEqual(45)
  })

  it("判定几乎全是 late，不出现 early（方向不能反）", () => {
    const kinds = analytics.measures.flatMap((m) => m.offsets).map((o) => Math.sign(o))
    expect(kinds.length).toBeGreaterThan(0)
    // 全部为负（拖拍）
    expect(kinds.every((s) => s < 0)).toBe(true)
  })

  it("与准时演奏相比：rhythmStability 显著更低，offsets 数量相同", () => {
    const onTime = runOfflineSession(SCORE, renderPerformance(0))
    const onTimeMetrics = computeMetrics(onTime.analytics)

    expect(analytics.timingOffsets.length).toBe(onTime.analytics.timingOffsets.length)
    expect(onTimeMetrics.rhythmStability - metrics.rhythmStability).toBeGreaterThan(40)
  })
})

describe("★变异守卫：ignoreAnalysisLatency（证明「减去分析延迟」这一步真的在起作用）", () => {
  const withCompensation = runOfflineSession(SCORE, renderPerformance(0))
  const withoutCompensation = runOfflineSession(SCORE, renderPerformance(0), {
    ignoreAnalysisLatency: true,
  })

  const medianWith = medianOf(withCompensation.analytics.timingOffsets)
  const medianWithout = medianOf(withoutCompensation.analytics.timingOffsets)

  it("抹掉延迟补偿后，|median| 必须突破 DoD #9 的 25ms 门槛（用例转红）", () => {
    expect(Math.abs(medianWith)).toBeLessThanOrEqual(25)
    expect(
      Math.abs(medianWithout),
      `未补偿时 median=${medianWithout.toFixed(2)}ms —— 若它仍 ≤25ms，说明 musicTimeMs 根本没被用到判定链路里`,
    ).toBeGreaterThan(25)
  })

  it("两者之差约等于 ANALYSIS_LATENCY_MS（42.67ms），方向为「更拖拍」", () => {
    const delta = medianWith - medianWithout
    expect(delta).toBeGreaterThan(ANALYSIS_LATENCY_MS * 0.6)
    expect(delta).toBeLessThan(ANALYSIS_LATENCY_MS * 1.4)
    // 不补偿 → 一律被判成更晚（offset 更负）
    expect(medianWithout).toBeLessThan(medianWith)
  })

  it("不补偿时 rhythmStability 也随之下滑（分数是真的受影响，不是只有 median 变）", () => {
    const a = computeMetrics(withCompensation.analytics).rhythmStability
    const b = computeMetrics(withoutCompensation.analytics).rhythmStability
    expect(b).toBeLessThan(a)
  })
})

describe("SLOW PRACTICE：speedPercent 折算", () => {
  it("50% 速度下按更长的拍格演奏 → 同样能拿到 16 条判定与高 rhythmStability", () => {
    const slowBeat = beatDurationMs(SCORE.bpm, 50)
    const events: StrumEvent[] = []
    PRACTICE_MEASURES.forEach((measure, mi) => {
      const freqsHz = measure.chord.notes.map((n) => n.frequency)
      for (let beat = 0; beat < measure.beats; beat += 1) {
        events.push({
          atMs: (mi * measure.beats + beat) * slowBeat,
          freqsHz,
          amplitude: 0.6,
          spreadMs: 10,
          tauSec: STRUM_TAU_SEC,
        })
      }
    })
    const audio = renderStrumSequence(events, SAMPLE_RATE, 4 * 4 * slowBeat + 1000)
    const { analytics } = runOfflineSession(SCORE, audio, { speedPercent: 50 })

    expect(analytics.timingOffsets).toHaveLength(16)
    expect(analytics.practicedMeasures).toEqual(PRACTICE_MEASURE_IDS)
    expect(computeMetrics(analytics).rhythmStability).toBeGreaterThanOrEqual(85)
  })
})
