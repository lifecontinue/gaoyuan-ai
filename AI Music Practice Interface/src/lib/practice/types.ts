/**
 * 练习分析层共享类型（DEVELOPMENT_PLAN §4 / §1.7）
 *
 * 本文件**只声明类型**，不含运行时逻辑，可被 lib 任意模块安全引用而不形成循环依赖。
 */

/** 单个 onset 的判定种类 */
export type JudgementKind = "perfect" | "good" | "early" | "late" | "miss"

/**
 * 对一个 onset 的 timing 判定结果。
 *
 * 符号约定（见 DEVELOPMENT_PLAN §1.2，全局唯一）：
 *   offsetMs = expectedMs - onsetTimeMs
 *     > 0 → 提前（early / 抢拍）
 *     < 0 → 滞后（late / 拖拍）
 */
export interface TimingJudgement {
  /** 判定种类 */
  kind: JudgementKind
  /** timing 偏差（ms），符合 §1.2 符号约定 */
  offsetMs: number
  /** 该 onset 所在小节编号 */
  measureId: number
  /** 玩家实际起音的声学时刻（ms） */
  onsetTimeMs: number
  /** 期望的拍点时刻（ms） */
  expectedMs: number
  /** 该拍在小节内的下标（0-based） */
  beatIndex: number
}

/** 单小节累积统计（最终态） */
export interface MeasureStats {
  /** 小节编号 */
  measureId: number
  /** 本小节被计数的 onset 数（perfect/good/early/late；miss 不计入） */
  onsetCount: number
  /** 本小节每个被计数 onset 的 timing 偏差（ms） */
  offsets: number[]
  /** 本小节和弦置信度均值（0-1；无活动时为 0） */
  chordConfidence: number
  /** 本小节音准（0-100） */
  pitchAccuracy: number
  /** 本小节节奏稳定性（0-100） */
  rhythmStability: number
  /** 本小节是否被判为 miss（期望有音但零有效 onset） */
  missed: boolean
  /** 本小节是否有过有效活动（rms 过门限） */
  hasActivity: boolean
}

/** 整段会话的原始累积统计（computeMetrics 的输入） */
export interface SessionAnalytics {
  /** 各小节的统计（按 measureId 升序） */
  measures: MeasureStats[]
  /** 所有被计数 onset 的 timing 偏差（ms），扁平合并 */
  timingOffsets: number[]
  /** 有有效活动的小节编号列表（升序） */
  practicedMeasures: number[]
}

/** 四维评分 + 总评（computeMetrics 的输出，本地确定性计算，不交给 LLM） */
export interface PracticeMetrics {
  /** 音准（0-100） */
  pitchAccuracy: number
  /** 节奏稳定性（0-100） */
  rhythmStability: number
  /** 和弦清晰度（0-100） */
  chordClarity: number
  /** 一致性（0-100） */
  consistency: number
  /** 总评（0-100，四舍五入） */
  overallScore: number
}
