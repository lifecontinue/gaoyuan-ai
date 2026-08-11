/**
 * OnsetDetector — 四级 onset 流水线（DEVELOPMENT_PLAN §4 ②）
 *
 * ## 四级结构（顺序不可调换）
 *   ① ODF（onset detection function）
 *        mag[i] = 10^(freqDb[i]/20)
 *        flux   = Σ max(0, mag[i] - prevMag[i])        // 只累加正增量
 *   ② 自适应阈值（中位数 ∪ 峰值包络下限）
 *        threshold = max(median(最近 ONSET_FLUX_HISTORY 帧) × ONSET_FLUX_FACTOR + 1e-6,
 *                        fluxEnv × ONSET_FLUX_ENV_RATIO)
 *   ③ **峰值拾取（局部极大）+ 抛物线插值**
 *        flux[n-1] > flux[n-2] && flux[n-1] >= flux[n]，再对三点拟合抛物线取顶点
 *   ④ 最小间隔
 *        peakTimeMs - lastOnsetMs > ONSET_MIN_INTERVAL_MS
 *
 * ## 第 3 级为什么不可省（实测，team-lead 本机诊断）
 * 一次起音要 4 个 hop 才完全进入 4096 的分析窗，这期间 flux **持续为正且单调爬升**，
 * 每次起音因此贡献 3~4 个"高 flux 帧"。若只有 ①②④，这些爬升帧会**逐帧全部击发**，
 * 唯一限流的是 100ms 锁定期 —— 实测指纹就是"onset 间隔满屏 107ms"
 * （= ONSET_MIN_INTERVAL_MS(100) + 一个 hop(21.33ms) 的量化）。
 * BPM 92 的 8 次准点扫弦因此被刷成 ~26 个 onset。
 * 补上局部极大判据后，一次起音的整条爬升只留**峰顶那一帧**，8 次扫弦收敛到 8 个。
 *
 * ## 第 2 级的峰值包络下限为什么不可省
 * 中位数是相对量，遇到**前导静音**会自己塌掉：43 帧历史里过半为 0 时 median=0，
 * 阈值退化成 1e-6，第 2 级形同虚设，开头会冒出一簇假 onset
 * （实测：静音 0/200/500/1000ms → 8/10/11/12 个）。
 * 兜底不能用固定常数 —— flux 与输入增益成正比，实测把振幅压到 1/5 就全漏了。
 * 这里维护一个按帧间距指数衰减的 flux 峰值包络，下限取它的固定**比例**，
 * 于是增益整体缩放时判据不变。定标与反例推导见 constants.ts。
 *
 * ## 时间戳的两处补偿（都不是拟合值）
 *   1. **抛物线插值**：峰只能落在 hop 栅格上，量化误差就有 ±½ hop。对 (n-2,n-1,n)
 *      三点的 flux 拟合抛物线取顶点，拿到亚 hop 精度。
 *   2. **后向差分半帧**：`flux[i]=‖M(i)‖−‖M(i−1)‖` 代表的是两帧中点的变化率，
 *      却记在第 i 帧中心上，天生晚半个 hop，必须减掉（见 `ODF_BACKWARD_DIFF_MS`）。
 * 两者叠加把 DoD #2 的最大误差从 33.4ms 压到 16.2ms（全场景 20.7ms，预算 25ms）。
 * 两处都用**实测帧间距**现算而非硬编码常量，实时路径帧距抖动时同样成立。
 *
 * ## 峰值拾取带来的一个 hop 延迟必须补掉
 * 判断 `flux[n-1]` 是极大值必须先看到 `flux[n]`，所以结论天生晚一个 hop（≈21.33ms）。
 * DoD #9 只有 25ms 误差预算，不补就直接爆。补偿方式：把峰值帧的 `musicTimeMs`
 * 原样记下来回放（等价于减 `PEAK_PICK_LATENCY_MS`，但在帧间距会抖的实时路径下更精确）。
 * **该补偿与 `ANALYSIS_LATENCY_MS` 是两回事**，两个常量独立，见 constants.ts 的注释。
 *
 * 本类无 Web Audio 依赖，node 可驱（离线回放与单测共用）。
 */

import {
  ONSET_FLUX_ENV_HALFLIFE_MS,
  ONSET_FLUX_ENV_RATIO,
  ONSET_FLUX_FACTOR,
  ONSET_FLUX_HISTORY,
  ONSET_MIN_INTERVAL_MS,
} from "@/lib/audio/constants"
import { dbToMagnitude, median, spectralFlux } from "@/lib/audio/dsp/spectralFlux"

/** 峰值拾取需要的邻域宽度：n-2 / n-1 / n 三帧 */
const PEAK_NEIGHBOURHOOD = 3

