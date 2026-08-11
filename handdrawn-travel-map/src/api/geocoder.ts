/**
 * 地理编码客户端 —— 后端 /api/geocode → Nominatim(上下文感知) → Open-Meteo → 城市兜底 → 本地坐标表
 * 全部为免 key / CORS 开放的方案，保证纯静态部署也能把地点落到真实坐标。
 *
 * 关键改进（修复「苏堤」被定位到山东/河北之类的问题）：
 *  - geocodePlace 接收 GeoContext { city, country }，把子景点（苏堤）和所属城市（杭州）一起
 *    发给地理服务做消歧，而不是孤立地查一个模糊地名。
 *  - 子景点在外部服务查不到、但已知所属城市时，回退到「城市坐标 + 微抖动」，绝不会落到外地同名地点。
 * 带内存 + localStorage 两级缓存，刷新后无需重复请求外部服务。
 */
import { getMockCoordinates } from '@/utils/coord'
import type { Trip } from '@/types/travel'

export interface GeocodeResult {
  lat: number
  lng: number
  source: 'nominatim' | 'open-meteo' | 'cache' | 'city-fallback' | 'manual'
}

/** 地理编码上下文：子景点所属的市/国家，用于消歧 */
export interface GeoContext {
  city?: string
  country?: string
}

// ---------------------------------------------------------------------------
// 国家名 → ISO 国家代码（用于 Nominatim countrycodes 偏置）
// ---------------------------------------------------------------------------
const COUNTRY_CODES: Record<string, string> = {
  中国: 'cn',
  中国香港: 'hk',
  中国澳门: 'mo',
  中国台湾: 'tw',
  日本: 'jp',
  韩国: 'kr',
  美国: 'us',
  英国: 'gb',
  法国: 'fr',
  德国: 'de',
  泰国: 'th',
  新加坡: 'sg',
  意大利: 'it',
  西班牙: 'es',
  澳大利亚: 'au',
  加拿大: 'ca',
  新西兰: 'nz',
  越南: 'vn',
  马来西亚: 'my',
  印度尼西亚: 'id',
  菲律宾: 'ph',
  印度: 'in',
  俄罗斯: 'ru',
  蒙古: 'mn',
}

// ---------------------------------------------------------------------------
// 缓存：内存 Map + localStorage 持久化
// ---------------------------------------------------------------------------
const GEO_CACHE = new Map<string, GeocodeResult>()
const CACHE_KEY = 'xingji:geocache'
// 本次会话内已查过的城市坐标（避免同一城市多个子景点重复请求）
const CITY_CACHE = new Map<string, GeocodeResult>()

function loadCache(): void {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (raw) {
      const obj = JSON.parse(raw) as Record<string, GeocodeResult>
      for (const [k, v] of Object.entries(obj)) {
        if (v && typeof v.lat === 'number' && typeof v.lng === 'number') GEO_CACHE.set(k, v)
      }
    }
  } catch {
    /* 隐私模式 / 异常数据下忽略 */
  }
}

function saveCache(): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(GEO_CACHE)))
  } catch {
    /* 忽略 */
  }
}

if (typeof window !== 'undefined') loadCache()

// ---------------------------------------------------------------------------
// 上下文构造
// ---------------------------------------------------------------------------
function cacheKeyOf(place: string, ctx?: GeoContext): string {
  return `${place}@${ctx?.city || ''}@${ctx?.country || ''}`
}

function countryCodeOf(ctx?: GeoContext): string | undefined {
  if (!ctx?.country) return undefined
  return COUNTRY_CODES[ctx.country.trim()]
}

/** 没有显式国家、但地名含中文时，默认偏置中国（本 app 以中文旅行为主） */
function defaultCountryCode(place: string, ctx?: GeoContext): string | undefined {
  const cc = countryCodeOf(ctx)
  if (cc) return cc
  if (/[一-鿿]/.test(place)) return 'cn'
  return undefined
}

// ---------------------------------------------------------------------------
// 外部地理服务（均免 key / CORS 开放）
// ---------------------------------------------------------------------------

/** Open-Meteo 地理编码（Geonames 数据源，对城市级地点较准） */
async function geocodeOpenMeteo(place: string, lang?: string): Promise<{ lat: number; lng: number } | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 6000)
  try {
    const url =
      'https://geocoding-api.open-meteo.com/v1/search?name=' +
      encodeURIComponent(place) +
      '&count=1&format=json' +
      (lang ? `&language=${lang}` : '')
    const resp = await fetch(url, { signal: ctrl.signal })
    if (!resp.ok) return null
    const j = await resp.json()
    const r = j?.results?.[0]
    if (r && typeof r.latitude === 'number' && typeof r.longitude === 'number') {
      return { lat: r.latitude, lng: r.longitude }
    }
  } catch (e) {
    console.warn('[geocodeOpenMeteo] 失败：', e)
  } finally {
    clearTimeout(timer)
  }
  return null
}

/**
 * 构建 Nominatim 消歧查询串：
 * 苏堤 → "苏堤, 杭州, 中国"；有 countrycodes 偏置时用它限定国家范围
 */
function nominatimQuery(place: string, ctx?: GeoContext): { q: string; cc?: string } {
  const parts = [place]
  if (ctx?.city && ctx.city !== place) parts.push(ctx.city)
  if (ctx?.country) parts.push(ctx.country)
  const cc = defaultCountryCode(place, ctx)
  return { q: parts.join(', '), cc }
}

/** Nominatim（OpenStreetMap，免 key，CORS 开放）
 *  城市/国家上下文嵌入自由文本查询串 q，并用 countrycodes 偏置国家 */
