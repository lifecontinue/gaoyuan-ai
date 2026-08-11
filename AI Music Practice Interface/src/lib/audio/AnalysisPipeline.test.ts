/**
 * AnalysisPipeline 端到端单测（T1.6）
 *
 * 这是 Phase 1 最重要的一组测试 —— 它把"1 秒真实长度的信号"逐帧灌进整条分析链，
 * 断言的是**整体行为**而不是单个函数，因此能覆盖 DoD 里那些"不许乱跳"的要求：
 *
 *   - **DoD #5**：E2(82.41Hz) 拨弦音跑满 1 秒 → 所有确认音 midi === 40，midi === 52 出现 0 次
 *   - **DoD #6**：-70dBFS 噪声跑满 1 秒 → 确认音 0 个
 *   - **DoD #7**：静音逐帧 → pitch 恒为 null 且 rms < 0.00316
 *   - **DoD #8**（管线口径）：Am7 和弦帧的 chroma top-4 = {A,C,E,G}
 *
 * 全程用 VirtualClock 驱动时间，无 AudioContext、无 performance、无随机性。
 */

import { describe, expect, it } from "vitest"

import { AnalysisPipeline } from "@/lib/audio/AnalysisPipeline"
import {
  FRAME_SIZE,
  HOP_SIZE,
  NOISE_GATE_RMS,
  ANALYSIS_LATENCY_MS,
  PEAK_PICK_LATENCY_MS,
  ODF_BACKWARD_DIFF_MS,
  analysisLatencyMs,
} from "@/lib/audio/constants"
import { frequencyToNote, midiToFrequency } from "@/lib/audio/noteUtils"
import { PitchDetector } from "@/lib/audio/PitchDetector"
import { rankPitchClasses } from "@/lib/audio/dsp/chroma"
import {
  generateChordTone,
  generateNoise,
  generatePluckedTone,
  generateSilence,
  generateSine,
  sliceFrames,
} from "@/lib/audio/testing/syntheticAudio"
import { VirtualClock } from "@/lib/audio/testing/virtualClock"
import type { AudioFrame, PitchResult } from "@/lib/audio/types"

const SAMPLE_RATE = 48_000
const PC = { C: 0, E: 4, G: 7, A: 9 } as const

/**
 * 把一段波形按 hop 切帧后全部灌进管线，时间由 VirtualClock 推进。
 * @returns 每一帧的 AudioFrame
 */
function runPipeline(
  pipeline: AnalysisPipeline,
  samples: Float32Array<ArrayBuffer>,
): AudioFrame[] {
  const clock = new VirtualClock()
  const frames = sliceFrames(samples, FRAME_SIZE, HOP_SIZE)
  const results: AudioFrame[] = []
  for (const frame of frames) {
    results.push(pipeline.processBuffer(frame, SAMPLE_RATE, clock.nowSec()))
    clock.advanceHop(HOP_SIZE, SAMPLE_RATE)
  }
  return results
}

/**
 * 测试用 stub 检测器 —— 忽略真实样本，按帧序号吐固定 midi。
 * 用来在「管线级」直接驱动八度纠错，避免依赖 pitchy 的具体数值行为。
 *
 * 前 5 帧吐 midi=40（E2），第 6 帧起吐 midi=52（E3，恰好高一个整八度）。
 * 若八度纠错真的生效，确认音应恒为 40；否则会随第 6 帧跳到 52。
 */
class StubDetector extends PitchDetector {
  private frameIndex = 0

  constructor() {
    super(null, { bufferSize: FRAME_SIZE })
  }

  override detectFromBuffer(
    _samples: Float32Array<ArrayBuffer>,
    _sampleRate: number,
    timestampMs: number,
  ): PitchResult | null {
    const midi = this.frameIndex < 5 ? 40 : 52
    this.frameIndex += 1
    const frequency = midiToFrequency(midi)
    const note = frequencyToNote(frequency)
    return {
      frequency,
      clarity: 1,
      noteName: note.name,
      octave: note.octave,
      midi: note.midi,
      centsOff: 0,
      timestamp: timestampMs,
    }
  }
}

