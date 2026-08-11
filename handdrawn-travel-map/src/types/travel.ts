/**
 * 手绘旅行地图 — 核心类型定义
 */

/** 单个行程地点记录 */
export interface Trip {
  /** 唯一标识（slug） */
  id: string
  /** 原始地名（用于地理编码） */
  place: string
  /** 城市（AI 推断） */
  city?: string
  /** 国家/地区 */
  country?: string
  /** 开始日期 YYYY-MM-DD */
  startDate?: string
  /** 结束日期 YYYY-MM-DD */
  endDate?: string
  /** 列表摘要（≤20字） */
  summary: string
  /** 浮窗正文故事（≤80字） */
  story: string
  /** emoji 标记 */
  emoji?: string
  /** 图片搜索关键词 */
  imageQuery?: string
  /** AI 配图 URL（Loading 阶段生成） */
  imageUrl?: string
  /** 用户上传的本地图片（dataURL，最多 9 张） */
  images?: string[]
  /** 用户录制的语音记忆（dataURL，可多条） */
  audios?: AudioMemo[]
  /** 话题标签（用于浮窗展示） */
  tags?: string[]
  /** 来源标注 */
  source?: string

  // --- 交通方式 ---
  /** 到达此站的交通工具（从上一站出发时使用） */
  transport?: TransportMode

  // --- 以下由地理编码 / 渲染阶段填充 ---
  /** 纬度 */
  lat?: number
  /** 经度 */
  lng?: number
  /** 坐标来源 */
  geoSource?: 'nominatim' | 'open-meteo' | 'amap' | 'manual' | 'cache' | 'city-fallback'
}

/** 语音记忆片段 */
export interface AudioMemo {
  /** 音频 dataURL（audio/webm 或 audio/mp4） */
  url: string
  /** 时长（秒） */
  duration: number
  /** 录制时间 ISO 字符串 */
  createdAt?: string
}

/** 交通方式 */
export type TransportMode = 'plane' | 'train' | 'car' | 'bus' | 'ship' | 'walk' | 'auto'

/** 交通方式的显示信息 */
export const TRANSPORT_LABELS: Record<TransportMode, string> = {
  plane: '✈️ 飞机',
  train: '🚄 高铁',
  car: '🚗 自驾',
  bus: '🚌 巴士',
  ship: '🚢 轮船',
  walk: '🚶 步行',
  auto: '📍',
}

/** AI 解析结果 */
export interface ParseResult {
  /** 行程标题（AI 从文本推断） */
  title: string
  /** 地点列表 */
  trips: Trip[]
}

/** 解析状态 */
export type ParseStatus = 'idle' | 'parsing' | 'parsed' | 'error'

/** UI 阶段 */
export type AppStage = 'input' | 'loading' | 'map'

/** 播放状态 */
export interface PlaybackState {
  current: number
  playing: boolean
}
