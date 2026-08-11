/**
 * Rough.js 手绘标记生成器
 * 生成手绘风格的 SVG 图钉/标记图标字符串
 */

const ROUGH_OPTS = {
  roughness: 1.6,
  bowing: 1.8,
  stroke: '#3a3226',
  strokeWidth: 2,
  fillStyle: 'hachure' as const,
  hachureAngle: -41,
  hachureGap: 5,
}

/**
 * 构建手绘风格「定位」标记的 SVG 字符串
 * 经典地图水滴针 + 白色内圈，内部承载 emoji / 编号，明确表达"定位"
 * @param label 编号文字（无 emoji 时显示）
 * @param fillColor 填充颜色
 * @param emoji 可选 emoji
 */
export function buildMarkerSVG(label: string, fillColor: string, emoji?: string): string {
  const cx = 24
  const cy = 20
  const circleR = 16
  const pinTop = 35
  const pinBottom = 54
  const fid = 'hmd' + Math.floor(Math.random() * 1e6)

  const inner = emoji
    ? `<text x="${cx}" y="${cy + 6}" text-anchor="middle" font-size="15">${emoji}</text>`
    : `<text x="${cx}" y="${cy + 5}" text-anchor="middle" class="hd-marker-label" font-size="12">${label}</text>`

  return `<svg width="48" height="60" viewBox="0 0 48 60" xmlns="http://www.w3.org/2000/svg" class="hd-marker" style="overflow:visible">
    <defs>
      <filter id="${fid}">
        <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="${Math.floor(Math.random() * 999)}" result="n"/>
        <feDisplacementMap in="SourceGraphic" in2="n" scale="1.5"/>
      </filter>
    </defs>
    <circle class="hd-pulse" cx="${cx}" cy="${cy}" r="${circleR - 1}" fill="none" stroke="${fillColor}" stroke-width="2" />
    <circle cx="${cx}" cy="${cy}" r="${circleR}" fill="${fillColor}" fill-opacity="0.92" stroke="#3a3226" stroke-width="2" style="filter: url(#${fid})" />
    <circle cx="${cx}" cy="${cy}" r="${circleR - 5}" fill="#fdf8ec" fill-opacity="0.95" />
    <path d="M${cx},${cy + circleR - 2} Q${cx - 3},${pinTop} ${cx},${pinBottom} Q${cx + 3},${pinTop} ${cx},${cy + circleR - 2}" fill="#3a3226" opacity="0.88" style="filter: url(#${fid})" />
    ${inner}
  </svg>`
}

/**
 * 获取调色板颜色
 */
export function getPaletteColor(index: number): string {
  const palette = [
    '#d9744f', '#e0a93b', '#4a8a8a',
    '#6b8cae', '#7a8b5a', '#b5688f',
  ]
  return palette[index % palette.length]
}