describe("AnalysisPipeline 基本行为", () => {
  it("输出的 AudioFrame 形状完整，字段类型正确", () => {
    const pipeline = new AnalysisPipeline({ sampleRate: SAMPLE_RATE })
    const sine = generateSine(440, SAMPLE_RATE, FRAME_SIZE)
    const frame = pipeline.processBuffer(sine, SAMPLE_RATE, 0)

    expect(frame.timeSec).toBe(0)
    expect(frame.rms).toBeGreaterThan(0)
    expect(Number.isFinite(frame.levelDb)).toBe(true)
    expect(frame.aboveGate).toBe(true)
    expect(frame.pitch).not.toBeNull()
    expect(frame.pitch!.midi).toBe(69)
    expect(frame.chroma).toHaveLength(12)
    // 首帧没有"前一帧幅度谱"可比，通量按定义为 0，因此不可能误报 onset。
    // 这不是"onset 恒为 false"的断言 —— 真实 onset 行为见下面的 describe。
    expect(frame.spectralFlux).toBe(0)
    expect(frame.onset).toBe(false)
    expect(pipeline.processedFrames).toBe(1)
  })

  it("Phase 3 前瞻：musicTimeMs 已扣除分析固有延迟（4096/2/48000 ≈ 42.67ms）", () => {
    const pipeline = new AnalysisPipeline({ sampleRate: SAMPLE_RATE })
    const sine = generateSine(440, SAMPLE_RATE, FRAME_SIZE)

    expect(pipeline.latencyMs).toBeCloseTo(42.6667, 3)
    expect(ANALYSIS_LATENCY_MS).toBeCloseTo(42.6667, 3)

    const frame = pipeline.processBuffer(sine, SAMPLE_RATE, 1)
    // 读取时刻 1000ms，声学时刻应当更早 —— 否则 Phase 3 的 timing 会全体系统性滞后
    expect(frame.musicTimeMs).toBeCloseTo(1000 - 42.6667, 3)
    expect(frame.musicTimeMs).toBeLessThan(frame.timeSec * 1000)
  })

  it("采样率变化时分析延迟同步折算（44100 下 ≈ 46.44ms）", () => {
    const pipeline = new AnalysisPipeline({ sampleRate: 44100 })
    const sine = generateSine(440, 44100, FRAME_SIZE)
    const frame = pipeline.processBuffer(sine, 44100, 2)

    expect(analysisLatencyMs(44100, FRAME_SIZE)).toBeCloseTo(46.4399, 3)
    expect(frame.musicTimeMs).toBeCloseTo(2000 - 46.4399, 3)
  })

  it("reset 后帧计数与稳定器状态归零", () => {
    const pipeline = new AnalysisPipeline({ sampleRate: SAMPLE_RATE })
    const sine = generateSine(440, SAMPLE_RATE, FRAME_SIZE)
    for (let i = 0; i < 5; i += 1) pipeline.processBuffer(sine, SAMPLE_RATE, i * 0.0213)
    expect(pipeline.processedFrames).toBe(5)
    expect(pipeline.stabilizer.lastConfirmed).not.toBeNull()

    pipeline.reset()
    expect(pipeline.processedFrames).toBe(0)
    expect(pipeline.stabilizer.lastConfirmed).toBeNull()
  })
})

describe("DoD #7：静音", () => {
  it("1 秒静音逐帧 pitch 恒为 null，rms 恒低于噪声门限，chroma 全 0", () => {
    const pipeline = new AnalysisPipeline({ sampleRate: SAMPLE_RATE })
    const frames = runPipeline(pipeline, generateSilence(SAMPLE_RATE, SAMPLE_RATE))

    expect(frames.length).toBeGreaterThan(40)
    for (const frame of frames) {
      expect(frame.pitch).toBeNull()
      expect(frame.confirmedNote).toBeNull()
      expect(frame.rms).toBeLessThan(NOISE_GATE_RMS)
      expect(frame.rms).toBeLessThan(0.00316)
      expect(frame.aboveGate).toBe(false)
      for (let i = 0; i < 12; i += 1) expect(frame.chroma[i]).toBe(0)
    }
  })
})

describe("DoD #6：低电平噪声", () => {
  it("1 秒 -70dBFS 噪声：确认音数量为 0", () => {
    const pipeline = new AnalysisPipeline({ sampleRate: SAMPLE_RATE })
    const frames = runPipeline(pipeline, generateNoise(SAMPLE_RATE, SAMPLE_RATE, -70))

    expect(frames.length).toBeGreaterThan(40)
    const confirmedCount = frames.filter((f) => f.confirmedNote !== null).length
    expect(confirmedCount).toBe(0)
    // 同时保证连原始 pitch 都没有（噪声门限先于 MPM）
    expect(frames.every((f) => f.pitch === null)).toBe(true)
  })
})

