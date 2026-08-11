/**
 * 真实地图路线获取
 * 调用 OSRM 公共路由服务（无需 key、支持 CORS）获取驾车最短路径，
 * 用于把相邻地点用「真实道路轨迹」而非直线连起来。
 * 飞行 / 火车 / 轮船等无道路路由的交通工具返回 null，由调用方回退为平滑曲线。
 */

import type { TransportMode } from '@/types/travel'
import type { LatLngExpression } from 'leaflet'

interface LatLngSimple {
  lat: number
  lng: number
}

const OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving'

// 简单内存缓存，避免重复请求同一段
const routeCache = new Map<string, LatLngExpression[]>()

/** 可通过道路路由的交通工具 */
function isRoadMode(mode: TransportMode): boolean {
  return mode === 'car' || mode === 'bus' || mode === 'auto' || mode === 'walk'
}

/**
 * 获取两地之间的真实道路轨迹
 * @returns 坐标数组 [lat, lng][]；失败或无道路路由时返回 null
 */
export async function fetchRoute(
  a: LatLngSimple,
  b: LatLngSimple,
  mode: TransportMode,
): Promise<LatLngExpression[] | null> {
  if (!isRoadMode(mode)) return null

  const key =
    a.lng.toFixed(4) + ',' + a.lat.toFixed(4) + '-' +
    b.lng.toFixed(4) + ',' + b.lat.toFixed(4) + '-' + mode
  const cached = routeCache.get(key)
  if (cached) return cached

  const coord = a.lng + ',' + a.lat + ';' + b.lng + ',' + b.lat
  const url = OSRM_BASE + '/' + coord + '?overview=full&geometries=geojson'

  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 6000)
    const res = await fetch(url, { signal: ctrl.signal })
    clearTimeout(timer)
    if (!res.ok) return null
    const data = await res.json()
    const geom = data?.routes?.[0]?.geometry?.coordinates as [number, number][] | undefined
    if (!Array.isArray(geom) || geom.length < 2) return null
    const pts: LatLngExpression[] = geom.map((c) => [c[1], c[0]])
    routeCache.set(key, pts)
    return pts
  } catch {
    return null
  }
}

/**
 * 回退方案：生成一条平滑的二次贝塞尔曲线（非直线），
 * 用于无道路路由的交通工具或接口失败时的兜底。
 */
export function buildCurvedSegment(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): LatLngExpression[] {
  const dy = lat2 - lat1
  const dx = lng2 - lng1
  const len = Math.hypot(dx, dy) || 1
  const off = len * 0.18
  const mx = (lng1 + lng2) / 2 + (-dy / len) * off
  const my = (lat1 + lat2) / 2 + (dx / len) * off

  const N = 28
  const pts: LatLngExpression[] = []
  for (let i = 0; i <= N; i++) {
    const t = i / N
    const x = (1 - t) * (1 - t) * lng1 + 2 * (1 - t) * t * mx + t * t * lng2
    const y = (1 - t) * (1 - t) * lat1 + 2 * (1 - t) * t * my + t * t * lat2
    pts.push([y, x])
  }
  return pts
}
