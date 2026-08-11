/**
 * 音频分析核心参数表 —— 唯一真源（DEVELOPMENT_PLAN §1.6）
 *
 * 禁止在其它模块散落魔法数字。任何调参都改这里。
 * 本文件必须保持"零依赖 + 纯常量"，node 环境可直接 import。
 */

// ---------------------------------------------------------------------------
// 采样与分帧
// ---------------------------------------------------------------------------

/**
 * 采样率兜底值。
 * 真实运行时一律使用 `AudioContext.sampleRate`（设备默认，通常 48000）；
 * 强制指定采样率会在部分设备触发重采样噪声，所以只在**测试与离线计算**中使用本常量。
 */
export const SAMPLE_RATE_FALLBACK = 48000

/**
 * 分析窗口大小（= `AnalyserNode.fftSize`）。
 * 4096 / 48000 = 85.3ms，低音 E2（82.41Hz，周期 12.1ms）可容纳 7 个周期，MPM/YIN 才稳。
 * 2048 对 E2 只有 3.5 个周期，八度误判率显著升高。
 */
export const FRAME_SIZE = 4096

/**
 * 相邻两次分析之间前进的样本数 ≈ 21.3ms（≈47 帧/秒）。
 * 足够跟踪 BPM 120 下的 16 分音符（125ms）。
 */
export const HOP_SIZE = 1024

/** HOP_SIZE 对应的毫秒数（按兜底采样率折算，仅用于 rAF 节流） */
export const HOP_MS = (HOP_SIZE / SAMPLE_RATE_FALLBACK) * 1000

/**
 * 分析固有延迟（ms）—— Phase 3 timing 判定的前置常量。
 *
 * `AnalyserNode` 交出的一帧覆盖过去 FRAME_SIZE 个样本，
 * 因此这帧代表的**声学时刻**是窗口中心，而不是读取时刻：
 *   4096 / 2 / 48000 × 1000 ≈ 42.67ms
 *
 * Phase 3 要把玩家的击弦时刻和 ScoreFollower 的拍点做减法得出 timingOffset，
 * 如果不减掉这 42.67ms，**每一次演奏都会被系统性判为"滞后 43ms"**。
 * 现在先把它固化成常量并在 `AudioFrame.musicTimeMs` 里应用，
 * 免得 Phase 3 再去追一个恒定偏置的"玄学 bug"。
 */
export const ANALYSIS_LATENCY_MS = (FRAME_SIZE / 2 / SAMPLE_RATE_FALLBACK) * 1000

/**
 * 按实际采样率与窗口长度折算分析延迟。
 * 设备采样率常见 44100 / 48000，差异约 3.6ms —— 对 timing 判定不可忽略。
 */
export function analysisLatencyMs(
  sampleRate: number = SAMPLE_RATE_FALLBACK,
  frameSize: number = FRAME_SIZE,
): number {
  if (!(sampleRate > 0) || !(frameSize > 0)) return ANALYSIS_LATENCY_MS
  return (frameSize / 2 / sampleRate) * 1000
}

/**
 * `AnalyserNode.smoothingTimeConstant`。
 * 只影响频域数据；chroma 与后续 onset 需要瞬时能量，平滑会糊掉 onset。
 */
export const ANALYSER_SMOOTHING = 0

// ---------------------------------------------------------------------------
// 音高检测
// ---------------------------------------------------------------------------

/** 有效基频下界（Hz）。E2 = 82.41Hz，留余量。 */
export const PITCH_MIN_HZ = 70

/** 有效基频上界（Hz）。吉他 22 品高音 e ≈ 1174Hz，留余量。 */
export const PITCH_MAX_HZ = 1320

/** MPM/YIN clarity 阈值。骨架里的 0.1 太松，静音时会乱报。 */
export const CLARITY_THRESHOLD = 0.9

// ---------------------------------------------------------------------------
// 噪声门限
// ---------------------------------------------------------------------------

/** 噪声门限（dBFS）。低于此值直接判静音，不做任何检测（省 CPU + 杜绝静音乱报）。 */
export const NOISE_GATE_DBFS = -50