describe("DoD #5：E2 拨弦音的八度稳定性", () => {
  it("82.41Hz 拨弦音跑满 1 秒：所有确认音 midi === 40，midi === 52 出现 0 次", () => {
    const pipeline = new AnalysisPipeline({ sampleRate: SAMPLE_RATE })
    const tone = generatePluckedTone(82.41, SAMPLE_RATE, SAMPLE_RATE)
    const frames = runPipeline(pipeline, tone)

    const confirmed = frames.map((f) => f.confirmedNote).filter((n) => n !== null)
    expect(confirmed.length).toBeGreaterThan(20)

    const octaveUpCount = confirmed.filter((n) => n!.midi === 52).length
    expect(octaveUpCount).toBe(0)

    for (const note of confirmed) {
      expect(note!.midi).toBe(40)
      expect(note!.noteName).toBe("E")
      expect(note!.octave).toBe(2)
    }
  })

  it("同一段信号里确认音只 onset 一次（不反复 isNew，屏幕不闪）", () => {
    const pipeline = new AnalysisPipeline({ sampleRate: SAMPLE_RATE })
    const frames = runPipeline(pipeline, generatePluckedTone(82.41, SAMPLE_RATE, SAMPLE_RATE))
    const newCount = frames.filter((f) => f.confirmedNote?.isNew).length
    expect(newCount).toBe(1)
  })

  it("A2(110Hz) 拨弦音同样不发生八度上跳", () => {
    const pipeline = new AnalysisPipeline({ sampleRate: SAMPLE_RATE })
    const frames = runPipeline(pipeline, generatePluckedTone(110, SAMPLE_RATE, SAMPLE_RATE))
    const confirmed = frames.map((f) => f.confirmedNote).filter((n) => n !== null)
    expect(confirmed.length).toBeGreaterThan(20)
    expect(confirmed.every((n) => n!.midi === 45)).toBe(true)
  })
})

describe("DoD #5 强化：注入 stub detector 验证八度纠错真的生效", () => {
  it("前 5 帧 midi=40、后 5 帧 midi=52 → 确认音恒为 40（midi=52 出现 0 次）", () => {
    // 注入 stub 检测器，绕过 pitchy —— 直接证明「管线 + 稳定器」会把整八度跳变折回低八度，
    // 而不是只证明 pitchy 恰好没误报（旧用例的真空绿问题）。
    const pipeline = new AnalysisPipeline({ sampleRate: SAMPLE_RATE, detector: new StubDetector() })
    // 真实样本仅用于撑过噪声门限（让 detector 被调用）；具体波形不影响 stub 的吐值。
    const frames = runPipeline(pipeline, generateSine(110, SAMPLE_RATE, SAMPLE_RATE))

    const confirmed = frames.map((f) => f.confirmedNote).filter((n) => n !== null)
    expect(confirmed.length).toBeGreaterThan(8)

    const octaveUpCount = confirmed.filter((n) => n!.midi === 52).length
    expect(octaveUpCount).toBe(0)

    for (const note of confirmed) {
      expect(note!.midi).toBe(40)
    }
    // 前 5 帧的确认音尚未纠错（octaveCorrected=false 是正常的），
    // 但第 6 帧起的整八度跳变必须被折回 —— 因此至少有一条确认音被纠错过，
    // 这才证明「纠错路径真的走通」，而不是恰好没跳。
    expect(confirmed.some((n) => n!.octaveCorrected)).toBe(true)
  })
})

describe("DoD #8（管线口径）：和弦 chroma", () => {
  it("Am7 [110,130.81,164.81,196] 灌满 chroma 环形缓冲后 top-4 = {A,C,E,G}", () => {
    const pipeline = new AnalysisPipeline({ sampleRate: SAMPLE_RATE })
    // 需要足够多的帧把 CHROMA_FFT_SIZE 的环形缓冲填满
    const chord = generateChordTone([110, 130.81, 164.81, 196], SAMPLE_RATE, SAMPLE_RATE, 0.5)
    const frames = runPipeline(pipeline, chord)

    const last = frames[frames.length - 1]
    const ranked = rankPitchClasses(last.chroma)
    expect(new Set(ranked.slice(0, 4))).toEqual(new Set([PC.A, PC.C, PC.E, PC.G]))
  })
})

