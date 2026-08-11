/**
 * AI 教练 Schema — PracticeAdvice
 *
 * 定义 DeepSeek 返回的结构化练习建议。
 * 用 zod 做运行时校验，确保前端渲染时数据形状正确。
 * 后端 api/coach.ts 用 response_format: json_object 约束 LLM 输出 JSON，
 * 前端拿到完整 JSON 后用此 schema 校验。
 */

import { z } from "zod"

/** 练习维度评分（0-100） */
export const MetricsSchema = z.object({
  /** 音准准确率：演奏音高与曲谱期望的吻合度 */
  pitchAccuracy: z.number().min(0).max(100),
  /** 节奏稳定性：节拍/timing 的稳定程度 */
  rhythmStability: z.number().min(0).max(100),
  /** 和弦清晰度：和弦内音是否完整、无杂音 */
  chordClarity: z.number().min(0).max(100),
  /** 一致性：整段练习的稳定程度（无明显起伏） */
  consistency: z.number().min(0).max(100),
})

/** 单条改进建议 */
export const ImprovementSchema = z.object({
  /** 问题描述 */
  issue: z.string(),
  /** 涉及小节范围 [startId, endId] */
  measureRange: z.tuple([z.number(), z.number()]),
  /** 具体建议 */
  suggestion: z.string(),
  /** 针对性练习方法（drill） */
  drill: z.string(),
})

/**
 * 完整的练习建议（AI 教练输出）
 * 这是整个 AI Agent 的输出契约。
 */
export const PracticeAdviceSchema = z.object({
  /** 一句话总结本次练习 */
  summary: z.string(),
  /** 综合评分 0-100 */
  overallScore: z.number().min(0).max(100),
  /** 四维度评分 */
  metrics: MetricsSchema,
  /** 做得好的点（正面反馈） */
  highlights: z.array(z.string()),
  /** 需要改进的点（带具体建议和练习方法） */
  improvements: z.array(ImprovementSchema),
  /** 下一步建议（行动项） */
  nextSteps: z.array(z.string()),
  /** 建议练习 BPM */
  recommendedBpm: z.number().int().min(40).max(200),
  /** 建议循环练习的小节范围 [startId, endId] */
  recommendedLoopRange: z.tuple([z.number(), z.number()]),
})

export type Metrics = z.infer<typeof MetricsSchema>
export type Improvement = z.infer<typeof ImprovementSchema>
export type PracticeAdvice = z.infer<typeof PracticeAdviceSchema>

/**
 * 校验 LLM 输出。校验失败时返回 null + 错误信息。
 * 调用方应处理失败情况（降级展示原始文本或重试）。
 */
export function validateAdvice(raw: unknown): {
  advice: PracticeAdvice | null
  error: string | null
} {
  const result = PracticeAdviceSchema.safeParse(raw)
  if (result.success) {
    return { advice: result.data, error: null }
  }
  return {
    advice: null,
    error: result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; "),
  }
}
