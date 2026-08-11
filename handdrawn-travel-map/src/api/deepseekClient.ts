/**
 * 客户端 DeepSeek 调用 —— 让浏览器直接调 DeepSeek API 解析地名
 * 纯静态部署（云托管 / GitHub Pages）下不再依赖后端 /api/parse-trip 中间件。
 *
 * 使用方式：
 *   import { parseWithDeepSeek } from './deepseekClient'
 *   const result = await parseWithDeepSeek(userText) // → ParseResult
 *
 * 注意：需要 VITE_DEEPSEEK_API_KEY 环境变量（构建时注入到 import.meta.env）
 */
import { buildSystemPrompt, buildUserPrompt } from '@/prompts/parseTrip'
import type { ParseResult, Trip } from '@/types/travel'

const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions'

// 构建时由 Vite 静态内联（VITE_ 前缀的 env var）
const DEEPSEEK_KEY = import.meta.env.VITE_DEEPSEEK_API_KEY || ''

function getKey(): string {
  return DEEPSEEK_KEY
}

/** 深度求索返回的原始 JSON */
interface RawTrip {
  place?: string
  city?: string
  country?: string
  startDate?: string
  endDate?: string
  summary?: string
  story?: string
  emoji?: string
  imageQuery?: string
  tags?: string[]
  transport?: string
  source?: string
}

/** 把 DeepSeek 返回的原始数据规整为 ParseResult */
function normalize(raw: any): ParseResult {
  const rawTrips: RawTrip[] = Array.isArray(raw?.trips) ? raw.trips : []
  const trips: Trip[] = rawTrips.map((t, i) => {
    const place = String(t?.place || '未知地点')
    return {
      id: slugify(`${place}-${t?.startDate || i}`),
      place,
      city: t?.city ? String(t.city) : undefined,
      country: t?.country ? String(t.country) : undefined,
      startDate: t?.startDate ? String(t.startDate) : undefined,
      endDate: t?.endDate ? String(t.endDate) : undefined,
      summary: String(t?.summary || place),
      story: String(t?.story || `在${place}留下了难忘的回忆`),
      emoji: t?.emoji ? String(t.emoji) : '📍',
      imageQuery: t?.imageQuery ? String(t.imageQuery) : place,
      tags: Array.isArray(t?.tags) ? t.tags.map(String) : [],
      transport: (['plane', 'train', 'car', 'bus', 'ship', 'walk', 'auto'].includes(String(t?.transport || ''))
        ? String(t.transport)
        : 'auto') as Trip['transport'],
      source: t?.source ? String(t.source) : undefined,
    }
  })
  return { title: String(raw?.title || '我的旅行地图'), trips }
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9一-龥]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 36)
}

/**
 * 浏览器端直调 DeepSeek 解析自然语言行程文本
 * 失败时抛错，调用方自行降级到 mockParser
 */
export async function parseWithDeepSeek(text: string): Promise<ParseResult> {
  const apiKey = getKey()
  if (!apiKey) throw new Error('DeepSeek API Key 未配置（缺少 VITE_DEEPSEEK_API_KEY）')

  const resp = await fetch(DEEPSEEK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: buildSystemPrompt(new Date().getFullYear()) },
        { role: 'user', content: buildUserPrompt(text) },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    }),
  })

  if (!resp.ok) {
    const detail = await resp.text().catch(() => '')
    throw new Error(`DeepSeek ${resp.status}: ${detail.slice(0, 200)}`)
  }

  const json = await resp.json()
  const content = json?.choices?.[0]?.message?.content
  if (!content) throw new Error('DeepSeek 返回为空')

  let parsed: any
  try {
    parsed = JSON.parse(content)
  } catch {
    throw new Error('DeepSeek 返回非 JSON：' + String(content).slice(0, 120))
  }

  if (parsed && parsed.title !== undefined && Array.isArray(parsed.trips)) {
    return normalize(parsed)
  }
  throw new Error('DeepSeek 解析结果结构异常')
}
