/**
 * 多日行程展开 & 天气模拟
 * 当一站 startDate ≠ endDate 时，将行程拆分为多张每日卡片
 */

export interface DayCard {
  /** YYYY-MM-DD */
  date: string
  /** 显示格式：M月D日 */
  label: string
  /** 星期几 */
  weekday: string
  /** 天气图标 */
  weatherIcon: string
  /** 天气描述 */
  weatherText: string
  /** 当日故事摘要（从 story 中分配或生成） */
  storySnippet: string
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

/**
 * 根据月份和纬度模拟天气（装饰性，无需精确）
 * 真实场景可接入天气 API
 */
export function simulateWeather(dateStr: string, lat?: number): { icon: string; text: string } {
  const m = parseInt(dateStr.slice(5, 7), 10)
  // 北半球季节判断
  const isNorthern = lat === undefined || lat > 0

  // 基于月份的天气分布（简化版，偏中国/东亚气候）
  const weatherByMonth: Record<number, { icon: string; text: string }[]> = {
    1:  [{ icon: '❄️', text: '冷' }, { icon: '🌤️', text: '多云' }, { icon: '☁️', text: '阴' }],
    2:  [{ icon: '❄️', text: '冷' }, { icon: '🌧️', text: '小雨' }, { icon: '☁️', text: '阴' }],
    3:  [{ icon: '🌸', text: '微暖' }, { icon: '🌤️', text: '晴转多云' }, { icon: '🌧️', text: '春雨' }],
    4:  [{ icon: '🌤️', text: '晴朗' }, { icon: '🌸', text: '温暖' }, { icon: '☁️', text: '多云' }],
    5:  [{ icon: '☀️', text: '晴好' }, { icon: '🌤️', text: '舒适' }, { icon: '🌧️', text: '阵雨' }],
    6:  [{ icon: '🌧️', text: '梅雨' }, { icon: '⛈️', text: '雷阵雨' }, { icon: '☁️', text: '阴' }],
    7:  [{ icon: '☀️', text: '炎热' }, { icon: '🌤️', text: '晴间多云' }, { icon: '🌧️', text: '午后雷雨' }],
    8:  [{ icon: '☀️', text: '暑热' }, { icon: '🌤️', text: '多云' }, { icon: '🌧️', text: '阵雨' }],
    9:  [{ icon: '🍂', text: '秋凉' }, { icon: '🌤️', text: '秋高气爽' }, { icon: '☁️', text: '多云' }],
    10: [{ icon: '🍂', text: '凉爽' }, { icon: '🌤️', text: '晴好' }, { icon: '🌫️', text: '薄雾' }],
    11: [{ icon: '🍂', text: '初寒' }, { icon: '❄️', text: '微冷' }, { icon: '☁️', text: '阴' }],
    12: [{ icon: '❄️', text: '寒冷' }, { icon: '☁️', text: '阴天' }, { icon: '🌤️', text: '干冷' }],
  }

  const options = weatherByMonth[m] || weatherByMonth[5]!
  // 用日期的个位数做伪随机（同一个月每天不同）
  const day = parseInt(dateStr.slice(8, 10), 10)
  return options[day % options.length]
}

/**
 * 将日期字符串解析为 Date 对象
 */
function parseDate(s: string): Date {
  return new Date(s.replace(/-/g, '/') + 'T00:00:00')
}

/**
 * 格式化为 M月D日
 */
function fmtShort(d: Date): string {
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

/**
 * 格式化为 YYYY-MM-DD
 */
function fmtISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

/**
 * 展开一个 Trip 的日期范围为多张每日卡片
 * @param trip 行程记录
 * @param maxDays 最大展开天数（默认 30，防止异常数据）
 * @returns 每日卡片数组；若无法展开或单日则返回空数组
 */
export function expandToDayCards(trip: { startDate?: string; endDate?: string; story?: string; lat?: number }, maxDays = 30): DayCard[] {
  if (!trip.startDate) return []
  if (!trip.endDate || trip.startDate === trip.endDate) return []

  const start = parseDate(trip.startDate)
  const end = parseDate(trip.endDate)

  if (isNaN(start.getTime()) || isNaN(end.getTime())) return []
  if (start >= end) return [] // endDate 是离开日，应大于 startDate

  const diffMs = end.getTime() - start.getTime()
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays <= 0 || diffDays > maxDays) return []

  const cards: DayCard[] = []
  const fullStory = trip.story || ''

  for (let i = 0; i < diffDays; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    const dateStr = fmtISO(d)
    const w = simulateWeather(dateStr, trip.lat)

    // 将故事按天数均分（简单策略：首日取前半，中间均分，末日后半）
    let snippet = ''
    if (diffDays <= 3) {
      // ≤3 天：每段截取不同部分
      const len = fullStory.length
      const segLen = Math.ceil(len / diffDays)
      const startIdx = i * segLen
      snippet = fullStory.slice(startIdx, startIdx + segLen).trim()
    } else {
      // >3 天：首日+末日用首尾句，中间用省略
      if (i === 0) {
        snippet = fullStory.slice(0, Math.ceil(fullStory.length * 0.35))
      } else if (i === diffDays - 1) {
        snippet = fullStory.slice(Math.floor(fullStory.length * 0.6))
      } else {
        snippet = '继续探索中…'
      }
    }
    if (!snippet) snippet = '旅途中的美好一天'

    cards.push({
      date: dateStr,
      label: fmtShort(d),
      weekday: WEEKDAYS[d.getDay()],
      weatherIcon: w.icon,
      weatherText: w.text,
      storySnippet: snippet,
    })
  }

  return cards
}
