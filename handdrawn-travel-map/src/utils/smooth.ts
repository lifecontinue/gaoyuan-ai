/**
 * Catmull-Rom 样条平滑 → 贝塞尔曲线
 * 将经纬度点序列转换为平滑的 SVG path d 字符串
 */

interface Point {
  x: number
  y: number
}

/**
 * Catmull-Rom → Bezier 控制点
 */
function catmullRomToBezier(p0: Point, p1: Point, p2: Point, p3: Point, t: number = 0.5): [Point, Point] {
  const v: [number, number] = [
    (p2.x - p0.x) * t,
    (p2.y - p0.y) * t,
  ]
  const w: [number, number] = [
    (p3.x - p1.x) * t,
    (p3.y - p1.y) * t,
  ]

  return [
    { x: p1.x + v[0], y: p1.y + v[1] },
    { x: p2.x - w[0], y: p2.y - w[1] },
  ]
}

/**
 * 点序列 → SVG path d 字符串
 * @param pts 输入点序列
 * @param closed 是否闭合路径
 */
export function smoothPath(pts: Point[], closed = false): string {
  if (pts.length < 2) return ''
  if (pts.length === 2) {
    return `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y}`
  }

  const result: string[] = []
  result.push(`M ${pts[0].x} ${pts[0].y}`)

  if (closed) {
    // 闭合路径：首尾相连
    const n = pts.length
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i - 1 + n) % n]
      const p1 = pts[i]
      const p2 = pts[(i + 1) % n]
      const p3 = pts[(i + 2) % n]
      const [cp1, cp2] = catmullRomToBezier(p0, p1, p2, p3)
      result.push(`C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${p2.x} ${p2.y}`)
    }
    result.push('Z')
  } else {
    // 开放路径：首段用直线，中间用样条，末段用直线
    result.push(`L ${pts[1].x} ${pts[1].y}`)
    const n = pts.length
    for (let i = 1; i < n - 2; i++) {
      const p0 = pts[i - 1]
      const p1 = pts[i]
      const p2 = pts[i + 1]
      const p3 = pts[i + 2]
      const [cp1, cp2] = catmullRomToBezier(p0, p1, p2, p3)
      result.push(`C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${p2.x} ${p2.y}`)
    }
    if (n > 2) {
      result.push(`L ${pts[n - 1].x} ${pts[n - 1].y}`)
    }
  }

  return result.join(' ')
}
