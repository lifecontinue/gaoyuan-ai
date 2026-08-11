/**
 * 行迹 · 沉浸式天气档案
 * 将一段旅行记忆的（模拟）历史天气，映射成可用于环境渲染的视觉档案：
 * 天空渐变、辉光、粒子类型、WebGL 着色器模式、温度/湿度/风力等。
 */

import type { Trip } from '@/types/travel'
import { simulateWeather, expandToDayCards } from './dayCards'

/** 天气状况（决定配色、粒子、着色器分支） */
export type WeatherCondition =
  | 'sunny' | 'cloudy' | 'rainy' | 'storm' | 'snow' | 'fog' | 'petals' | 'autumn'

/** 粒子系统类型 */
export type ParticleType = 'none' | 'rain' | 'storm' | 'snow' | 'fog' | 'petal' | 'leaf' | 'mote'

export interface WeatherProfile {
  condition: WeatherCondition
  label: string
  icon: string
  /** 天空渐变：上 / 下 */
  topColor: string
  bottomColor: string
  /** 顶光辉光 */
  glowColor: string
  /** 强调色（UI 点缀） */
  accentColor: string
  particle: ParticleType
  /** WebGL 着色器分支编号 */
  shaderMode: number
  /** 云层 / 氛围强度 0~1 */
  intensity: number
  temperature: number
  humidity: number
  wind: number
  description: string
}

interface Palette {
  top: string
  bottom: string
  glow: string
  accent: string
  particle: ParticleType
  mode: number
  intensity: number
}

const PALETTES: Record<WeatherCondition, Palette> = {
  sunny:  { top: '#5fa8e6', bottom: '#cfeafc', glow: '#ffe6a8', accent: '#f4c95d', particle: 'mote', mode: 0, intensity: 0.22 },
  cloudy: { top: '#8b95a8', bottom: '#c9cfd9', glow: '#dfe6ef', accent: '#9aa6b8', particle: 'mote', mode: 1, intensity: 0.6 },
  rainy:  { top: '#3c4a5b', bottom: '#5e6e7c', glow: '#7c8d9c', accent: '#7fa8c9', particle: 'rain', mode: 2, intensity: 0.72 },
  storm:  { top: '#262f3b', bottom: '#3c4757', glow: '#54647a', accent: '#86b4d8', particle: 'storm', mode: 3, intensity: 0.85 },
  snow:   { top: '#9bb4cd', bottom: '#e9f1f8', glow: '#ffffff', accent: '#bcd4e6', particle: 'snow', mode: 4, intensity: 0.5 },
  fog:    { top: '#aeb7bf', bottom: '#dde2e6', glow: '#e8ecef', accent: '#c3ccd2', particle: 'fog', mode: 5, intensity: 0.62 },
  petals: { top: '#f3b9d2', bottom: '#fde9d6', glow: '#ffd9e6', accent: '#e87fa8', particle: 'petal', mode: 1, intensity: 0.4 },
  autumn: { top: '#e0a263', bottom: '#f6dcae', glow: '#ffd9a0', accent: '#d98b3f', particle: 'leaf', mode: 1, intensity: 0.45 },
}

const ICONS: Record<WeatherCondition, string> = {
  sunny: '☀️', cloudy: '☁️', rainy: '🌧️', storm: '⛈️',
  snow: '❄️', fog: '🌫️', petals: '🌸', autumn: '🍂',
}

const LABELS: Record<WeatherCondition, string> = {
  sunny: '晴朗', cloudy: '多云', rainy: '小雨', storm: '雷阵雨',
  snow: '降雪', fog: '薄雾', petals: '春和', autumn: '秋意',
}

const DESCRIPTIONS: Record<WeatherCondition, string> = {
  sunny:  '天气晴好，光线温柔地落在记忆里',
  cloudy: '云层缓缓流动，天色温润',
  rainy:  '细雨斜织，空气里都是湿润的回响',
  storm:  '远处雷声隐隐，风雨叩打着窗棂',
  snow:   '雪花无声飘落，世界安静下来',
  fog:    '薄雾漫开，视线与回忆一同朦胧',
  petals: '微风卷起花瓣，春天还在原地',
  autumn: '落叶铺成小径，秋意漫过脚踝',
}

/** 北半球月均最高气温（用于推算体感温度） */
const BASE_TEMP = [4, 6, 11, 17, 22, 26, 30, 29, 25, 19, 12, 6]

function inferCondition(text: string, icon: string): WeatherCondition {
  const t = (text + ' ' + icon)
  if (t.includes('雷')) return 'storm'
  if (t.includes('雨')) return 'rainy'
  if (t.includes('雾') || t.includes('薄雾')) return 'fog'
  if (t.includes('雪') || t.includes('寒') || t.includes('冷')) return 'snow'
  if (t.includes('🌸') || t.includes('微暖') || t.includes('温暖') || t.includes('春')) return 'petals'
  if (t.includes('🍂') || t.includes('秋') || t.includes('凉') || t.includes('初寒')) return 'autumn'
  if (t.includes('晴') || t.includes('炎热') || t.includes('暑') || t.includes('舒适') || t.includes('好')) return 'sunny'
  if (t.includes('云') || t.includes('阴') || t.includes('多云')) return 'cloudy'
  return 'cloudy'
}

function estimateTemp(month: number, lat?: number): number {
  // 南半球整体平移 6 个月
  let m = month
  if (lat !== undefined && lat < 0) m = (month + 6) % 12
  return BASE_TEMP[m] ?? 18
}

/**
 * 取得某段旅行的代表性天气文字
 * 多日行程取首日；单日行程按 startDate 模拟
 */
function representativeWeather(trip: Trip): { icon: string; text: string } {
  if (trip.startDate) {
    if (trip.endDate && trip.endDate !== trip.startDate) {
      const cards = expandToDayCards(trip)
      if (cards.length > 0) return { icon: cards[0].weatherIcon, text: cards[0].weatherText }
    }
    return simulateWeather(trip.startDate, trip.lat)
  }
  return { icon: '☀️', text: '晴朗' }
}

/**
 * 由一段旅行记忆生成沉浸式天气档案
 */
export function getWeatherProfile(trip: Trip): WeatherProfile {
  const w = representativeWeather(trip)
  const condition = inferCondition(w.text, w.icon)
  const p = PALETTES[condition]

  const month = trip.startDate ? parseInt(trip.startDate.slice(5, 7), 10) - 1 : 5
  const day = trip.startDate ? parseInt(trip.startDate.slice(8, 10), 10) : 15
  const baseTemp = estimateTemp(month, trip.lat)
  // 用日期个位数引入轻微波动，让每天略有不同
  const temp = Math.round(baseTemp + ((day % 7) - 3) * 0.8)

  const humidityByCondition: Record<WeatherCondition, number> = {
    sunny: 45, cloudy: 60, rainy: 88, storm: 92, snow: 80, fog: 95, petals: 55, autumn: 50,
  }
  const windByCondition: Record<WeatherCondition, number> = {
    sunny: 8, cloudy: 12, rainy: 18, storm: 34, snow: 14, fog: 6, petals: 16, autumn: 20,
  }

  return {
    condition,
    label: LABELS[condition],
    icon: ICONS[condition],
    topColor: p.top,
    bottomColor: p.bottom,
    glowColor: p.glow,
    accentColor: p.accent,
    particle: p.particle,
    shaderMode: p.mode,
    intensity: p.intensity,
    temperature: temp,
    humidity: humidityByCondition[condition],
    wind: windByCondition[condition],
    description: DESCRIPTIONS[condition],
  }
}