/** 噪声门限对应的线性 rms：10^(-50/20) ≈ 0.0031623 */
export const NOISE_GATE_RMS = Math.pow(10, NOISE_GATE_DBFS / 20)

/** dBFS 下限（用于避免 log10(0) = -Infinity 污染 UI 与统计） */
export const MIN_DBFS = -100

// ---------------------------------------------------------------------------
// Onset（Phase 3）
// ---------------------------------------------------------------------------

/** 两次 onset 之间的最小间隔（ms），抑制单次扫弦被判成 6 个 onset。 */
export const ONSET_MIN_INTERVAL_MS = 100

/**
 * 峰值拾取（onset 流水线第 3 级）的前瞻延迟（ms）。
 *
 * ## 为什么会有这个延迟
 * 标准 onset 流水线是四级：ODF(spectral flux) → 自适应阈值 → **峰值拾取** → 最小间隔。
 * 第 3 级要求「flux 必须是邻域局部极大」，而判断 `flux[n-1]` 是不是极大值，
 * 必须先看到 `flux[n]`（`flux[n-1] > flux[n-2] && flux[n-1] >= flux[n]`）。
 * 于是结论天然比峰值本身**晚一个 hop**：
 *   HOP_SIZE / SAMPLE_RATE × 1000 = 1024 / 48000 × 1000 ≈ 21.33ms
 *
 * DoD #9 的时间误差预算只有 25ms，这 21.33ms 不补偿就直接爆表 —— 所以必须显式减掉。
 *
 * ## 为什么**不**并进 `ANALYSIS_LATENCY_MS`
 * 两者物理含义完全不同，量纲相同不代表可以合并：
 *   - `ANALYSIS_LATENCY_MS`（42.67ms）＝「一帧代表的声学时刻在窗口中心」，**每一帧**都要减，
 *     由 `AnalysisPipeline` 统一施加在 `musicTimeMs` 上，随 `frameSize` / `sampleRate` 变化；
 *   - `PEAK_PICK_LATENCY_MS`（21.33ms）＝「极大值的结论要晚一帧才能下」，**只有 onset 判定**要减，
 *     随 `hopSize` 变化，与 `frameSize` 无关。
 * 混成一个数以后，任何一侧调参（换 hop、换窗长）都会变成玄学，故拆成两个常量。
 *
 * ## 实现说明
 * `OnsetDetector` 并不做「当前帧时刻 − 本常量」这种减法，而是直接回放**峰值帧当时记下的
 * `musicTimeMs`** —— 在离线路径（严格按 hop 切帧）两者恒等；在 rAF 驱动的实时路径帧间距会抖，
 * 回放时间戳才是精确补偿。本常量是该补偿的**标称值与守卫基准**，
 * 见 `OnsetDetector.test.ts` 的「峰值拾取延迟补偿」用例（断言 `帧时刻 − onsetTimeMs === 本常量`）。
 */
export const PEAK_PICK_LATENCY_MS = (HOP_SIZE / SAMPLE_RATE_FALLBACK) * 1000

/**
 * 自适应 onset 阈值系数（相对最近 N 帧 flux 中位数）。
 *
 * 实测定标（BPM92 准点扫弦、真实吉他 tau=0.8、本机 `npx vitest run --no-file-parallelism`
 * + 一次性诊断）：flux 的 p90/p50 ≈ 5.28 —— 真实起音比背景中位数高 5 倍以上；旧值 1.5
 * 只取 median×1.5，衰减段的局部极大轻松越线，是虚假 onset 的第二根因。
 * 抬到 3：3×median 砍掉绝大部分背景局部极大，而真实起音（峰值 ≈ p90 ≈ 5×median，
 * 实测峰值 flux ≥ 0.386 远超 3×median≈0.22）仍稳定过线。配合峰值拾取级（每次起音只取
 * 1 个峰），tau=0.8 基线从 ~26 个 onset 收敛到 8 个。
 */
