/**
 * OnsetDetector 单测（T3.1）
 *
 * **DoD #2 / #3 / #4 的机器验证在这里。**
 *   #2：8 次准时扫弦（BPM 92 → 间隔 652.17ms）→ 恰好 8 个 onset，时间误差 ≤ 25ms
 *   #3：同样 8 次但带 ±60ms 随机抖动 → 仍然恰好 8 个（不多不少）
 *   #4：3 秒静音 → 0 个 onset
 *
 * 分两层测：
 *   A. **单元层**：直接 push 人造 dB 谱，验证阈值 / 最小间隔 / 长度自适应等分支
 *   B. **集成层**：走完整 AnalysisPipeline（生产配置），用 renderStrumSequence 合成扫弦
 *      —— 这一层才是 DoD 真正要的东西，因为它连带验证了 FFT、噪声门限与延迟补偿。
 */

import { describe, expect, it } from "vitest"

import { AnalysisPipeline } from "@/lib/audio/AnalysisPipeline"
import {
  FRAME_SIZE,
  HOP_SIZE,
  ODF_BACKWARD_DIFF_MS,
  ONSET_FLUX_FACTOR,
  ONSET_MIN_INTERVAL_MS,
  PEAK_PICK_LATENCY_MS,
  SAMPLE_RATE_FALLBACK,
} from "@/lib/audio/constants"
import { OnsetDetector } from "@/lib/audio/OnsetDetector"
import {
  createRandom,
  generateSilence,
  renderStrumSequence,
  sliceFrames,
  type StrumEvent,
} from "@/lib/audio/testing/syntheticAudio"
import { VirtualClock } from "@/lib/audio/testing/virtualClock"
import { buildChord } from "@/lib/music/theory"

const SAMPLE_RATE = SAMPLE_RATE_FALLBACK

/** BPM 92 → 一拍 652.1739ms（qa-p1 锁定的权威锚值） */
const BEAT_MS = 60000 / 92

/** Am7 的四个内音频率（与曲谱同源） */
const AM7_FREQS = buildChord("Am7", 2).notes.map((n) => n.frequency)

/**
 * ★ 验收基线：真实吉他长尾 tau = 0.8s（= `DEFAULT_PLUCK_TAU_SEC`，不传即此值）。
 *
 * 单音渲染 4×tau ≈ 3.2s，而 BPM 92 拍间只有 652ms —— 前序尾音与后续扫弦**必然重叠**，
 * 这就是生产环境的样子，DoD 全部按它验收。
 * 曾经有一版把测试改成 0.15s 让它变绿，被 team-lead 实测证伪（0.15 照样 25 个 onset），
 * 真正的根因是检测器缺峰值拾取级。所以这里显式写死 0.8 并附带说明，防止再被"调绿"。
 */
const BASELINE_TAU_SEC = 0.8

/**
 * 断奏 / 闷音场景的短衰减常数（秒）——**补充**用例，不能替代 0.8 基线。
 * 单音 ~600ms 内衰减到噪声门限以下，拍间留白，是比基线更宽松的场景。
 */
const STACCATO_TAU_SEC = 0.15

/** 构造一个"平坦 dB 谱"（长度 = FRAME_SIZE/2） */
function flatDb(db: number, length = FRAME_SIZE >> 1): Float32Array<ArrayBuffer> {
  const out = new Float32Array(new ArrayBuffer(length * 4))
  out.fill(db)
  return out
}

/**
 * 跑一段音频过完整管线，返回所有 onset 的**声学时刻**（ms）。
 *
 * 取的是 `frame.onsetTimeMs` 而非 `frame.musicTimeMs` —— 峰值拾取让结论比峰本身
 * 晚一个 hop，`onsetTimeMs` 才是补偿后的峰值帧时刻（见 AudioFrame.onsetTimeMs 注释）。
 *
 * @param peakPicking 置 false 即摘掉峰值拾取级（★变异守卫专用）
 */
