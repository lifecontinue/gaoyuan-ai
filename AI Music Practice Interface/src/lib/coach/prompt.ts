/**
 * AI 教练 Prompt — system prompt + user context 模板
 *
 * Agent 人设：资深吉他教练，擅长指导中级玩家。
 * 输出必须是符合 PracticeAdviceSchema 的 JSON。
 */

import type { SessionSnapshot } from "@/lib/coach/agent"

/**
 * System prompt — 定义 AI 教练的角色、能力和输出格式。
 * 发送给 DeepSeek 的 system message。
 */
export const COACH_SYSTEM_PROMPT = `你是一位资深吉他教练，拥有 20 年教学经验，擅长指导中级玩家（已掌握基础和弦与扫弦，正在攻克复杂和弦转换、节奏细节和表现力）。

你的教学风格：
- 直接、具体、可执行。不说空话套话。
- 先肯定做得好的，再精准指出问题。
- 每个问题都给出对应的练习方法（drill），让学生知道"下一步练什么"。
- 理解吉他演奏的物理细节：品格、指法、闷音、扫弦角度、拨弦力度。
- 关注和弦转换的流畅度、节拍的稳定性、音色的清晰度。

你将收到一段练习会话的结构化数据（SessionSnapshot），包含：
- 曲谱信息（和弦进行、BPM、练习段落）
- 检测到的和弦与置信度
- timing 偏差（每小节的节奏提前/滞后）
- 练习 BPM、速度百分比、时长

请基于这些数据，输出一个 JSON 对象，严格符合以下结构：
{
  "summary": "一句话总结本次练习（中文，20-40字）",
  "overallScore": 0-100 的整数,
  "metrics": {
    "pitchAccuracy": 0-100,
    "rhythmStability": 0-100,
    "chordClarity": 0-100,
    "consistency": 0-100
  },
  "highlights": ["做得好的点1", "做得好的点2"],
  "improvements": [
    {
      "issue": "问题描述",
      "measureRange": [起始小节ID, 结束小节ID],
      "suggestion": "具体建议",
      "drill": "针对性练习方法"
    }
  ],
  "nextSteps": ["下一步行动1", "下一步行动2"],
  "recommendedBpm": 40-200 的整数,
  "recommendedLoopRange": [起始小节ID, 结束小节ID]
}

评分标准：
- 90-100：专业水准，细节到位
- 75-89：熟练，有小瑕疵
- 60-74：中级，有明显可改进点
- 40-59：初级，基础需加强
- 0-39：需从基础重新练习

注意：
- 只输出 JSON，不要输出任何其他文字、不要 markdown 代码块标记。
- 所有文字内容用中文。
- measureRange 和 recommendedLoopRange 的小节 ID 必须来自输入数据中的 practicedMeasures。
- improvements 至少 1 条，至多 4 条。
- highlights 至少 1 条。
- nextSteps 2-4 条。`

/**
 * 构建 user message — 把 SessionSnapshot 渲染成 LLM 易读的文本。
 */
export function buildUserMessage(session: SessionSnapshot): string {
  const { score, practicedMeasures, detectedChords, timingOffsets, bpm, speedPercent, durationSec } = session

  const chordSummary = detectedChords
    .map((d) => `  小节${d.measureId}: ${d.chord} (置信度${(d.confidence * 100).toFixed(0)}%)`)
    .join("\n")

  const timingSummary = timingOffsets
    .map((t) => `  小节${t.measureId}: ${t.offsetMs > 0 ? "提前" : "滞后"}${Math.abs(t.offsetMs).toFixed(0)}ms`)
    .join("\n")

  const allMeasures = score.sections.flatMap((s) => s.measures)
  const practicedChords = practicedMeasures
    .map((id) => allMeasures.find((m) => m.id === id)?.chord.name)
    .filter(Boolean)
    .join(" → ")

  return `【曲谱信息】
曲名：${score.title}
艺术家：${score.artist}
原曲 BPM：${score.bpm}
练习 BPM：${bpm}
速度：${speedPercent}%
练习时长：${(durationSec).toFixed(1)}秒
练习小节：${practicedMeasures.join(", ")}
和弦进行：${practicedChords}

【检测到的和弦】
${chordSummary || "  （未检测到）"}

【节奏偏差】
${timingSummary || "  （无数据）"}

请基于以上数据给出练习建议。`
}

/**
 * 构建 fallback advice — 当 AI 不可用或校验失败时的兜底。
 */
export function buildFallbackAdvice(session: SessionSnapshot): import("./schema").PracticeAdvice {
  const measures = session.practicedMeasures
  const firstMeasure = measures[0] ?? 0
  const lastMeasure = measures[measures.length - 1] ?? 0

  return {
    summary: "练习已完成，AI 分析暂时不可用，请继续练习。",
    overallScore: 0,
    metrics: {
      pitchAccuracy: 0,
      rhythmStability: 0,
      chordClarity: 0,
      consistency: 0,
    },
    highlights: ["完成了本次练习段落"],
    improvements: [
      {
        issue: "AI 分析服务暂不可用",
        measureRange: [firstMeasure, lastMeasure],
        suggestion: "请检查网络连接或稍后重试。",
        drill: "可以先用节拍器慢速练习，保持每个和弦转换干净。",
      },
    ],
    nextSteps: ["稍后重试 AI 分析", "继续慢速练习当前段落"],
    recommendedBpm: Math.round(session.bpm * 0.75),
    recommendedLoopRange: [firstMeasure, lastMeasure],
  }
}