async function geocodeNominatim(place: string, ctx?: GeoContext): Promise<{ lat: number; lng: number } | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 6000)
  try {
    const { q, cc } = nominatimQuery(place, ctx)
    const params = new URLSearchParams()
    params.set('format', 'jsonv2')
    params.set('limit', '1')
    params.set('dedupe', '1')
    params.set('q', q)
    if (cc) params.set('countrycodes', cc)
    const url = 'https://nominatim.openstreetmap.org/search?' + params.toString()
    const resp = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.5' },
    })
    if (!resp.ok) return null
    const arr = await resp.json()
    if (Array.isArray(arr) && arr[0] && arr[0].lat && arr[0].lon) {
      return { lat: parseFloat(arr[0].lat), lng: parseFloat(arr[0].lon) }
    }
  } catch (e) {
    console.warn('[geocodeNominatim] 失败：', e)
  } finally {
    clearTimeout(timer)
  }
  return null
}

// ---------------------------------------------------------------------------
// 城市级兜底：子景点查不到、但已知城市时，落到城市坐标（避免外地同名匹配）
// ---------------------------------------------------------------------------
async function geocodeKnownCity(city: string, country?: string): Promise<GeocodeResult | null> {
  const cacheKey = `city:${city}@${country || ''}`
  const hit = CITY_CACHE.get(cacheKey)
  if (hit) return hit

  const ctx: GeoContext = { country }
  // 城市级查询不再带子景点，直接查城市本身
  const nom = await geocodeNominatim(city, ctx)
  if (nom) {
    const r: GeocodeResult = { lat: nom.lat, lng: nom.lng, source: 'nominatim' }
    CITY_CACHE.set(cacheKey, r)
    return r
  }
  const om = await geocodeOpenMeteo(city, 'zh')
  if (om) {
    const r: GeocodeResult = { lat: om.lat, lng: om.lng, source: 'open-meteo' }
    CITY_CACHE.set(cacheKey, r)
    return r
  }
  const c = getMockCoordinates(city)
  const r: GeocodeResult = { lat: c.lat, lng: c.lng, source: 'manual' }
  CITY_CACHE.set(cacheKey, r)
  return r
}

/** 在城市坐标基础上加微抖动，避免同城多景点完全重叠 */
function jitter(base: { lat: number; lng: number }): { lat: number; lng: number } {
  const lat = base.lat + (Math.random() - 0.5) * 0.04
  const lng = base.lng + (Math.random() - 0.5) * 0.04
  return { lat, lng }
}

// ---------------------------------------------------------------------------
// 主入口
// ---------------------------------------------------------------------------
/** 对单个地点做地理编码（命中缓存直接返回） */
export async function geocodePlace(place: string, ctx?: GeoContext): Promise<GeocodeResult> {
  const key = cacheKeyOf(place, ctx)
  const cached = GEO_CACHE.get(key)
  if (cached) {
    cached.source = 'cache'
    return cached
  }

  // 1) 后端（vite dev / 自建服务；4s 超时防止挂起）
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 4000)
    const resp = await fetch('/api/geocode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ place, city: ctx?.city, country: ctx?.country }),
      signal: ctrl.signal,
    })
    clearTimeout(timer)
    if (resp.ok) {
      const d = await resp.json()
      if (typeof d.lat === 'number' && typeof d.lng === 'number') {
        const r: GeocodeResult = { lat: d.lat, lng: d.lng, source: d.source || 'nominatim' }
        GEO_CACHE.set(key, r)
        saveCache()
        return r
      }
    }
  } catch (e) {
    console.warn('[geocodePlace] 后端不可用，尝试客户端地理编码：', e)
  }

  // 2) 客户端兜底：Nominatim 结构化消歧（place + city + countrycodes）
  const nom = await geocodeNominatim(place, ctx)
  if (nom) {
    const r: GeocodeResult = { lat: nom.lat, lng: nom.lng, source: 'nominatim' }
    GEO_CACHE.set(key, r)
    saveCache()
    return r
  }

  // 3) 客户端兜底：Open-Meteo（带中文重试一次）
  const om = (await geocodeOpenMeteo(place, 'zh')) || (await geocodeOpenMeteo(place))
  if (om) {
    const r: GeocodeResult = { lat: om.lat, lng: om.lng, source: 'open-meteo' }
    GEO_CACHE.set(key, r)
    saveCache()
    return r
  }

  // 4) 城市兜底：子景点查不到但知道城市 → 落到城市坐标（加微抖动），绝不到外地
  if (ctx?.city) {
    const cityRes = await geocodeKnownCity(ctx.city, ctx.country)
    if (cityRes) {
      const j = jitter(cityRes)
      const r: GeocodeResult = { lat: j.lat, lng: j.lng, source: 'city-fallback' }
      GEO_CACHE.set(key, r)
      saveCache()
      return r
    }
  }

  // 5) 最后才回退到本地坐标表（精确 → 行政后缀/国名剥离 → 中国中部默认点）
  const c = getMockCoordinates(place)
  const r: GeocodeResult = { lat: c.lat, lng: c.lng, source: 'manual' }
  GEO_CACHE.set(key, r)
  saveCache()
  return r
}

/** 批量地理编码（用于 Loading 阶段逐站解析） */
export async function geocodeTrips(trips: Trip[]): Promise<void> {
  for (const t of trips) {
    const r = await geocodePlace(t.place, { city: t.city, country: t.country })
    t.lat = r.lat
    t.lng = r.lng
    t.geoSource = r.source
  }
}
