/**
 * 坐标转换工具
 * GCJ-02 / BD-09 / WGS-84 互转
 */

const PI = Math.PI
const AXIS = 6378245.0 // 长半轴
const OFFSET = 0.00669342162296594323 // 扁率

/**
 * 判断坐标是否在中国境内
 */
function isInChina(lng: number, lat: number): boolean {
  return lng >= 72.004 && lng <= 137.8347 && lat >= 0.8293 && lat <= 55.8271
}

function transformLat(x: number, y: number): number {
  let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x))
  ret += (20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0 / 3.0
  ret += (20.0 * Math.sin(y * PI) + 40.0 * Math.sin(y / 3.0 * PI)) * 2.0 / 3.0
  ret += (160.0 * Math.sin(y / 12.0 * PI) + 320 * Math.sin(y * PI / 30.0)) * 2.0 / 3.0
  return ret
}

function transformLng(x: number, y: number): number {
  let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x))
  ret += (20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0 / 3.0
  ret += (20.0 * Math.sin(x * PI) + 40.0 * Math.sin(x / 3.0 * PI)) * 2.0 / 3.0
  ret += (150.0 * Math.sin(x / 12.0 * PI) + 300.0 * Math.sin(x / 30.0 * PI)) * 2.0 / 3.0
  return ret
}

/**
 * WGS-84 → GCJ-02（火星坐标系）
 */
export function wgs84ToGcj02(lng: number, lat: number): [number, number] {
  if (!isInChina(lng, lat)) return [lng, lat]
  let dLat = transformLat(lng - 105.0, lat - 35.0)
  let dLng = transformLng(lng - 105.0, lat - 35.0)
  const radLat = lat / 180.0 * PI
  let magic = Math.sin(radLat)
  magic = 1 - OFFSET * magic * magic
  const sqrtMagic = Math.sqrt(magic)
  dLat = (dLat * 180.0) / ((AXIS * (1 - OFFSET)) / (magic * sqrtMagic) * PI)
  dLng = (dLng * 180.0) / (AXIS / sqrtMagic * Math.cos(radLat) * PI)
  return [lng + dLng, lat + dLat]
}

/**
 * GCJ-02 → WGS-84（迭代反算）
 */
export function gcj02ToWgs84(lng: number, lat: number): [number, number] {
  if (!isInChina(lng, lat)) return [lng, lat]
  let wgsLng = lng
  let wgsLat = lat
  let tempPoint: [number, number]
  // 迭代反算，一般 10 次以内收敛
  for (let i = 0; i < 15; i++) {
    tempPoint = wgs84ToGcj02(wgsLng, wgsLat)
    wgsLng = lng - (tempPoint[0] - lng)
    wgsLat = lat - (tempPoint[1] - lat)
  }
  return [wgsLng, wgsLat]
}

// ---------------------------------------------------------------------------
// 内置常见城市坐标表（Nominatim 不可用时的降级落点）
// ---------------------------------------------------------------------------
const MOCK_COORDS: Record<string, { lat: number; lng: number }> = {
  '杭州西湖': { lat: 30.2595, lng: 120.1496 },
  '杭州': { lat: 30.2741, lng: 120.1551 },
  '成都宽窄巷子': { lat: 30.6719, lng: 104.0546 },
  '成都': { lat: 30.5728, lng: 104.0668 },
  '京都': { lat: 35.0116, lng: 135.7681 },
  '伏见稻荷大社': { lat: 34.9671, lng: 135.7727 },
  '北海道': { lat: 43.0642, lng: 141.3469 },
  '札幌': { lat: 43.0617, lng: 141.3545 },
  '北京': { lat: 39.9042, lng: 116.4074 },
  '上海': { lat: 31.2304, lng: 121.4737 },
  '广州': { lat: 23.1291, lng: 113.2644 },
  '深圳': { lat: 22.5431, lng: 114.0579 },
  '西安': { lat: 34.3416, lng: 108.9398 },
  '重庆': { lat: 29.4316, lng: 106.9123 },
  '南京': { lat: 32.0603, lng: 118.7969 },
  '苏州': { lat: 29.8568, lng: 120.5553 },
  '厦门': { lat: 24.4798, lng: 118.0894 },
  '大理': { lat: 25.6065, lng: 100.2596 },
  '丽江': { lat: 26.8721, lng: 100.2299 },
  '拉萨': { lat: 29.65, lng: 91.1 },
  '东京': { lat: 35.6762, lng: 139.6503 },
  '大阪': { lat: 34.6937, lng: 135.5023 },
  '曼谷': { lat: 13.7563, lng: 100.5018 },
  '新加坡': { lat: 1.3521, lng: 103.8198 },
  '巴黎': { lat: 48.8566, lng: 2.3522 },
  '伦敦': { lat: 51.5074, lng: -0.1278 },
  '纽约': { lat: 40.7128, lng: -74.006 },
  // —— 常见子景点（无网络 / 被墙时也能落对城市）——
  '苏堤': { lat: 30.2587, lng: 120.1453 },
  '西湖': { lat: 30.2595, lng: 120.1496 },
  '灵隐寺': { lat: 30.2411, lng: 120.0996 },
  '雷峰塔': { lat: 30.2315, lng: 120.1486 },
  '断桥': { lat: 30.2598, lng: 120.149 },
  '大熊猫基地': { lat: 30.7333, lng: 104.1436 },
  '成都大熊猫基地': { lat: 30.7333, lng: 104.1436 },
  '岚山': { lat: 35.0094, lng: 135.6722 },
  '清水寺': { lat: 34.9949, lng: 135.785 },
  '千本鸟居': { lat: 34.9671, lng: 135.7727 },
  '拙政园': { lat: 31.3246, lng: 120.6323 },
  '狮子林': { lat: 31.3225, lng: 120.636 },
  '平江路': { lat: 31.3126, lng: 120.638 },
  '外滩': { lat: 31.2397, lng: 121.4905 },
  '故宫': { lat: 39.9163, lng: 116.3972 },
  '长城': { lat: 40.4319, lng: 116.5704 },
}

/** 根据地点名获取坐标（精确 → 模糊 → 中国中部默认点） */
export function getMockCoordinates(place: string): { lat: number; lng: number } {
  // 依次尝试：原名 → 去掉行政后缀（杭州市→杭州） → 去掉国家前缀（日本京都→京都）
  const candidates = [
    place,
    place.replace(/[省市区县州府]$/, ''),
    place.replace(/^(?:日本|中国|美国|英国|法国|德国|韩国|泰国|新加坡|意大利|西班牙|澳大利亚|加拿大|新西兰)/, ''),
  ]
  for (const p of new Set(candidates)) {
    if (MOCK_COORDS[p]) return MOCK_COORDS[p]
    for (const [key, val] of Object.entries(MOCK_COORDS)) {
      if (p.includes(key) || key.includes(p)) return val
    }
  }
  return { lat: 30.9577, lng: 117.3831 }
}