export const ONSET_FLUX_FACTOR = 3

/** onset flux 历史窗口帧数（43 帧 ≈ 0.9s）。 */
export const ONSET_FLUX_HISTORY = 43

/**
 * onset 阈值的**峰值包络下限比例** —— 修「静音坍缩」缺陷的关键常量。
 *
 * ## 缺陷现象
 * 曲子开头一定有前导静音（点开始到第一次扫弦之间），静音帧 flux 恒为 0。
 * 历史窗 43 帧里只要过半是静音，`median(fluxHistory)` 就等于 0，于是
 *   threshold = 0 × ONSET_FLUX_FACTOR + 1e-6 = 1e-6
 * —— **第 2 级等于被摘掉了**，任何微小的局部极大都能击发。
 * 剂量-反应实测（BPM92 × 8 次准点扫弦，tau=0.8，期望恰好 8 个 onset）：
 * ```
 *   前导静音 0ms → 8 个 ✓ ｜ 200ms → 10 个 ｜ 500ms → 11 个 ｜ 1000ms → 12 个
 * ```
 * 单调恶化，多出的假 onset 全部簇拥在开头，与"阈值失效"的指纹完全吻合。
 *
 * ## 为什么**不能**用一个固定绝对下限
 * 最直觉的修法是 `threshold = max(median×factor, 0.3)`。实测确实能把 9 个场景全压回 8 个，
 * 但它**不是增益无关的**：flux 与输入幅度成正比，玩家弹轻一点就整体缩小。
 * 把测试激励振幅压到 1/5 与 1/20 后，固定下限 0.30 的检出数直接变成 **0 个（全漏）**。
 * 噪声门限允许的信号远比测试激励安静，所以固定下限在生产上是必踩的坑，已否决。
 *
 * ## 采用的方案：相对「最近 flux 峰值包络」的比例下限
 * 维护一个按帧间距指数衰减的 flux 峰值包络 `fluxEnv`（半衰期见
 * `ONSET_FLUX_ENV_HALFLIFE_MS`），下限取 `fluxEnv × 本常量`。
 * 输入增益整体缩放时，`fluxEnv` 与 `flux` 同比例缩放，判据完全不变 —— **增益无关**。
 * 实测振幅 0.5 / 0.1 / 0.025 三档均稳定 8 个，最大时间误差 16.3ms。
 *
 * ## 取值 0.4 的依据
 * 参数扫描显示 0.3 / 0.4 / 0.5 三档在全部 9 个场景上**结果逐位相同**（都是 8 个、
 * 误差 ≤20.7ms），说明取值落在一个宽平台上而非悬崖边。取平台中点 0.4。
 * 判据锚点：拍间杂散局部极大最大 0.0973，而起音峰值 0.73 —— 相差 7.5 倍，
 * 0.4 的比例把门限放在两者之间且远离任一侧。
 *
 * 注意本下限与自适应中位数是 `max()` 关系：**只会抬高阈值、不会降低**，
 * 因此任何原本靠 `median×factor` 就能通过的用例都不会被它破坏。
 */
export const ONSET_FLUX_ENV_RATIO = 0.4

/**
 * flux 峰值包络的半衰期（ms）。
 *
 * 太短 → 一拍还没走完包络就掉下去，拍间杂散峰重新越线（假 onset 回来）；
 * 太长 → 一次重扫弦之后的弱起音被自己的历史峰压住（漏检）。
 * BPM 92 拍间 652ms，取 1500ms ≈ 2.3 拍，保证跨拍仍有压制力又不至于跨小节。
 * 扫描显示 1000 / 1500 / 2000ms 三档结果逐位相同，同样落在宽平台上，取中间值。
 */
export const ONSET_FLUX_ENV_HALFLIFE_MS = 1500

