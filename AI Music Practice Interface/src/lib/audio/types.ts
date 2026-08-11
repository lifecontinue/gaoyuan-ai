/**
 * 音频分析层的共享类型（DEVELOPMENT_PLAN §1.5 / §1.8）
 *
 * 本文件**只声明类型**，不含任何运行时逻辑，也不 import 任何有副作用的模块，
 * 因此可以被 audio 层任何文件安全引用而不会形成循环依赖。
 */

import type { NoteName } from "@/lib/music/types"

// ---------------------------------------------------------------------------
// 通用错误模型（§1.5）
// ---------------------------------------------------------------------------

/** 可预期失败的种类 */
export type AppErrorKind = "mic" | "network" | "config" | "parse" | "audio"

/** 可预期失败的载荷。`src/lib` 内的可预期失败一律返回它，不 throw。 */
export interface AppError {
  kind: AppErrorKind
  message: string
  cause?: unknown
}

/** 判别联合式返回值 */
export type Result<T> = { ok: true; value: T } | { ok: false; error: AppError }

/** 构造成功结果 */
export function ok<T>(value: T): Result<T> {
  return { ok: true, value }
}

/** 构造失败结果 */
export function err<T = never>(kind: AppErrorKind, message: string, cause?: unknown): Result<T> {
  return { ok: false, error: { kind, message, cause } }
}

// ---------------------------------------------------------------------------
// 时钟（§1.8 —— 让所有依赖时间的逻辑可在 node 里被驱动）
// ---------------------------------------------------------------------------

/**
 * 时钟接口。
 * 实现方：`AudioContext.currentTime`（生产）/ `VirtualClock`（测试）。
 */
export interface Clock {
  /** 当前时间（秒） */
  nowSec(): number
  /** 当前时间（毫秒） */
  nowMs(): number
}

// ---------------------------------------------------------------------------
// 音高检测结果
// ---------------------------------------------------------------------------

/** 单帧音高检测的原始输出（未经稳定化） */
export interface PitchResult {
  /** 检测到的频率（Hz） */
  frequency: number
  /** 清晰度 0-1（MPM 的 clarity） */
  clarity: number
  /** 音名 */
  noteName: NoteName
  /** 八度（MIDI 60 = C4） */
  octave: number
  /** 最近的 MIDI 编号（整数） */
  midi: number
  /** 音分偏差 -50~+50（相对最近半音），正数=偏高 */
  centsOff: number
  /** 时间戳（毫秒） */
  timestamp: number
}

/** 经 NoteStabilizer 连续帧确认后的音 */
export interface ConfirmedNote {
  /** 确认的 MIDI 编号（整数，已做八度纠错） */
  midi: number
  /** 音名 */
  noteName: NoteName
  /** 八度 */
  octave: number
  /** 最近一帧的实际频率（Hz） */
  frequency: number
  /** 最近一帧相对 `midi` 的音分偏差 */
  centsOff: number
  /** 最近一帧的 clarity */
  clarity: number
  /** 本音首次被确认的时间（毫秒） */
  onsetTimeMs: number
  /** 本帧是否是这个音的**首次确认**（true = 新音，false = 延音） */
  isNew: boolean
  /** 本音是否被八度纠错修正过（诊断用） */
  octaveCorrected: boolean
}

// ---------------------------------------------------------------------------
// 每帧分析结果
// ---------------------------------------------------------------------------

/**
 * 一帧的完整分析结果。
 *
 * 🚨 它是**高频数据**（~21ms 一个），只能经 `AudioBus` 发布，
 * 绝对不能每帧写 zustand（DEVELOPMENT_PLAN §1.4）。
 */
export interface AudioFrame {
  /** 帧时间（秒，与 AudioContext 同源；离线场景由 VirtualClock 提供） */
  timeSec: number
  /**
   * 声学时刻（毫秒）= `timeSec * 1000 - analysisLatencyMs(...)`。
   *
   * `timeSec` 是**读取**这帧的时刻，而这帧覆盖的是过去 FRAME_SIZE 个样本，
   * 其代表的真实发声时刻在窗口中心（≈ 42.7ms 之前）。
   * Phase 3 把演奏时刻与 ScoreFollower 的拍点相减时**必须**用这个值，
   * 否则会得到一个恒定的"全体滞后 43ms"偏置。
   */
  musicTimeMs: number
  /** 线性 rms（0-1） */
  rms: number
  /** rms 的 dBFS 表示（已在 MIN_DBFS 处截断） */
  levelDb: number
  /** 是否通过噪声门限 */
  aboveGate: boolean
  /** 本帧原始音高（未通过门限/clarity 时为 null） */
  pitch: PitchResult | null
  /** 本帧稳定化后的确认音（未确认时为 null） */
  confirmedNote: ConfirmedNote | null
  /** 12 维音级能量，归一化到 max = 1；静音帧为全 0 */
  chroma: Float32Array<ArrayBuffer>
  /** 本帧是否检测到 onset（Phase 3 实现，Phase 1 恒为 false） */
  onset: boolean
  /**
   * onset 的声学时刻（毫秒）。
   *
   * ⚠️ 它**不等于** `musicTimeMs`：onset 走的是"峰值拾取"流水线，判断 `flux[n-1]`
   * 是不是局部极大必须先看到 `flux[n]`，所以命中时的峰位于**上一帧**，
   * 比当前帧早一个 hop（`PEAK_PICK_LATENCY_MS` ≈ 21.33ms）。
   * 这里给出的是补偿后的峰值帧时刻 —— timing 判定必须用它，
   * 用 `musicTimeMs` 会引入一个恒定的"滞后 21ms"偏置（DoD #9 只有 25ms 预算）。
   *
   * `onset === false` 时回落为 `musicTimeMs`（无意义，调用方不应消费）。
   */
  onsetTimeMs: number
  /** 谱通量（Phase 3 实现，Phase 1 恒为 0） */
  spectralFlux: number
}

// ---------------------------------------------------------------------------
// 合成音源（§1.8 L2 —— 无麦克风时的注入通道，同时是产品的"演示模式"）
// ---------------------------------------------------------------------------

/** 接到 AnalyserNode 上、替代麦克风的合成音源规格 */
export type SyntheticSourceSpec =
  | { kind: "oscillator"; freqHz: number; gain?: number }
  | { kind: "buffer"; samples: Float32Array<ArrayBuffer>; loop?: boolean; gain?: number }

/** AudioEngine 对外暴露的生命周期状态 */
export type AudioEngineState = "idle" | "running" | "suspended" | "closed"

/** 音频输入来源 */
export type AudioSourceKind = "none" | "microphone" | "synthetic"