function detectOnsetTimes(
  audio: Float32Array<ArrayBuffer>,
  peakPicking = true,
): number[] {
  const pipeline = new AnalysisPipeline({ sampleRate: SAMPLE_RATE, onsetPeakPicking: peakPicking })
  const clock = new VirtualClock()
  const frames = sliceFrames(audio, FRAME_SIZE, HOP_SIZE)
  const times: number[] = []

  for (let i = 0; i < frames.length; i += 1) {
    const timeSec = (i * HOP_SIZE + FRAME_SIZE) / SAMPLE_RATE
    clock.setMs(timeSec * 1000)
    const frame = pipeline.processBuffer(frames[i], SAMPLE_RATE, timeSec)
    if (frame.onset) times.push(frame.onsetTimeMs)
  }
  return times
}

/**
 * 生成 n 次扫弦事件，第 k 次落在 `startMs + k*BEAT_MS + jitter(k)`。
 * `tauSec` 默认走 0.8 基线（真实吉他长尾），断奏用例显式传 `STACCATO_TAU_SEC`。
 */
function strumEvents(
  count: number,
  startMs: number,
  jitter: (k: number) => number = () => 0,
  tauSec: number = BASELINE_TAU_SEC,
): StrumEvent[] {
  return Array.from({ length: count }, (_, k) => ({
    atMs: startMs + k * BEAT_MS + jitter(k),
    freqsHz: AM7_FREQS,
    amplitude: 0.6,
    tauSec,
  }))
}

// ---------------------------------------------------------------------------
// A. 单元层：阈值 / 抑制 / 自适应分支
// ---------------------------------------------------------------------------

/** 单元层用的帧间隔（= 生产 hop，21.333ms）。峰值拾取的补偿量正是它。 */
const HOP_T_MS = PEAK_PICK_LATENCY_MS

/** 按 hop 节奏喂入一串平坦 dB 值，返回检出的 onset 时刻（已含峰值拾取补偿） */
function pushFlatSeries(
  d: OnsetDetector,
  dbs: readonly number[],
  aboveGate = true,
): number[] {
  const times: number[] = []
  dbs.forEach((db, i) => {
    const r = d.push(flatDb(db), aboveGate, i * HOP_T_MS)
    if (r.isOnset) times.push(r.onsetTimeMs)
  })
  return times
}

/**
 * 每个 bin 独立小幅抖动的 dB 谱。
 *
 * 平坦谱下 flux 是"全 0 或全大"的二值信号，中位数恒为 0，**测不出自适应阈值**。
 * 让每个 bin 各自随机涨跌，flux 就变成 2048 个正增量之和 —— 由中心极限定理它稳定在
 * 一个正的基线上，这才是真实背景噪声的形态，也才能真正压测第 ② 级。
 */
function jitterDb(
  rng: () => number,
  baseDb: number,
  spreadDb: number,
  length = FRAME_SIZE >> 1,
): Float32Array<ArrayBuffer> {
  const out = new Float32Array(new ArrayBuffer(length * 4))
  for (let i = 0; i < length; i += 1) out[i] = baseDb + (rng() * 2 - 1) * spreadDb
  return out
}

/**
 * 双 bin 非对称谱：其余 bin 压到 -120dB 地板，只在 binA / binB 两个指定 bin 上给能量。
 * 用来构造"非对称 flux 峰"——验证抛物线插值能把 onset 时刻推离 hop 栅格（亚 hop 定位）。
 */
function twoBinDb(
  binA: number,
  binB: number,
  length = FRAME_SIZE >> 1,
): Float32Array<ArrayBuffer> {
  const out = flatDb(-120, length)
  out[10] = binA
  out[20] = binB
  return out
}

/** onset 时刻相对真实起音的最大绝对误差（ms） */
function maxAbsTimingError(times: number[], evs: { atMs: number }[]): number {
  return Math.max(...times.map((t, k) => Math.abs(t - evs[k].atMs)))
}