/**
 * ODF 后向差分的固有时间偏置（ms）＝ **半个 hop**。
 *
 * ## 推导（不是拟合出来的）
 * ODF 用的是后向差分 `flux[i] = ‖M(i)‖ − ‖M(i−1)‖`，它逼近的是幅度谱变化率
 * **在第 i−1 帧与第 i 帧中点处**的值，却被记账在第 i 帧的中心时刻上。
 * 于是每一个 flux 值天生比它代表的物理时刻晚 `hop/2`：
 *   1024 / 48000 / 2 × 1000 ≈ 10.67ms
 *
 * ## 实测吻合
 * 未补偿时 DoD #2 的 8 个误差为 [33.3, 21.2, 30.3, 18.1, 27.3, 15.1, 24.3, 33.4]，
 * **全为正**（系统性偏晚），跨度 18.3ms ≈ 0.86 个 hop（栅格量化），中心 +24ms。
 * 减掉半个 hop 后最大误差 33.4 → 22.8ms，再叠加峰值抛物线插值（亚 hop 定位）
 * 后进一步降到 16.2ms，全场景最大 20.7ms，25ms 预算留出约 20% 余量。
 *
 * ## 与另外两个延迟常量的关系（三者物理含义互不相同，禁止合并）
 *   - `ANALYSIS_LATENCY_MS`  42.67ms：一帧代表窗口中心，**每帧**都要减，随 frameSize 变
 *   - `PEAK_PICK_LATENCY_MS` 21.33ms：极大值结论晚一帧才能下，**仅 onset** 要减，随 hop 变
 *   - 本常量                 10.67ms：后向差分把变化率记晚了半帧，**仅 onset** 要减，随 hop 变
 *
 * 实现上 `OnsetDetector` 不直接用本常量做减法，而是用**实测帧间距**（相邻帧
 * `musicTimeMs` 之差）现算，这样 rAF 实时路径帧距抖动时也精确。本常量是标称值与守卫基准。
 */
export const ODF_BACKWARD_DIFF_MS = (HOP_SIZE / SAMPLE_RATE_FALLBACK) * 1000 / 2

// ---------------------------------------------------------------------------
// Timing 判定窗口（Phase 3，DEVELOPMENT_PLAN §1.2）
// ---------------------------------------------------------------------------

/**
 * 符号约定（**全局唯一真源**）：`offsetMs = expectedMs - actualMs`
 *   > 0 → 提前（抢拍 / EARLY ↗）
 *   < 0 → 滞后（拖拍 / LATE ↘）
 * 任何地方写反了，UI 上的箭头就会全反，且 rhythmStability 依旧"看起来正常" —— 极难查。
 */

/** |Δ| ≤ 40ms → PERFECT。人耳对同时性的分辨阈约 20-40ms。 */
export const TIMING_PERFECT_MS = 40

/** |Δ| ≤ 90ms → GOOD */
export const TIMING_GOOD_MS = 90

/**
 * |Δ| ≤ 160ms → EARLY / LATE（仍计入统计）。
 * 超出此窗口的 onset 视为噪声或与本拍无关的演奏，**不计入**任何统计
 * （否则一次咳嗽就能把 rhythmStability 砸穿）。
 */
export const TIMING_WINDOW_MS = 160

/** timingScore 的 0 分点（= TIMING_WINDOW_MS）。见 §1.7 ② 线性公式。 */
export const TIMING_ZERO_SCORE_MS = TIMING_WINDOW_MS

// ---------------------------------------------------------------------------
// 反馈气泡（Phase 3 UI）
// ---------------------------------------------------------------------------

/** 反馈气泡的显示时长（ms），到点自动消失。 */
export const FEEDBACK_BUBBLE_MS = 800

// ---------------------------------------------------------------------------
// NoteStabilizer（连续帧确认 + 八度纠错）
// ---------------------------------------------------------------------------

/** 连续 N 帧（≈64ms）落在同一个 midi 才确认，抑制瞬态误判。 */
export const STABILIZER_CONFIRM_FRAMES = 3

/** 判"同一个音"的容差（cents），半音的一半。 */
export const STABILIZER_TOLERANCE_CENTS = 60

/** 连续 N 帧无有效音高后释放当前确认音（避免残留） */
export const STABILIZER_RELEASE_FRAMES = 3