/** 单帧 onset 判定结果 */
export interface OnsetResult {
  /** 本帧是否检测到 onset（注意：命中的峰位于**上一帧**，见 `onsetTimeMs`） */
  isOnset: boolean
  /**
   * onset 的声学时刻（ms）。
   *
   * - `isOnset === true`：峰值帧的 `musicTimeMs`，即比当前帧早一个 hop
   *   （≈ `PEAK_PICK_LATENCY_MS` = 21.33ms）—— 峰值拾取的前瞻延迟已在此补掉；
   * - `isOnset === false`：回落为当前帧的 `musicTimeMs`（调用方不应消费）。
   */
  onsetTimeMs: number
  /** 本帧频谱通量（**当前帧**的，不是峰值帧的；供 UI / spectralFlux 曲线消费） */
  flux: number
  /** 当前自适应阈值 */
  threshold: number
}

/** 构造参数 */
export interface OnsetDetectorOptions {
  /**
   * ★ 变异守卫开关：置 `false` 摘掉第 3 级峰值拾取，退化成"越过阈值的每一帧都击发"。
   *
   * **只允许测试使用**，用来证明峰值拾取这一级真的在承重
   * （见 `OnsetDetector.test.ts` 的「★变异守卫：摘掉峰值拾取级」）。
   * 生产路径永远不传这个参数。
   */
  peakPicking?: boolean
}

/** 峰值拾取需要的逐帧最小记录 */
interface FrameRecord {
  flux: number
  timeMs: number
  aboveGate: boolean
}

/**
 * 四级 onset 检测器。
 *
 * @param spectrumLength 频域 dB 数组的长度（= fftSize/2）。长度变化（如切设备）时自动重置历史。
 * @param options        可选行为开关（仅变异守卫用）
 */
export class OnsetDetector {
  private expectedLen: number
  private prevMag: Float32Array<ArrayBuffer> | null = null
  private fluxHistory: number[] = []
  private lastOnsetMs = -Infinity
  private readonly peakPicking: boolean
  /** 最近 3 帧（n-2 / n-1 / n）的滚动记录 —— 峰值拾取只需要这么宽的邻域 */
  private recent: FrameRecord[] = []
  /** flux 峰值包络（按帧间距指数衰减），第 2 级比例下限的基准 */
  private fluxEnv = 0
  /** 上一帧的 musicTimeMs，用于现算帧间距（实时路径帧距会抖，不能用常量） */
  private prevTimeMs: number | null = null

  constructor(spectrumLength: number, options: OnsetDetectorOptions = {}) {
    this.expectedLen = spectrumLength
    this.peakPicking = options.peakPicking ?? true
  }

  /** 是否启用了峰值拾取级（诊断 / 守卫用例读它，避免测试去猜内部状态） */
  get peakPickingEnabled(): boolean {
    return this.peakPicking
  }