describe("OnsetDetector：单元行为（四级流水线）", () => {
  it("首帧无前序谱 → flux = 0，绝不误报 onset", () => {
    const d = new OnsetDetector(FRAME_SIZE >> 1)
    const r = d.push(flatDb(-20), true, 0)
    expect(r.flux).toBe(0)
    expect(r.isOnset).toBe(false)
  })

  it("能量骤升：峰所在帧先不下结论，下一帧才确认（峰值拾取的 1 帧前瞻）", () => {
    const d = new OnsetDetector(FRAME_SIZE >> 1)
    d.push(flatDb(-80), true, 0)

    // 峰就在这一帧，但还没看到 n+1，按定义不能判它是极大值
    const rise = d.push(flatDb(-20), true, HOP_T_MS)
    expect(rise.flux).toBeGreaterThan(0)
    expect(rise.isOnset).toBe(false)

    // 下一帧回落 → n-1 被确认为局部极大 → onset
    const confirm = d.push(flatDb(-20), true, 2 * HOP_T_MS)
    expect(confirm.isOnset).toBe(true)
    // ★ 峰值帧时刻 = 1 个 hop（PEAK_PICK_LATENCY_MS）；但 ODF 后向差分把变化率记晚了
    //   半帧，故报告时刻再扣掉 ODF_BACKWARD_DIFF_MS（半 hop）。两者都用实测帧间距现算。
    expect(confirm.onsetTimeMs).toBeCloseTo(PEAK_PICK_LATENCY_MS - ODF_BACKWARD_DIFF_MS, 9)
    expect(PEAK_PICK_LATENCY_MS - confirm.onsetTimeMs).toBeCloseTo(ODF_BACKWARD_DIFF_MS, 9)
  })

  it("抛物线插值：非对称 flux 峰会把 onset 时刻推离 hop 栅格（亚 hop 定位）", () => {
    const d = new OnsetDetector(FRAME_SIZE >> 1)
    // 构造非对称峰：frame0 静默 → frame1 在 A 上猛涨（大 flux）→ frame2 在 B 上小涨（小 flux）。
    // 顶点（峰）落在 frame1，但右侧邻帧 flux 仍 > 0（非对称），抛物线把顶点推向右侧亚 hop 处。
    d.push(twoBinDb(-80, -80), true, 0)
    d.push(twoBinDb(-20, -80), true, HOP_T_MS)
    const confirm = d.push(twoBinDb(-25, -30), true, 2 * HOP_T_MS)
    expect(confirm.isOnset).toBe(true)

    // 对称峰会恰好落在「峰值帧 − 后向差分半 hop」= ODF_BACKWARD_DIFF_MS（10.67ms）；
    // 非对称点应把落点往右侧邻帧方向推，明显大于该值且不超过峰值帧时刻。
    const gridCorrected = PEAK_PICK_LATENCY_MS - ODF_BACKWARD_DIFF_MS
    expect(confirm.onsetTimeMs).toBeGreaterThan(gridCorrected + 0.5)
    expect(confirm.onsetTimeMs).toBeLessThan(PEAK_PICK_LATENCY_MS)
  })

  it("能量衰减 → flux = 0 → 不产生 onset（衰减段不是起音）", () => {
    const d = new OnsetDetector(FRAME_SIZE >> 1)
    expect(pushFlatSeries(d, [-20, -40, -60, -80])).toEqual([])
  })

  it("稳态（每帧完全相同）→ flux 恒为 0，不刷 onset", () => {
    const d = new OnsetDetector(FRAME_SIZE >> 1)
    expect(pushFlatSeries(d, Array.from({ length: 50 }, () => -20))).toEqual([])
  })

  it("未过噪声门限时即使 flux 很大也不判 onset（aboveGate 是硬闸门）", () => {
    const d = new OnsetDetector(FRAME_SIZE >> 1)
    expect(pushFlatSeries(d, [-80, -20, -20, -20], false)).toEqual([])
  })

  it(`最小间隔抑制：${ONSET_MIN_INTERVAL_MS}ms 内的第二个峰被吃掉`, () => {
    const d = new OnsetDetector(FRAME_SIZE >> 1)
    // 三个等高的脉冲，峰分别落在第 1 / 4 / 7 帧（21.3 / 85.3 / 149.3ms）
    const times = pushFlatSeries(d, [-80, -20, -20, -80, -20, -20, -80, -20, -20])
    // 第 2 个峰（帧 4）距第 1 个（帧 1）只有 64ms（< 100ms）→ 被吃；
    // 第 3 个峰（帧 7）距第 1 个 128ms → 放行
    expect(times).toHaveLength(2)
    // 峰值帧时刻 = 帧序号 × hop；报告时刻再扣 ODF 后向差分半 hop
    expect(times[0]).toBeCloseTo(1 * HOP_T_MS - ODF_BACKWARD_DIFF_MS, 6)
    expect(times[1]).toBeCloseTo(7 * HOP_T_MS - ODF_BACKWARD_DIFF_MS, 6)
  })

  it("一次扫弦的 6 根弦（12ms 一根，共 60ms）被压成 1 个 onset", () => {
    const d = new OnsetDetector(FRAME_SIZE >> 1)
    d.push(flatDb(-80), true, 0)
    let count = 0
    // 每 12ms 能量再涨一档，模拟 6 根弦依次入窗（flux 单调爬升，全程无局部极大）
    for (let s = 0; s < 6; s += 1) {
      if (d.push(flatDb(-70 + s * 10), true, 20 + s * 12).isOnset) count += 1
    }
    // 能量到顶后转入延音 → 爬升段的顶点这时才被确认为唯一的峰
    if (d.push(flatDb(-20), true, 92).isOnset) count += 1
    expect(count).toBe(1)
  })

  it("频谱长度变化（切换输入设备）→ 历史失效重建，不抛错也不误报", () => {
    const d = new OnsetDetector(FRAME_SIZE >> 1)
    d.push(flatDb(-20), true, 0)
    // 长度从 2048 变到 1024
    const r = d.push(flatDb(-20, 1024), true, HOP_T_MS)
    expect(r.flux).toBe(0)
    expect(r.isOnset).toBe(false)
    expect(() => d.push(flatDb(-10, 1024), true, 2 * HOP_T_MS)).not.toThrow()
  })

  it("reset() 清空历史与最小间隔记忆：重跑同一序列结果一致", () => {
    const d = new OnsetDetector(FRAME_SIZE >> 1)
    // 两个相距 9 帧（192ms > 100ms）的脉冲 → 应各产出 1 个 onset
    const pattern = [-80, -20, -20, -80, -80, -80, -80, -80, -80, -20, -20]
    const first = pushFlatSeries(d, pattern)
    d.reset()
    const second = pushFlatSeries(d, pattern)
    expect(second).toEqual(first)
    expect(first).toHaveLength(2)
    // 峰值帧时刻 = 帧序号 × hop；报告时刻再扣 ODF 后向差分半 hop
    expect(first[0]).toBeCloseTo(1 * HOP_T_MS - ODF_BACKWARD_DIFF_MS, 6)
    expect(first[1]).toBeCloseTo(9 * HOP_T_MS - ODF_BACKWARD_DIFF_MS, 6)
  })

  it("★自适应阈值：每 bin 持续小幅抖动的背景，至多 1 个（首帧放宽）误报", () => {
    const d = new OnsetDetector(FRAME_SIZE >> 1)
    const rng = createRandom(20240607)
    let triggered = 0
    for (let i = 0; i < 200; i += 1) {
      if (d.push(jitterDb(rng, -30, 2), true, i * HOP_T_MS).isOnset) triggered += 1
    }
    // 注：firstEver 放宽（首 onset 任意正 flux 即触发）会让"从首帧起就存在的稳态抖动"
    // 在最开头产生至多 1 个伪 onset；这是有界的、不会滚雪球，真实会话以静音起手不会触发。
    // 真正要守住的不变量是：抖动背景不该刷出一串 onset。
    expect(
      triggered,
      `背景抖动误报了 ${triggered} 个 onset —— 超出 firstEver 放宽之外，说明 ONSET_FLUX_FACTOR 太低或峰值拾取失效`,
    ).toBeLessThanOrEqual(1)
  })

  it("★同一段抖动背景上叠一次真实骤升 → 真起音必被检出，且至多 1 个首帧伪 onset", () => {
    const d = new OnsetDetector(FRAME_SIZE >> 1)
    const rng = createRandom(20240607)
    let triggered = 0
    for (let i = 0; i < 200; i += 1) {
      // 第 100 帧突然抬高 20dB（真实起音），其余帧维持背景抖动
      const db = i === 100 ? jitterDb(rng, -10, 2) : jitterDb(rng, -30, 2)
      if (d.push(db, true, i * HOP_T_MS).isOnset) triggered += 1
    }
    // 不变量：真起音一定被检出（≥1）；firstEver 放宽至多再贡献 1 个首帧伪 onset（≤2）。
    expect(triggered).toBeGreaterThanOrEqual(1)
    expect(triggered).toBeLessThanOrEqual(2)
  })
})