/**
 * 八度纠错的有效时间窗（ms）。
 * 只有在"上一个确认音仍然新鲜"时，才把整八度跳变视为倍频误判。
 * 超过这个时间的整八度差按真实的换音处理，避免压制玩家真的换八度。
 */
export const OCTAVE_CORRECTION_WINDOW_MS = 250

// ---------------------------------------------------------------------------
// Chroma（12 维音级能量）
// ---------------------------------------------------------------------------

/**
 * chroma 的 FFT 长度 —— **实时与离线统一口径**（Phase 3 拍板"方向 1"）。
 *
 * 为什么不是 FRAME_SIZE(4096)：
 * 4096 @ 48kHz 的频率分辨率是 11.72Hz，而低把位相邻和弦内音（如 A2=110Hz 与 C3=130.81Hz）
 * 只差 20.8Hz ≈ 1.8 个 bin，小于 Hann 窗主瓣宽度（4 bin），两个峰会**合并**，
 * 导致和弦的音级归属失效。16384 @ 48kHz = 2.93Hz/bin，上述两音相距 7.1 bin，可分辨。
 *
 * 曾经的假设是"实时路径复用 AnalyserNode(4096) 即可，因为真实拨弦含丰富谐波、
 * 高次谐波落在高频区可分辨"。Phase 3 的守卫用例**证伪了它**：
 * 用 `generatePluckedTone`（基频 + 4 次谐波 + 衰减包络）合成 Am7，
 * 4096 口径下 top-4 漂成 {E,G,B,C} —— A 的奇次谐波给 E/C 投票、E 的谐波给 B 投票，
 * 叠加低频基频合并，音级归属整体失真。
 * 因此实时路径也改走 16384 的 chroma 环形缓冲；`FRAME_SIZE` 只服务 pitch/YIN 与 onset。
 *
 * 代价：chroma 的时间分辨率变成 341ms（16384/48000）。对"当前小节弹的是什么和弦"
 * 这种量级的判断完全够用，且换来测试口径 == 生产口径。
 * 守卫用例见 `dsp/chroma.test.ts` 的最后两个 describe（正向 16384 + 边界 4096）。
 */
export const CHROMA_FFT_SIZE = 16384

/** chroma 统计的频率下界（Hz），略低于 E2。 */
export const CHROMA_MIN_HZ = 65

/** chroma 统计的频率上界（Hz）。 */
export const CHROMA_MAX_HZ = 2200

/**
 * 峰值动态范围门限（dB，相对当前帧最大峰）。
 * 低于 max - 50dB 的谱峰视为噪声底，不计入 chroma。
 */
export const CHROMA_PEAK_FLOOR_DB = -50

/** chroma 判"命中期望内音"的能量阈值（DEVELOPMENT_PLAN §1.7 ③） */
export const CHROMA_MATCH_THRESHOLD = 0.35

/** chroma 判"多余噪音音级"的能量阈值（DEVELOPMENT_PLAN §1.7 ③） */
export const CHROMA_EXTRA_THRESHOLD = 0.5

// ---------------------------------------------------------------------------
// UI 渲染节流与量程
// ---------------------------------------------------------------------------

/** UI 每帧数据的最小刷新间隔（ms）。50ms = 20Hz，DEVELOPMENT_PLAN §1.4 的硬上限。 */
export const UI_UPDATE_INTERVAL_MS = 50

/** audioStore.inputLevelDb 的写入间隔（ms）。store 是低频通道，绝不能每帧写。 */
export const STORE_LEVEL_INTERVAL_MS = 250

/** 电平条量程下界（dBFS） */
export const INPUT_LEVEL_MIN_DBFS = -60

/** 电平条量程上界（dBFS） */
export const INPUT_LEVEL_MAX_DBFS = 0

/** 音分指针量程（±cents） */
export const CENTS_METER_RANGE = 50

/** 音高读数保鲜时间（ms）。超过此时长没有新的确认音，HUD 回到待机态。 */
export const PITCH_STALE_MS = 400
