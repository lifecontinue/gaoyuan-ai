/**
 * 行程解析器 —— 三层降级链：
 *  1. 后端 /api/parse-trip（vite dev 中间件，DeepSeek 驱动）
 *  2. 客户端直调 DeepSeek（浏览器端，纯静态部署也能用 AI 解析）
 *  3. 本地 mockParser（正则兜底，保证链路永不断）
 */
import type { ParseResult, Trip } from '@/types/travel'

/** 把后端返回的数据规整为符合 Trip 类型的对象 */
function normalize(data: any): ParseResult {
  const rawTrips = Array.isArray(data?.trips) ? data.trips : []
  const trips: Trip[] = rawTrips.map((t: any, i: number) => {
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
      tags: Array.isArray(t?.tags) ? t.tags.map((x: any) => String(x)) : [],
      source: t?.source ? String(t.source) : undefined,
    }
  })
  return {
    title: String(data?.title || '我的旅行地图'),
    trips,
  }
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9一-龥]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 36)
}

/**
 * 解析用户输入的自然语言行程
 * 链路：后端 → 客户端直调 DeepSeek → mockParser
 */
export async function parseTrip(text: string): Promise<ParseResult> {
  // 1) 后端（vite dev）
  try {
    const resp = await fetch('/api/parse-trip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}))
      throw new Error(err?.error || `解析服务返回 ${resp.status}`)
    }
    const data = await resp.json()
    if (data && data.title !== undefined && Array.isArray(data.trips)) {
      return normalize(data)
    }
    throw new Error('解析结果结构异常')
  } catch (e) {
    console.warn('[parseTrip] 后端不可用，尝试客户端直调 DeepSeek：', e)
  }

  // 2) 客户端直调 DeepSeek（纯静态部署也能用 AI 解析）
  try {
    const { parseWithDeepSeek } = await import('./deepseekClient')
    const result = await parseWithDeepSeek(text)
    if (result.trips.length > 0) return result
    throw new Error('DeepSeek 未提取到任何地点')
  } catch (e) {
    console.warn('[parseTrip] 客户端 DeepSeek 失败，降级到 mockParser：', e)
  }

  // 3) 本地正则兜底
  const { mockParser } = await import('./mockParser')
  return mockParser(text)
}