// ---------------------------------------------------------------------------
// B. 集成层：完整 AnalysisPipeline + 合成扫弦（DoD #2 / #3 / #4）
// ---------------------------------------------------------------------------

describe("DoD #4：3 秒静音 → 0 个 onset", () => {
  it("绝对静音", () => {
    expect(detectOnsetTimes(generateSilence(SAMPLE_RATE, SAMPLE_RATE * 3))).toEqual([])
  })

  it("带 -70dBFS 底噪的 3 秒（门限之下）同样 0 个", () => {
    const noisy = generateSilence(SAMPLE_RATE, SAMPLE_RATE * 3)
    const rng = createRandom(4242)
    const target = Math.pow(10, -70 / 20)
    for (let i = 0; i < noisy.length; i += 1) noisy[i] = (rng() * 2 - 1) * target * 1.7
    expect(detectOnsetTimes(noisy)).toEqual([])
  })
})

describe("DoD #2：8 次准时扫弦（BPM 92）→ 8 个 onset，时间误差 ≤ 25ms", () => {
  /** 首拍留 500ms 前导静音，让自适应阈值先有一段"安静"的历史 */
  const START_MS = 500
  const events = strumEvents(8, START_MS)
  const totalMs = START_MS + 8 * BEAT_MS + 800

  it("恰好检出 8 个 onset", () => {
    const times = detectOnsetTimes(renderStrumSequence(events, SAMPLE_RATE, totalMs))
    expect(times).toHaveLength(8)
  })

  it("每个 onset 与真实起音时刻的误差 ≤ 25ms", () => {
    const times = detectOnsetTimes(renderStrumSequence(events, SAMPLE_RATE, totalMs))
    expect(times).toHaveLength(8)

    times.forEach((t, k) => {
      const expectedMs = events[k].atMs
      const errorMs = t - expectedMs
      expect(
        Math.abs(errorMs),
        `第 ${k + 1} 次扫弦：检出 ${t.toFixed(1)}ms，真实 ${expectedMs.toFixed(1)}ms，误差 ${errorMs.toFixed(1)}ms`,
      ).toBeLessThanOrEqual(25)
    })
  })

  it("相邻 onset 间隔稳定在一拍附近（±25ms），不漏拍不重拍", () => {
    const times = detectOnsetTimes(renderStrumSequence(events, SAMPLE_RATE, totalMs))
    for (let k = 1; k < times.length; k += 1) {
      expect(Math.abs(times[k] - times[k - 1] - BEAT_MS)).toBeLessThanOrEqual(25)
    }
  })
})