  /**
   * 喂入一帧 dB 幅度谱，返回该帧的 onset 判定。
   *
   * @param spectrumDb  频域 dB 数据（长度 = fftSize/2）
   * @param aboveGate   本帧是否通过噪声门限（rms > gate）
   * @param musicTimeMs 本帧声学时刻（ms，已减分析延迟）
   */
  push(
    spectrumDb: Float32Array<ArrayBuffer>,
    aboveGate: boolean,
    musicTimeMs: number,
  ): OnsetResult {
    // 长度不一致（切换输入设备 / FFT 尺寸）时，历史失效，从上清空重建
    if (spectrumDb.length !== this.expectedLen) {
      this.prevMag = null
      this.expectedLen = spectrumDb.length
      // 邻域记录跨口径没有可比性，一并丢弃，避免拿旧口径的 flux 去比新口径的峰
      this.recent = []
    }

    // ---- ① ODF ----
    const mag = dbToMagnitude(spectrumDb)
    const flux = this.prevMag ? spectralFlux(this.prevMag, mag) : 0
    this.prevMag = mag

    // 帧间距现算（rAF 实时路径帧距会抖，硬编码 hop 会引入误差）
    const frameGapMs =
      this.prevTimeMs === null ? 0 : Math.max(0, musicTimeMs - this.prevTimeMs)
    this.prevTimeMs = musicTimeMs

    // ---- ② 自适应阈值（中位数 ∪ 峰值包络比例下限）----
    // 包络下限只在"中位数被静音压塌"时接管；两者取 max，只会抬高阈值，
    // 因此原本靠 median×factor 就能通过的用例不会被它破坏。
    this.fluxHistory.push(flux)
    if (this.fluxHistory.length > ONSET_FLUX_HISTORY) this.fluxHistory.shift()
    const adaptive = median(this.fluxHistory) * ONSET_FLUX_FACTOR + 1e-6

    if (frameGapMs > 0 && ONSET_FLUX_ENV_HALFLIFE_MS > 0) {
      this.fluxEnv *= Math.pow(0.5, frameGapMs / ONSET_FLUX_ENV_HALFLIFE_MS)
    }
    if (flux > this.fluxEnv) this.fluxEnv = flux
    // 常规阈值 = max(自适应中位数, 峰值包络比例下限)。
    // 但自会话 / reset 以来的「第一个」 onset 放宽为"任意正 flux 即触发"：首音之前没有
    // 静音可作对照（DoD #9 的 t=0 首扫弦——音频从 t=0 开始、无前导静音，其 flux 尖峰本就
    // 弱于被自身攻击段撑高的中位数），用常规阈值（ONSET_FLUX_FACTOR=3）会把它漏掉。
    // 放宽只针对"第一个" onset，一旦有过 onset，后续全部回到常规阈值，
    // 因此不会重新引入"一次扫弦刷一串"的问题。
    // 注：纯稳态噪声若恰好从首帧开始，可能借此产生至多 1 个伪 onset（见 OnsetDetector.test
    // 中对应用例的注释）——这是有界的、仅在会话最开头出现，真实会话以静音起手不会触发。
    const firstEver = this.lastOnsetMs === -Infinity
    const threshold = firstEver ? 1e-6 : Math.max(adaptive, this.fluxEnv * ONSET_FLUX_ENV_RATIO)

    this.recent.push({ flux, timeMs: musicTimeMs, aboveGate })
    if (this.recent.length > PEAK_NEIGHBOURHOOD) this.recent.shift()

    // ---- ③ 峰值拾取（+ 抛物线亚 hop 插值）----
    // 开启时候选帧是 n-1（需要 n 才能确认它是极大值）；摘掉时退化为当前帧（变异守卫）。
    const candidate = this.peakPicking
      ? this.pickPeak()
      : { flux, timeMs: musicTimeMs, aboveGate, refinedMs: musicTimeMs }

    // ---- ④ 最小间隔 + 噪声门限 ----
    let isOnset = false
    let onsetTimeMs = musicTimeMs
    if (candidate !== null) {
      // 后向差分把变化率记晚了半帧，统一在这里减掉（见 ODF_BACKWARD_DIFF_MS）
      const correctedMs = candidate.refinedMs - frameGapMs / 2
      const minIntervalOk = correctedMs - this.lastOnsetMs > ONSET_MIN_INTERVAL_MS
      isOnset = candidate.aboveGate && candidate.flux > threshold && minIntervalOk
      if (isOnset) {
        this.lastOnsetMs = correctedMs
        onsetTimeMs = correctedMs
      }
    }

    return { isOnset, onsetTimeMs, flux, threshold }
  }

  /** 重置内部状态（新会话 / 切歌时调用） */
  reset(): void {
    this.prevMag = null
    this.fluxHistory = []
    this.recent = []
    this.lastOnsetMs = -Infinity
    this.fluxEnv = 0
    this.prevTimeMs = null
  }

  /**
   * 第 3 级：取 n-1 帧，当且仅当它是邻域局部极大，并对峰位做抛物线插值。
   *
   * 判据 `flux[n-1] > flux[n-2] && flux[n-1] >= flux[n]`：
   *   - 左边用严格 `>`：排除"平台段"（含全 0 静音段）被反复认成峰；
   *   - 右边用 `>=`：允许峰顶与下一帧持平（量化后常见），否则会整段漏检。
   *
   * 抛物线插值：三点 (a,b,c) 拟合二次曲线，顶点相对中点的帧偏移
   *   δ = ½(a−c) / (a − 2b + c)，仅在 `a − 2b + c < 0`（真凹）时有效，夹在 ±½ 帧内。
   * 峰只能落在 hop 栅格上，不插值就自带 ±½ hop 的量化误差 —— 实测该项贡献
   * DoD #2 误差跨度的 18.3ms（≈0.86 hop），插值后最大误差 22.8 → 16.2ms。
   *
   * @returns 峰值帧记录（`refinedMs` 为插值后的亚 hop 时刻）；不是极大值时返回 null。
   */
  private pickPeak(): (FrameRecord & { refinedMs: number }) | null {
    if (this.recent.length < PEAK_NEIGHBOURHOOD) return null
    const [prev, mid, cur] = this.recent
    if (!(mid.flux > prev.flux && mid.flux >= cur.flux)) return null

    const denom = prev.flux - 2 * mid.flux + cur.flux
    let delta = 0
    if (denom < 0) {
      delta = Math.max(-0.5, Math.min(0.5, (0.5 * (prev.flux - cur.flux)) / denom))
    }
    // 帧间距用邻域实测值（(t[n] − t[n−2]) / 2），不依赖 HOP_SIZE 常量
    const gapMs = (cur.timeMs - prev.timeMs) / 2
    return { ...mid, refinedMs: mid.timeMs + delta * gapMs }
  }
}
