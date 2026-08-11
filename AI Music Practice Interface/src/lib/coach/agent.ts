/**
 * AI 教练 Agent — 会话快照 + 调用接口
 *
 * 前端采集练习数据 → 组装 SessionSnapshot →
 * POST /api/coach → 流式接收 → zod 校验 → 返回 PracticeAdvice。
 *
 * 后端 api/coach.ts 是 Vercel Edge Function，保管 DeepSeek API key。
 */

import type { Score } from "@/lib/music/types"
import type { PracticeAdvice } from "@/lib/coach/schema"
import { validateAdvice } from "@/lib/coach/schema"
import { COACH_SYSTEM_PROMPT, buildUserMessage, buildFallbackAdvice } from "@/lib/coach/prompt"

/** 单次检测到的和弦记录 */
export interface DetectedChord {
  measureId: number
  chord: string
  confidence: number
  timestamp: number
}

/** 单次 timing 偏差记录 */
export interface TimingOffset {
  measureId: number
  offsetMs: number
}

/**
 * 练习会话快照 — 发送给 AI 教练的完整上下文。
 * 这是从音频采集 + 曲谱跟随过程中聚合的结构化数据。
 */
export interface SessionSnapshot {
  /** 曲谱 */
  score: Score
  /** 本次练习的小节 ID 列表 */
  practicedMeasures: number[]
  /** 检测到的和弦序列 */
  detectedChords: DetectedChord[]
  /** 每小节的 timing 偏差 */
  timingOffsets: TimingOffset[]
  /** 练习 BPM */
  bpm: number
  /** 速度百分比（50/75/100） */
  speedPercent: number
  /** 练习时长（秒） */
  durationSec: number
}

/** 流式输出的单条消息 */
export interface CoachStreamChunk {
  /** 增量文本（用于打字机效果） */
  delta: string
  /** 是否结束 */
  done: boolean
  /** 结束时附带的结构化建议（校验通过才有） */
  advice?: PracticeAdvice
}

/**
 * 调用 AI 教练分析。
 *
 * @param session 练习会话快照
 * @param signal 可选的 AbortSignal，用于取消
 * @returns 异步迭代器，逐块输出
 *
 * @example
 * for await (const chunk of analyzeCoachSession(snapshot)) {
 *   if (chunk.delta) setAdviceText(prev => prev + chunk.delta)
 *   if (chunk.done && chunk.advice) setAdvice(chunk.advice)
 * }
 */
export async function* analyzeCoachSession(
  session: SessionSnapshot,
  signal?: AbortSignal,
): AsyncIterable<CoachStreamChunk> {
  const body = {
    session,
    systemPrompt: COACH_SYSTEM_PROMPT,
    userMessage: buildUserMessage(session),
  }

  let response: Response
  try {
    response = await fetch("/api/coach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    })
  } catch (err) {
    // 网络错误 → 返回 fallback
    yield { delta: "连接失败，使用本地分析…", done: false }
    const fallback = buildFallbackAdvice(session)
    yield { delta: fallback.summary, done: true, advice: fallback }
    return
  }

  if (!response.ok) {
    // HTTP 错误 → 返回 fallback
    const fallback = buildFallbackAdvice(session)
    yield { delta: `服务异常 (${response.status})，使用本地分析…`, done: false }
    yield { delta: fallback.summary, done: true, advice: fallback }
    return
  }

  // 读取 SSE 流
  const reader = response.body?.getReader()
  if (!reader) {
    const fallback = buildFallbackAdvice(session)
    yield { delta: fallback.summary, done: true, advice: fallback }
    return
  }

  const decoder = new TextDecoder()
  let fullText = ""
  let buffer = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith("data: ")) continue
      const data = trimmed.slice(6)
      if (data === "[DONE]") continue

      try {
        const parsed = JSON.parse(data) as { delta?: string; done?: boolean }
        if (parsed.delta) {
          fullText += parsed.delta
          yield { delta: parsed.delta, done: false }
        }
      } catch {
        // 忽略无法解析的行
      }
    }
  }

  // 流结束，尝试解析完整 JSON
  const { advice, error } = validateAdvice(fullText)
  if (advice) {
    yield { delta: "", done: true, advice }
  } else {
    // 校验失败 → fallback
    console.warn("[coach] schema validation failed:", error, "raw:", fullText.slice(0, 200))
    const fallback = buildFallbackAdvice(session)
    yield { delta: "", done: true, advice: fallback }
  }
}