describe("DoD #3：8 次扫弦 + ±60ms 抖动 → 仍然恰好 8 个 onset", () => {
  const START_MS = 500

  /** 确定性抖动：mulberry32 映射到 [-60, 60] */
  function makeJitter(seed: number): (k: number) => number {
    const rng = createRandom(seed)
    const values = Array.from({ length: 8 }, () => (rng() * 2 - 1) * 60)
    return (k) => values[k]
  }

  it("种子 1：8 个 onset，且每个都跟得上抖动后的真实时刻（≤ 25ms）", () => {
    const jitter = makeJitter(1)
    const events = strumEvents(8, START_MS, jitter)
    const totalMs = START_MS + 8 * BEAT_MS + 800
    const times = detectOnsetTimes(renderStrumSequence(events, SAMPLE_RATE, totalMs))

    expect(times).toHaveLength(8)
    times.forEach((t, k) => {
      expect(
        Math.abs(t - events[k].atMs),
        `第 ${k + 1} 次：检出 ${t.toFixed(1)}ms vs 真实 ${events[k].atMs.toFixed(1)}ms`,
      ).toBeLessThanOrEqual(25)
    })
  })

  it("多个随机种子下 onset 数量恒为 8（不因抖动多算或漏算）", () => {
    for (const seed of [7, 99, 2024, 31337]) {
      const events = strumEvents(8, START_MS, makeJitter(seed))
      const totalMs = START_MS + 8 * BEAT_MS + 800
      const times = detectOnsetTimes(renderStrumSequence(events, SAMPLE_RATE, totalMs))
      expect(times, `seed=${seed} 检出 ${times.length} 个 onset`).toHaveLength(8)
    }
  })
})

