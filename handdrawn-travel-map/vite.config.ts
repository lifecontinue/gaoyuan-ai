import { defineConfig, loadEnv, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'
import { buildSystemPrompt, buildUserPrompt } from './src/prompts/parseTrip'

// --- 从 .env 注入 API Key（仅服务端可见） ---
function injectEnv(mode: string) {
  const env = loadEnv(mode, process.cwd(), '')
  if (env.DEEPSEEK_API_KEY) process.env.DEEPSEEK_API_KEY = env.DEEPSEEK_API_KEY
}

// --- 读取请求体 ---
function readBody(req: any): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk: any) => (data += chunk))
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

// --- DeepSeek 调用（服务端） ---
async function callDeepSeek(apiKey: string, text: string): Promise<any> {
  const resp = await fetch('https://api.deepseek.com/chat/completions', {
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
  return JSON.parse(content)
}

// --- 地理编码缓存与已知地名 ---
const geoCache = new Map<string, { lat: number; lng: number }>()

const KNOWN_PLACES: Record<string, { lat: number; lng: number }> = {
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
  '太原': { lat: 37.8706, lng: 112.5489 },
  '呼和浩特': { lat: 40.8426, lng: 111.75 },
  '青岛': { lat: 36.0671, lng: 120.3826 },
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
}

function matchKnown(place: string): { lat: number; lng: number } | null {
  if (KNOWN_PLACES[place]) return KNOWN_PLACES[place]
  for (const [key, val] of Object.entries(KNOWN_PLACES)) {
    if (place.includes(key) || key.includes(place)) return val
  }
  return null
}

async function geocode(place: string): Promise<{ lat: number; lng: number }> {
  if (geoCache.has(place)) return geoCache.get(place)!
  const known = matchKnown(place)
  if (known) {
    geoCache.set(place, known)
    return known
  }
  const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=' + encodeURIComponent(place)
  const resp = await fetch(url, {
    headers: { 'User-Agent': 'HanddrawnTravelMap/0.1 (educational-demo)' },
  })
  const arr = await resp.json()
  if (Array.isArray(arr) && arr[0] && arr[0].lat && arr[0].lon) {
    const r = { lat: parseFloat(arr[0].lat), lng: parseFloat(arr[0].lon) }
    geoCache.set(place, r)
    return r
  }
  throw new Error('未找到坐标：' + place)
}

// --- Vite 插件：/api/parse-trip ---
function deepseekParsePlugin(): Plugin {
  return {
    name: 'deepseek-parse-api',
    configureServer(server) {
      server.middlewares.use('/api/parse-trip', async (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end('Method Not Allowed'); return }
        try {
          const body = await readBody(req)
          const obj = JSON.parse(body || '{}')
          const text = obj.text || ''
          const apiKey = process.env.DEEPSEEK_API_KEY
          if (!apiKey) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'DEEPSEEK_API_KEY 未配置' }))
            return
          }
          const result = await callDeepSeek(apiKey, text)
          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(result))
        } catch (e: any) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: String(e && e.message ? e.message : String(e)) }))
        }
      })
    },
  }
}

// --- Vite 插件：/api/geocode ---
function geocodePlugin(): Plugin {
  return {
    name: 'geocode-api',
    configureServer(server) {
      server.middlewares.use('/api/geocode', async (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end('Method Not Allowed'); return }
        try {
          const body = await readBody(req)
          const obj = JSON.parse(body || '{}')
          const place = obj.place || ''
          const coords = await geocode(place)
          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ lat: coords.lat, lng: coords.lng, source: geoCache.has(place) ? 'cache' : 'nominatim' }))
        } catch (e: any) {
          res.statusCode = 404
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: String(e && e.message ? e.message : String(e)) }))
        }
      })
    },
  }
}

// --- Vite 插件：/api/generate-image（AI 配图） ---
function imageGenPlugin(): Plugin {
  return {
    name: 'image-gen-api',
    configureServer(server) {
      server.middlewares.use('/api/generate-image', async (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end('Method Not Allowed'); return }
        try {
          const body = await readBody(req)
          const obj = JSON.parse(body || '{}')
          const query = obj.query || 'travel scenery'
          const encoded = encodeURIComponent(query)
          const sig = String(Date.now())
          const imageUrl = 'https://source.unsplash.com/400x240/?' + encoded + '&sig=' + sig
          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ url: imageUrl, query }))
        } catch (e: any) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: String(e && e.message ? e.message : String(e)) }))
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  injectEnv(mode)
  return {
    plugins: [vue(), tailwindcss(), deepseekParsePlugin(), geocodePlugin(), imageGenPlugin()],
    resolve: {
      alias: { '@': resolve(__dirname, 'src') },
    },
    server: {
      host: '0.0.0.0',
      port: 5173,
    },
  }
})