describe("Phase 3：管线出口的 onset / spectralFlux 是真实值", () => {
  it("静音全程 flux === 0 且 onset 恒为 false（不空转误报）", () => {
    const pipeline = new AnalysisPipeline({ sampleRate: SAMPLE_RATE })
    const frames = runPipeline(pipeline, generateSilence(SAMPLE_RATE, SAMPLE_RATE))

    expect(frames.length).toBeGreaterThan(40)
    for (const f of frames) {
      expect(f.spectralFlux).toBe(0)
      expect(f.onset).toBe(false)
    }
  })

  it("静音后突然起音：flux 出现正尖峰，且至少产出 1 个 onset", () => {
    const pipeline = new AnalysisPipeline({ sampleRate: SAMPLE_RATE })
    const total = SAMPLE_RATE * 2
    const signal = generateSilence(SAMPLE_RATE, total)
    // 1.0s 处注入一次拨弦（A2），用**真实吉他长尾**（默认 tauSec=0.8）。
    // 单次拨弦只有一个起音，长尾的衰减段不是起音 —— 峰值拾取级（局部极大）保证
    // 整条衰减不会被刷成一串 onset，所以这里不需要靠"调短衰减"来让用例变绿。
    const tone = generatePluckedTone(110, SAMPLE_RATE, Math.round(SAMPLE_RATE * 0.9), {
      amplitude: 0.5,
    })
    signal.set(tone, SAMPLE_RATE)

    const frames = runPipeline(pipeline, signal)
    const onsets = frames.filter((f) => f.onset)

    // 单次拨弦 → 恰好 1 个 onset（峰值拾取 + 最小间隔抑制保证不刷成一串）
    expect(onsets).toHaveLength(1)
    expect(onsets[0].spectralFlux).toBeGreaterThanOrEqual(0)
    // onset 必须落在起音之后的一个合理窗口内（分析窗 85ms + 几帧响应）。
    // 用 onsetTimeMs 而非 musicTimeMs —— 前者才补掉了峰值拾取的 1 hop 前瞻。
    expect(onsets[0].onsetTimeMs).toBeGreaterThan(900)
    expect(onsets[0].onsetTimeMs).toBeLessThan(1150)
    // 两套补偿都已施加：
    //  · 峰值拾取的前瞻 1 hop（≈PEAK_PICK_LATENCY_MS）
    //  · ODF 后向差分的 ½ hop（≈ODF_BACKWARD_DIFF_MS）
    // 本 onset 抛物线插值 delta≈0，故 gap≈1.5×hop≈32.2ms；±½ hop 摆动由宽松精度与区间双断言兜底。
    const onsetGap = onsets[0].musicTimeMs - onsets[0].onsetTimeMs
    expect(onsetGap).toBeGreaterThan(PEAK_PICK_LATENCY_MS)
    expect(onsetGap).toBeLessThanOrEqual(2 * PEAK_PICK_LATENCY_MS + 1)
    expect(onsetGap).toBeCloseTo(PEAK_PICK_LATENCY_MS + ODF_BACKWARD_DIFF_MS, 0)

    // flux 恒非负（只累加正增量）
    for (const f of frames) expect(f.spectralFlux).toBeGreaterThanOrEqual(0)
  })

  it("reset() 清空 onset 历史：同一段信号重跑两次结果完全一致", () => {
    const total = SAMPLE_RATE
    const signal = generateSilence(SAMPLE_RATE, total)
    signal.set(generatePluckedTone(110, SAMPLE_RATE, SAMPLE_RATE >> 1), SAMPLE_RATE >> 2)

    const pipeline = new AnalysisPipeline({ sampleRate: SAMPLE_RATE })
    const first = runPipeline(pipeline, signal).map((f) => f.onset)
    pipeline.reset()
    const second = runPipeline(pipeline, signal).map((f) => f.onset)

    expect(second).toEqual(first)
  })
})

describe("静音 → 发声 → 静音 的完整包络", () => {
  it("发声段有确认音，尾部静音段释放确认音", () => {
    const pipeline = new AnalysisPipeline({ sampleRate: SAMPLE_RATE })
    const total = SAMPLE_RATE * 2
    const signal = generateSilence(SAMPLE_RATE, total)
    // 中间 0.5s~1.2s 注入 A4
    const tone = generateSine(440, SAMPLE_RATE, Math.round(SAMPLE_RATE * 0.7))
    signal.set(tone, Math.round(SAMPLE_RATE * 0.5))

    const frames = runPipeline(pipeline, signal)
    const withNote = frames.filter((f) => f.confirmedNote !== null)
    expect(withNote.length).toBeGreaterThan(10)
    expect(withNote.every((f) => f.confirmedNote!.midi === 69)).toBe(true)

    // 最后一帧（远在信号结束之后）必须已经释放
    expect(frames[frames.length - 1].confirmedNote).toBeNull()
    expect(frames[frames.length - 1].pitch).toBeNull()
  })
})