describe("onset 与真实起音的因果性", () => {
  it("onset 绝不早于真实起音超过一个分析窗（不允许「预知未来」）", () => {
    const events = strumEvents(8, 500)
    const times = detectOnsetTimes(
      renderStrumSequence(events, SAMPLE_RATE, 500 + 8 * BEAT_MS + 800),
    )
    const windowMs = (FRAME_SIZE / SAMPLE_RATE) * 1000
    times.forEach((t, k) => {
      expect(t).toBeGreaterThan(events[k].atMs - windowMs)
    })
  })

  it("单次扫弦只产出 1 个 onset（6 根弦不会刷成 6 个）", () => {
    const sixString = [82.41, 110, 146.83, 196, 246.94, 329.63]
    const audio = renderStrumSequence(
      [{ atMs: 400, freqsHz: sixString, amplitude: 0.7, spreadMs: 12 }],
      SAMPLE_RATE,
      2000,
    )
    expect(detectOnsetTimes(audio)).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// C. 断奏补充场景（tau=0.15）—— **不能替代 0.8 基线**
// ---------------------------------------------------------------------------

describe("断奏 / 闷音（tau=0.15，宽松场景）", () => {
  it("8 次断奏扫弦同样恰好 8 个 onset，误差 ≤ 25ms", () => {
    const events = strumEvents(8, 500, () => 0, STACCATO_TAU_SEC)
    const times = detectOnsetTimes(
      renderStrumSequence(events, SAMPLE_RATE, 500 + 8 * BEAT_MS + 800),
    )
    expect(times).toHaveLength(8)
    times.forEach((t, k) => {
      expect(
        Math.abs(t - events[k].atMs),
        `第 ${k + 1} 次断奏：检出 ${t.toFixed(1)}ms vs 真实 ${events[k].atMs.toFixed(1)}ms`,
      ).toBeLessThanOrEqual(25)
    })
  })
})

// ---------------------------------------------------------------------------
// D. ★变异守卫：摘掉第 3 级峰值拾取，tau=0.8 基线必须整片转红
// ---------------------------------------------------------------------------

describe("★变异守卫：摘掉峰值拾取级（第 3 级）", () => {
  const START_MS = 500
  const totalMs = START_MS + 8 * BEAT_MS + 800
  const events = strumEvents(8, START_MS)
  const audio = renderStrumSequence(events, SAMPLE_RATE, totalMs)

  const withPeak = detectOnsetTimes(audio, true)
  const withoutPeak = detectOnsetTimes(audio, false)

  /**
   * 确定性抖动：mulberry32 映射到 [-60, 60]（与 DoD #3 同款）。
   * 放在本 describe 内，避免污染外层作用域。
   */
  function makeJitter(seed: number): (k: number) => number {
    const rng = createRandom(seed)
    const values = Array.from({ length: 8 }, () => (rng() * 2 - 1) * 60)
    return (k) => values[k]
  }

  it("有峰值拾取 → DoD#2 恰好 8 个且 timing ≤25ms；摘掉后仍是 8 个但 timing 跌破 25ms 预算", () => {
    expect(withPeak).toHaveLength(8)
    expect(withoutPeak).toHaveLength(8)
    // 峰值拾取 + 抛物线插值把误差压进预算（实测全场景 ≤20.7ms）
    expect(
      maxAbsTimingError(withPeak, events),
      `有峰值拾取时 timing 误差应 ≤25ms，实际最大 ${maxAbsTimingError(withPeak, events).toFixed(1)}ms`,
    ).toBeLessThanOrEqual(25)
    // 摘掉后只剩 hop 栅格量化 + 后向差分半 hop，误差系统性放大（实测 33~47ms）
    expect(
      maxAbsTimingError(withoutPeak, events),
      `摘掉峰值拾取后 timing 误差应 >25ms（证明第 3 级承重），实际最大 ${maxAbsTimingError(withoutPeak, events).toFixed(1)}ms`,
    ).toBeGreaterThan(25)
  })

  it("摘掉峰值拾取后 onset 落点系统性偏早，有峰值拾取时系统性偏晚（方向相反，证明第 3 级改变了定位点）", () => {
    const errWith = withPeak.map((t, k) => t - events[k].atMs)
    const errWithout = withoutPeak.map((t, k) => t - events[k].atMs)
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
    // 无峰值拾取：缺失抛物线亚 hop 定位，落点钉在起音上升沿「最早越过阈值」的帧 → 系统性偏早
    expect(
      mean(errWithout),
      `摘掉峰值拾取后平均偏差应明显偏早（负），实际 ${mean(errWithout).toFixed(1)}ms`,
    ).toBeLessThan(-10)
    // 有峰值拾取：落点移到 flux 峰（晚于起音起点），只减后向差分半 hop → 系统性偏晚，
    // 但最大误差仍被压在 25ms 预算内（见上一条）
    expect(
      mean(errWith),
      `有峰值拾取时平均偏差应明显偏晚（正），实际 ${mean(errWith).toFixed(1)}ms`,
    ).toBeGreaterThan(10)
  })

  it("统计：7 条 timing 断言在摘掉峰值拾取后全部转红（证明该级真正承重）", () => {
    /** 每条 = 一条 timing 预算断言的可执行副本；返回 true 表示"绿" */
    const checks: { name: string; run: (peakPicking: boolean) => boolean }[] = [
      {
        name: "DoD#2 baseline：max|err| ≤ 25ms",
        run: (p) => {
          const t = detectOnsetTimes(audio, p)
          return t.length === 8 && t.every((v, k) => Math.abs(v - events[k].atMs) <= 25)
        },
      },
      ...[1, 7, 99, 2024, 31337, 55555].map((seed) => ({
        name: `DoD#3 seed ${seed}：max|err| ≤ 25ms`,
        run: (p: boolean) => {
          const ev = strumEvents(8, START_MS, makeJitter(seed))
          const t = detectOnsetTimes(renderStrumSequence(ev, SAMPLE_RATE, totalMs), p)
          return t.length === 8 && t.every((v, k) => Math.abs(v - ev[k].atMs) <= 25)
        },
      })),
    ]

    const greenWithPeak = checks.filter((c) => c.run(true))
    const greenWithoutPeak = checks.filter((c) => c.run(false))
    const turnedRed = checks.length - greenWithoutPeak.length

    // 前置：开着峰值拾取时 7 条必须全绿，否则守卫本身没有参照系
    expect(
      greenWithPeak.map((c) => c.name),
      `开启峰值拾取时应 7/7 全绿，实际 ${greenWithPeak.length}/${checks.length}`,
    ).toHaveLength(checks.length)

    // 本体：摘掉后 7 条必须全红 —— 说明这一级（含抛物线亚 hop 插值）是真正承重的
    expect(
      turnedRed,
      `摘掉峰值拾取后转红 ${turnedRed}/${checks.length} 条；仍为绿的是 ${JSON.stringify(
        greenWithoutPeak.map((c) => c.name),
      )}`,
    ).toBe(checks.length)
  })

  it("阈值系数确实生效：ONSET_FLUX_FACTOR 是 3 附近的实测定标值，不是 1.5", () => {
    // 1.5 会让衰减段的局部极大轻松越线（实测 p90/p50 ≈ 5.28）。
    // 这条断言把常数钉死在文档解释过的区间里，防止有人"为了变绿"悄悄调回去。
    expect(ONSET_FLUX_FACTOR).toBeGreaterThanOrEqual(2.5)
    expect(ONSET_FLUX_FACTOR).toBeLessThanOrEqual(4)
  })
})
