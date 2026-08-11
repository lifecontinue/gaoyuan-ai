/**
 * api/coach.ts — Vercel Edge Function 占位
 *
 * Phase 0: 返回 mock SSE 流，模拟 AI 教练输出。
 * Phase 3: 接入 DeepSeek chat/completions。
 */

export const config = {
  runtime: "edge",
}

type CoachRequestBody = {
  session?: unknown
  stream?: boolean
}

const MOCK_ADVICE = {
  summary: "整体演奏已经进入状态，但 Am7 到 Fmaj7 的转换仍略慢半拍。",
  overallScore: 78,
  metrics: {
    pitchAccuracy: 82,
    rhythmStability: 74,
    chordClarity: 80,
    consistency: 76,
  },
  highlights: [
    "主和弦音色整体比较干净，右手扫弦控制不错。",
    "进入第 19 小节后的节拍感更稳定，说明你在熟悉段落后有明显提升。",
  ],
  improvements: [
    {
      issue: "Am7 切到 Fmaj7 时左手预备不够早，导致下拍稍晚。",
      measureRange: [18, 20],
      suggestion: "在上一拍结束前提前放好食指，让转换动作分成两步而不是一步到位。",
      drill: "把 18-20 小节循环 20 秒，速度降到 75%，每次只关注转换是否在拍点前准备完成。",
    },
  ],
  nextSteps: [
    "先在 75% 速度下连续完成 5 次无杂音转换。",
    "再把 BPM 提高 4 点，保持节奏稳定不抢拍。",
  ],
  recommendedBpm: 88,
  recommendedLoopRange: [18, 20],
}

function sse(data: unknown) {
  return `data: ${JSON.stringify(data)}\n\n`
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "content-type": "application/json; charset=utf-8" },
    })
  }

  let body: CoachRequestBody = {}
  try {
    body = await req.json()
  } catch {
    body = {}
  }

  const stream = body.stream !== false

  if (!stream) {
    return new Response(JSON.stringify(MOCK_ADVICE), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
    })
  }

  const encoder = new TextEncoder()
  const jsonText = JSON.stringify(MOCK_ADVICE)

  const readable = new ReadableStream<Uint8Array>({
    start(controller) {
      let index = 0
      const chunkSize = 18

      const timer = setInterval(() => {
        if (index < jsonText.length) {
          const delta = jsonText.slice(index, index + chunkSize)
          controller.enqueue(encoder.encode(sse({ delta, done: false })))
          index += chunkSize
          return
        }

        clearInterval(timer)
        controller.enqueue(encoder.encode(sse({ done: true, advice: MOCK_ADVICE })))
        controller.close()
      }, 30)
    },
  })

  return new Response(readable, {
    status: 200,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  })
}
