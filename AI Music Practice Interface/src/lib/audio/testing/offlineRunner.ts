/**
 * offlineRunner — 离线驱动整条分析链路（★ Phase 3 验收核心，DEVELOPMENT_PLAN §4）
 *
 * 输入一段合成音频（`renderStrumSequence` 产出）与曲谱，逐帧喂给
 * AnalysisPipeline → ScoreFollower → ChordRecognizer → PracticeCollector，
 * 输出 `SessionAnalytics` + 全部 `TimingJudgement`。
 *
 * 这条链路与实时路径**完全一致**（统一的 16384 chroma 口径、同一套 onset / 判定逻辑），
 * 因此离线验收即等于生产验收 —— qa-p1 担心的"测试跑的不是生产配置"在口径统一后自动消除。
 *
 * 不依赖麦克风 / AudioContext / performance，node 可跑。
 */

import { AnalysisPipeline } from "@/lib/audio/AnalysisPipeline"
import { ChordRecognizer } from "@/lib/audio/ChordRecognizer"
import { ScoreFollower, positionAt } from "@/lib/audio/ScoreFollower"
import { PracticeCollector } from "@/lib/practice/collector"
import { clamp } from "@/lib/practice/metrics"
import { VirtualClock } from "@/lib/audio/testing/virtualClock"
import { sliceFrames } from "@/lib/audio/testing/syntheticAudio"
import {
  CHROMA_FFT_SIZE,
  FRAME_SIZE,
  HOP_SIZE,
  SAMPLE_RATE_FALLBACK,
  analysisLatencyMs,
} from "@/lib/audio/constants"
import type { AudioFrame } from "@/lib/audio/types"
import type { Score } from "@/lib/music/types"
import { flattenMeasures } from "@/lib/music/types"
import type { SessionAnalytics, TimingJudgement } from "@/lib/practice/types"

/** 离线路径选项 */
export interface OfflineRunOptions {
  /** 采样率（默认 48000） */
  sampleRate?: number
  /** 分析窗口（默认 FRAME_SIZE = 4096，仅服务 pitch/YIN 与 onset） */
  frameSize?: number
  /** 相邻帧前进样本数（默认 HOP_SIZE = 1024） */
  hopSize?: number
  /** chroma FFT 长度（默认 CHROMA_FFT_SIZE = 16384，实时与离线统一口径） */
  chromaFftSize?: number
  /** 播放速度百分比（默认 100） */
  speedPercent?: number
  /**
   * ★ 变异守卫开关：置 true 时用**读取时刻**（`timeSec*1000`）代替声学时刻
   * （`musicTimeMs`）做判定，等价于"忘了减 ANALYSIS_LATENCY_MS"。
   * 只允许测试用来证明"减延迟"这一步真的在起作用，生产路径永远不传。
   */
  ignoreAnalysisLatency?: boolean
}

/** 离线运行结果 */
export interface OfflineRunResult {
  /** 整段会话的累积统计 */
  analytics: SessionAnalytics
  /** 所有产出的 timing 判定（按出现顺序，含 miss） */
  judgements: TimingJudgement[]
  /** 处理的总帧数（诊断用） */
  frameCount: number
}

/** 单音音准分：|cents| ≤ 10 → 100 分，40 cents 处归零，线性过渡 */
function centsToScore(centsOffValue: number): number {
  return clamp(100 - Math.max(0, Math.abs(centsOffValue) - 10) * (100 / 30), 0, 100)
}

/**
 * 跑一段离线练习会话。
 *
 * @param score   曲谱（提供 BPM 与小节和弦）
 * @param audio   合成音频缓冲区（`renderStrumSequence` 产出）
 * @param options 可选覆盖参数（默认即生产配置）
 */
export function runOfflineSession(
  score: Score,
  audio: Float32Array<ArrayBuffer>,
  options: OfflineRunOptions = {},
): OfflineRunResult {
  const sampleRate = options.sampleRate ?? SAMPLE_RATE_FALLBACK
  const frameSize = options.frameSize ?? FRAME_SIZE
  const hopSize = options.hopSize ?? HOP_SIZE
  const chromaFftSize = options.chromaFftSize ?? CHROMA_FFT_SIZE
  const speedPercent = options.speedPercent ?? 100

  const clock = new VirtualClock()
  const follower = new ScoreFollower(score, clock)
  follower.setSpeed(speedPercent)
  follower.start()

  const pipeline = new AnalysisPipeline({ sampleRate, frameSize, hopSize, chromaFftSize })
  const recognizer = new ChordRecognizer()
  const collector = new PracticeCollector()

  const measures = flattenMeasures(score.sections)
  const frames = sliceFrames(audio, frameSize, hopSize)
  const judgements: TimingJudgement[] = []

  for (let i = 0; i < frames.length; i += 1) {
    // 帧时间取窗口**结束**时刻；声学中心 = timeSec*1000 - ANALYSIS_LATENCY_MS，
    // 由 AnalysisPipeline 填进 frame.musicTimeMs。
    const timeSec = (i * hopSize + frameSize) / sampleRate
    clock.setMs(timeSec * 1000)

    let frame: AudioFrame = pipeline.processBuffer(frames[i], sampleRate, timeSec)
    if (options.ignoreAnalysisLatency) {
      // 变异守卫：抹掉**分析延迟**补偿，判定应整体系统性滞后 ≈ 42.7ms。
      // onsetTimeMs 要把同一笔 ANALYSIS_LATENCY_MS 加回去（而不是直接置成 timeSec*1000），
      // 这样峰值拾取的一个 hop 补偿仍然保留 —— 本守卫只针对分析延迟这一项，
      // 否则两项混在一起，守卫变红时分不清是哪一项失效了。
      const latency = analysisLatencyMs(sampleRate, frameSize)
      frame = {
        ...frame,
        musicTimeMs: frame.timeSec * 1000,
        onsetTimeMs: frame.onsetTimeMs + latency,
      }
    }

    const pos = positionAt(measures, score.bpm, speedPercent, null, frame.musicTimeMs)
    const expectedChord = measures[pos.measureIndex]?.chord ?? null

    recognizer.setExpected(expectedChord)
    const chordMatch =
      expectedChord && frame.aboveGate
        ? recognizer.recognizeFromChroma(frame.chroma, expectedChord)
        : null

    const frameJudgements = follower.ingestFrame(frame)
    for (const j of frameJudgements) judgements.push(j)
    collector.ingestJudgements(frameJudgements)

    collector.ingestFrame({
      measureId: pos.measureId,
      hasActivity: frame.aboveGate,
      chroma: frame.chroma,
      expectedChord,
      chordMatch,
      centsScore: frame.confirmedNote ? centsToScore(frame.confirmedNote.centsOff) : null,
    })
  }

  const trailing = follower.finalize()
  for (const j of trailing) judgements.push(j)
  collector.ingestJudgements(trailing)

  return { analytics: collector.finalize(), judgements, frameCount: frames.length }
}
