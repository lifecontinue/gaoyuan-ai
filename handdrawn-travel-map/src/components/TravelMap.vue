<template>
  <div ref="mapContainer" class="travel-map map-container">
    <!-- SVG 路径动画层（覆盖在 Leaflet 上方，仅播放时显示） -->
    <svg v-if="animatedPathD && props.playing" class="path-anim-layer" :viewBox="svgViewBox" preserveAspectRatio="none">
      <defs>
        <filter id="hd-path-filter" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="2" seed="42" result="n"/>
          <feDisplacementMap in="SourceGraphic" in2="n" scale="2.5"/>
        </filter>
      </defs>
      <path
        ref="animPathEl"
        :d="animatedPathD"
        fill="none"
        stroke="#6b5d49"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        filter="url(#hd-path-filter)"
        :style="{ strokeDasharray: pathDashArray, strokeDashoffset: pathDashOffset, opacity: pathOpacity }"
      />
    </svg>

    <!-- 移动标记（轨迹回放） -->
    <div v-if="showMovingMarker" class="moving-marker" :style="movingMarkerStyle">
      <div class="moving-marker-pulse"></div>
      <span class="moving-marker-icon">✈</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import L from 'leaflet'
import type { Trip, TransportMode } from '@/types/travel'
import { buildMarkerSVG } from '@/composables/useRoughMarker'
import { useTripStore } from '@/stores/trip'
import { expandToDayCards } from '@/utils/dayCards'
import { fetchRoute, buildCurvedSegment } from '@/utils/routeFetcher'

const tripStore = useTripStore()

const props = defineProps<{
  trips: Trip[]
  selectedId: string | null
  viewMode: string
  playing?: boolean
  currentIndex?: number
}>()

const emit = defineEmits<{
  'marker-click': [id: string]
  ready: []
  'animation-complete': []
}>()

// --- Refs ---
const mapContainer = ref<HTMLElement>()
const animPathEl = ref<SVGPathElement>()
let map: L.Map | null = null
let markers: L.Marker[] = []
let pathLayer: L.LayerGroup | null = null
let transportLayer: L.LayerGroup | null = null
let routeLayer: L.LayerGroup | null = null
let mapReady = false
let initialFocusDone = false

// --- 常驻浮窗卡片状态（默认全部常开，用户可手动关闭） ---
let cardLayerEl: HTMLElement | null = null
const cardEls = new Map<string, HTMLElement>()
const closedCards = new Set<string>()
let lastTripKey = ''
let cardZ = 100
let posRaf = 0

// --- 语音播放（精简版：所有卡片共用一个播放器） ---
let audioPlayer: HTMLAudioElement | null = null
let playingCardEl: HTMLElement | null = null
let playingAudioIdx = -1

// --- 每张卡片的图片轮播索引（存到卡片 DOM 上，避免多卡片互相干扰） ---
function getImgIdx(root: HTMLElement): number {
  return Number(root.dataset.imgIdx || 0)
}
function setImgIdx(root: HTMLElement, v: number) {
  root.dataset.imgIdx = String(v)
}

// --- 调色板 ---
const PALETTE = [
  '#d9744f', '#e0a93b', '#4a8a8a',
  '#6b8cae', '#7a8b5a', '#b5688f',
]

// --- 路径动画状态 ---
const animatedPathD = ref('')
const svgViewBox = ref('0 0 800 600')
const pathDashArray = ref('8 6')
const pathDashOffset = ref(0)
const pathOpacity = ref(0)
const showMovingMarker = ref(false)
const movingMarkerStyle = ref<Record<string, string>>({})

// --- 动画控制 ---
let animFrameId: number | null = null
let pathAnimTimer: ReturnType<typeof setTimeout> | null = null
let moveAlongAnimId: number | null = null

// ==========================================
// 地图初始化
// ==========================================
function initMap() {
  if (!mapContainer.value) return

  map = L.map(mapContainer.value, {
    center: [35.0, 105.0],
    zoom: 4,
    zoomControl: false,
    attributionControl: true,
  })

  // zoom 控件移至右上，避免与顶部路线概览浮层重叠
  L.control.zoom({ position: 'topright' }).addTo(map)

  L.tileLayer(
    'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png',
    {
      attribution: '&copy; OSM &copy; CARTO',
      subdomains: 'abcd',
      maxZoom: 19,
    }
  ).addTo(map)

  pathLayer = L.layerGroup().addTo(map)
  transportLayer = L.layerGroup().addTo(map)
  routeLayer = L.layerGroup().addTo(map)
  mapReady = true

  // 阻止把图片拖到地图上时浏览器跳转
  const mc = mapContainer.value
  if (mc) {
    mc.addEventListener('dragover', (e: Event) => e.preventDefault())
    mc.addEventListener('drop', (e: Event) => e.preventDefault())
  }

  // 关键：地图就绪后立即渲染已有数据
  renderMarkers()
  renderTransportIcons()
  renderRoute()

  emit('ready')
}

// ==========================================
// 标记渲染（stagger 入场）
// ==========================================
function renderMarkers() {
  if (!map || !mapReady) return

  markers.forEach(m => m.remove())
  markers = []

  props.trips.forEach((trip, index) => {
    if (trip.lat == null || trip.lng == null) return

    const color = PALETTE[index % PALETTE.length]
    const label = String(index + 1)
    const svgHtml = buildMarkerSVG(label, color, trip.emoji || '📍')
    const html = '<div class="hd-marker-wrap">' + svgHtml +
      '<div class="hd-marker-name">' + escapeHtml(trip.place) + '</div></div>'

    const icon = L.divIcon({
      html,
      className: 'hd-marker-container',
      iconSize: [48, 60],
      iconAnchor: [24, 54],
    })

    const marker = L.marker([trip.lat!, trip.lng!], {
      icon,
      title: trip.place,
    })

    marker.on('click', () => {
      emit('marker-click', trip.id)
      openCard(trip.id)
    })

    marker.addTo(map!)
    markers.push(marker)

    // stagger 入场动画
    const el = marker.getElement()
    if (el) {
      el.style.opacity = '0'
      el.style.transform = 'translateY(-12px) scale(0.5)'
      el.style.transition = 'opacity 0.5s ease, transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)'
      setTimeout(() => {
        el.style.opacity = '1'
        el.style.transform = 'translateY(0) scale(1)'
      }, 300 + index * 180)
    }
  })

  // 常驻浮窗卡片：默认全部打开（用户手动关闭过的除外）；新一批行程则重置关闭状态
  const idKey = props.trips.map((t) => t.id).join('|')
  if (idKey !== lastTripKey) {
    closedCards.clear()
    lastTripKey = idKey
  }
  clearCards()
  ensureCardLayer()
  props.trips.forEach((trip, index) => {
    if (trip.lat != null && trip.lng != null && !closedCards.has(trip.id)) {
      buildCard(trip, index)
    }
  })

  if (markers.length > 0 && !initialFocusDone) {
    initialFocusDone = true
    // 聚焦第一站（等 stagger 入场动画基本完成）
    setTimeout(() => focusFirstPoint(), 450)
  }
}

// ==========================================
// 交通图标（相邻站点间）
// ==========================================
const TRANSPORT_ICONS: Record<TransportMode, string> = {
  plane: '✈️',
  train: '🚄',
  car: '🚗',
  bus: '🚌',
  ship: '🚢',
  walk: '🚶',
  auto: '📍',
}

function renderTransportIcons() {
  if (!transportLayer || !map || !mapReady) return
  transportLayer.clearLayers()

  const sorted = [...props.trips]
    .filter(t => t.lat != null && t.lng != null)
    .sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''))

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]
    const curr = sorted[i]
    const mode: TransportMode = curr.transport || 'auto'
    if (mode === 'auto') continue // 起点站或未指定

    const midLat = (prev.lat! + curr.lat!) / 2
    const midLng = (prev.lng! + curr.lng!) / 2

    const iconHtml = '<div class="transport-badge">' +
      '<span class="transport-icon">' + (TRANSPORT_ICONS[mode] || '📍') + '</span>' +
      '</div>'

    const icon = L.divIcon({
      html: iconHtml,
      className: 'transport-icon-container',
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    })

    L.marker([midLat, midLng], { icon, interactive: false })
      .addTo(transportLayer!)
  }
}

// ==========================================
// 故事浮窗（含真实图片）
// ==========================================
function getImageList(trip: Trip): string[] {
  const list: string[] = []
  if (trip.imageUrl) list.push(trip.imageUrl)
  if (trip.images && trip.images.length) list.push(...trip.images)
  return list
}

function escapeHtml(s: string): string {
  return (s || '').replace(/[&<>"']/g, (c) => {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  })
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

// ==========================================
// 常驻故事卡片（每个地点一张，默认全部常开，可手动关闭）
// ==========================================
function buildCardContent(trip: Trip): string {
  const dateStr = trip.startDate && trip.endDate
    ? trip.startDate + ' ~ ' + trip.endDate
    : trip.startDate || '时间未知'

  const tags = trip.tags && trip.tags.length > 0 ? trip.tags : [trip.summary || '旅行']

  const transportMode: TransportMode = trip.transport || 'auto'
  const transportHtml = transportMode !== 'auto'
    ? '<div class="popup-transport">' + TRANSPORT_ICONS[transportMode] + ' ' +
      (transportMode === 'plane' ? '飞机抵达' :
       transportMode === 'train' ? '高铁抵达' :
       transportMode === 'car' ? '自驾抵达' :
       transportMode === 'bus' ? '巴士抵达' :
       transportMode === 'ship' ? '轮船抵达' : '步行抵达') + '</div>'
    : ''

  // --- 多日展开 ---
  const dayCards = expandToDayCards(trip)
  const isMultiDay = dayCards.length > 1

  let dateAndDaysHtml = '<div class="popup-date">📅 ' + escapeHtml(dateStr) + '</div>' + transportHtml

  if (isMultiDay) {
    dateAndDaysHtml += '<div class="popup-day-cards" data-trip="' + (trip.id || '') + '">'
    dayCards.forEach((card, idx) => {
      const activeClass = idx === 0 ? ' day-card--active' : ''
      dateAndDaysHtml +=
        '<div class="day-card' + activeClass + '" data-day-idx="' + idx + '">' +
          '<div class="day-card__header">' +
            '<span class="day-card__date">' + escapeHtml(card.label) + '</span>' +
            '<span class="day-card__weekday">' + escapeHtml(card.weekday) + '</span>' +
          '</div>' +
          '<div class="day-card__weather">' +
            '<span class="day-card__weather-icon">' + card.weatherIcon + '</span>' +
            '<span class="day-card__weather-text">' + escapeHtml(card.weatherText) + '</span>' +
          '</div>' +
          '<div class="day-card__story">' + escapeHtml(card.storySnippet) + '</div>' +
        '</div>'
    })
    dateAndDaysHtml += '</div>'
    if (dayCards.length > 4) {
      dateAndDaysHtml += '<div class="day-cards-hint">← 左右滑动查看更多 →</div>'
    }
  }

  return (
    '<div class="story-popup" data-trip="' + (trip.id || '') + '">' +
      '<div class="popup-header">' +
        '<span class="popup-emoji">' + (trip.emoji || '📍') + '</span>' +
        '<span class="popup-title">' + escapeHtml(trip.place) + '</span>' +
        '<button class="popup-close" type="button" aria-label="关闭浮窗">×</button>' +
      '</div>' +
      '<button class="popup-enter-weather" type="button">🌤️ 进入此刻记忆</button>' +
      dateAndDaysHtml +
      '<div class="popup-image-zone">' +
        '<div class="popup-gallery">' +
          '<div class="popup-main-img-wrap">' +
            '<img class="popup-main-img" alt="' + escapeHtml(trip.place) + '" />' +
            '<button class="popup-remove" type="button" aria-label="删除此图">×</button>' +
          '</div>' +
          '<div class="popup-thumbs"></div>' +
        '</div>' +
        '<div class="popup-dropzone">' +
          '<div class="dz-icon">📷</div>' +
          '<div class="dz-text">把图片拖进来，或 <span class="dz-link">点击选择文件</span></div>' +
          '<div class="dz-hint">支持上传多张，最多 9 张</div>' +
          '<input type="file" accept="image/*" multiple class="popup-file-input" />' +
        '</div>' +
      '</div>' +
      '<div class="popup-audio-zone">' +
        '<div class="audio-head">' +
          '<span class="audio-head-ico">🎙️</span> 语音记忆' +
          '<button class="audio-rec-btn" type="button">● 录制</button>' +
          '<span class="audio-rec-status" style="display:none">' +
            '<span class="rec-dot"></span>' +
            '<span class="rec-time">00:00</span>' +
            '<button class="audio-stop-btn" type="button">⏹</button>' +
          '</span>' +
        '</div>' +
        '<div class="audio-list"></div>' +
      '</div>' +
      '<div class="popup-story">' + escapeHtml(trip.story) + '</div>' +
      '<div class="popup-tags">' +
        tags.map((t) => '<span class="popup-tag">#' + escapeHtml(t) + '</span>').join('') +
      '</div>' +
    '</div>'
  )
}

/** 卡片层容器（挂在地图容器内，z-index 高于 marker） */
function ensureCardLayer() {
  if (cardLayerEl || !mapContainer.value || !map) return
  cardLayerEl = document.createElement('div')
  cardLayerEl.className = 'hd-card-layer'
  mapContainer.value.appendChild(cardLayerEl)
  map.on('move zoom resize', schedulePositionAll)
}

/** 按当前地图视口摆放某张卡片（锚定在图钉上方） */
function positionCard(el: HTMLElement, trip: Trip) {
  if (!map || trip.lat == null || trip.lng == null) return
  const p = map.latLngToContainerPoint([trip.lat, trip.lng])
  el.style.left = p.x + 'px'
  el.style.top = p.y + 'px'
}

function positionAllCards() {
  if (!map) return
  cardEls.forEach((el, id) => {
    const trip = props.trips.find((t) => t.id === id)
    if (trip) positionCard(el, trip)
  })
}

function schedulePositionAll() {
  if (posRaf) return
  posRaf = requestAnimationFrame(() => {
    posRaf = 0
    positionAllCards()
  })
}

/** 销毁全部卡片（保留 closedCards 记忆） */
function clearCards() {
  stopCardAudio()
  cardEls.forEach((el) => el.remove())
  cardEls.clear()
}

/** 打开某地点的卡片（已关闭则重新打开；已打开则置顶） */
function openCard(tripId: string) {
  closedCards.delete(tripId)
  const trip = props.trips.find((t) => t.id === tripId)
  if (!trip) return
  const existing = cardEls.get(tripId)
  if (existing) {
    existing.style.zIndex = String(++cardZ)
    return
  }
  const idx = props.trips.findIndex((t) => t.id === tripId)
  buildCard(trip, Math.max(idx, 0))
}

/** 手动关闭某地点卡片 */
function closeCard(tripId: string) {
  closedCards.add(tripId)
  const el = cardEls.get(tripId)
  if (el) {
    stopCardAudio(el)
    el.remove()
    cardEls.delete(tripId)
    cleanupRecorder()
  }
}

/** 创建一张常驻卡片并挂载 */
function buildCard(trip: Trip, index: number) {
  if (!map || !cardLayerEl || trip.lat == null || trip.lng == null) return
  if (cardEls.has(trip.id)) return
  const el = document.createElement('div')
  el.className = 'hd-story-card'
  el.dataset.trip = trip.id
  el.style.animationDelay = Math.min(index * 60, 400) + 'ms'
  el.innerHTML = buildCardContent(trip)
  cardLayerEl.appendChild(el)
  cardEls.set(trip.id, el)
  attachPopupListeners(el, trip)
  positionCard(el, trip)
}

function attachPopupListeners(root: HTMLElement, trip: Trip) {
  const fileInput = root.querySelector('.popup-file-input') as HTMLInputElement | null
  const dropzone = root.querySelector('.popup-dropzone') as HTMLElement | null
  const removeBtn = root.querySelector('.popup-remove') as HTMLElement | null
  const enterBtn = root.querySelector('.popup-enter-weather') as HTMLElement | null
  const closeBtn = root.querySelector('.popup-close') as HTMLElement | null

  renderImageState(root, trip)

  closeBtn?.addEventListener('click', () => closeCard(trip.id))

  enterBtn?.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('enter-weather', { detail: trip.id }))
  })

  fileInput?.addEventListener('change', (e: Event) => {
    const input = e.target as HTMLInputElement
    handleFiles(input.files, trip, root)
    input.value = ''
  })
  dropzone?.addEventListener('click', () => fileInput?.click())
  dropzone?.addEventListener('dragover', (e: Event) => {
    const de = e as DragEvent
    de.preventDefault()
    dropzone.classList.add('dragover')
  })
  dropzone?.addEventListener('dragleave', () => dropzone.classList.remove('dragover'))
  dropzone?.addEventListener('drop', (e: Event) => {
    const de = e as DragEvent
    de.preventDefault()
    de.stopPropagation()
    dropzone.classList.remove('dragover')
    if (de.dataTransfer) handleFiles(de.dataTransfer.files, trip, root)
  })
  removeBtn?.addEventListener('click', () => removeCurrentImage(trip, root))
  setupAudioRecording(root, trip)
}

function renderImageState(root: HTMLElement, trip: Trip) {
  const list = getImageList(trip)
  const mainImg = root.querySelector('.popup-main-img') as HTMLImageElement | null
  const gallery = root.querySelector('.popup-gallery') as HTMLElement | null
  const dropzone = root.querySelector('.popup-dropzone') as HTMLElement | null
  const thumbsEl = root.querySelector('.popup-thumbs') as HTMLElement | null
  const removeBtn = root.querySelector('.popup-remove') as HTMLElement | null

  if (list.length === 0) {
    if (gallery) gallery.style.display = 'none'
    if (dropzone) dropzone.style.display = 'flex'
    return
  }

  const cur = Math.max(0, Math.min(getImgIdx(root), list.length - 1))
  setImgIdx(root, cur)
  if (dropzone) dropzone.style.display = 'none'
  if (gallery) gallery.style.display = 'block'
  if (mainImg) mainImg.src = list[cur]

  // 多图：横向缩略图条
  if (thumbsEl) {
    if (list.length > 1) {
      thumbsEl.style.display = 'flex'
      thumbsEl.innerHTML = list.map((src, i) =>
        '<button type="button" class="popup-thumb' + (i === getImgIdx(root) ? ' thumb--active' : '') +
        '" data-idx="' + i + '"><img src="' + src + '" alt="缩略图 ' + (i + 1) + '" /></button>'
      ).join('')
      thumbsEl.querySelectorAll<HTMLElement>('.popup-thumb').forEach((btn) => {
        btn.addEventListener('click', () => {
          setImgIdx(root, Number(btn.dataset.idx))
          renderImageState(root, trip)
        })
      })
      const active = thumbsEl.querySelector('.thumb--active')
      if (active) active.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
    } else {
      thumbsEl.style.display = 'none'
      thumbsEl.innerHTML = ''
    }
  }

  const aiCount = trip.imageUrl ? 1 : 0
  if (removeBtn) {
    removeBtn.style.display = (getImgIdx(root) >= aiCount) ? 'flex' : 'none'
  }
}

async function handleFiles(files: FileList | null, trip: Trip, root: HTMLElement) {
  const arr = Array.from(files || []).filter((f) => f.type.startsWith('image/'))
  if (arr.length === 0) return
  const dataUrls = await Promise.all(arr.map(readAsDataURL))
  tripStore.addImages(trip.id, dataUrls)
  const list = getImageList(trip)
  setImgIdx(root, list.length - 1)
  renderImageState(root, trip)
}

function removeCurrentImage(trip: Trip, root: HTMLElement) {
  const list = getImageList(trip)
  const cur = getImgIdx(root)
  if (cur < 0 || cur >= list.length) return
  const aiCount = trip.imageUrl ? 1 : 0
  if (cur < aiCount) return
  const uploadIdx = cur - aiCount
  const arr = [...(trip.images || [])]
  arr.splice(uploadIdx, 1)
  tripStore.setImages(trip.id, arr)
  const newList = getImageList(trip)
  setImgIdx(root, cur >= newList.length ? Math.max(0, newList.length - 1) : cur)
  renderImageState(root, trip)
}

// ==========================================
// 语音记忆录制（采集当时的记忆点）
// ==========================================
let activeRecorder: MediaRecorder | null = null
let recStream: MediaStream | null = null
let recTimerId: number | null = null
let recStartTime = 0

function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

function fmtTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  const m = Math.floor(s / 60).toString().padStart(2, '0')
  const ss = (s % 60).toString().padStart(2, '0')
  return m + ':' + ss
}

function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return ''
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c
  }
  return ''
}

function cleanupRecorder() {
  if (recTimerId !== null) { clearInterval(recTimerId); recTimerId = null }
  if (recStream) { recStream.getTracks().forEach((t) => t.stop()); recStream = null }
  activeRecorder = null
}

function setupAudioRecording(root: HTMLElement, trip: Trip) {
  const recBtn = root.querySelector('.audio-rec-btn') as HTMLElement | null
  const stopBtn = root.querySelector('.audio-stop-btn') as HTMLElement | null
  const statusEl = root.querySelector('.audio-rec-status') as HTMLElement | null
  const timeEl = root.querySelector('.rec-time') as HTMLElement | null

  renderAudioState(root, trip)

  recBtn?.addEventListener('click', async () => {
    if (activeRecorder) return
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (err) {
      window.alert('无法访问麦克风：' + (err as Error).message + '\n（需 HTTPS 或 localhost 环境）')
      return
    }
    recStream = stream
    const mime = pickMimeType()
    try {
      activeRecorder = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream)
    } catch {
      cleanupRecorder()
      window.alert('当前浏览器不支持语音录制')
      return
    }
    const chunks: Blob[] = []
    activeRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }
    activeRecorder.onstop = async () => {
      const blob = new Blob(chunks, { type: activeRecorder?.mimeType || 'audio/webm' })
      const url = await blobToDataURL(blob)
      tripStore.addAudio(trip.id, {
        url,
        duration: (Date.now() - recStartTime) / 1000,
        createdAt: new Date().toISOString(),
      })
      cleanupRecorder()
      if (recBtn) recBtn.style.display = 'inline-flex'
      if (statusEl) statusEl.style.display = 'none'
      if (timeEl) timeEl.textContent = '00:00'
      renderAudioState(root, trip)
    }
    recStartTime = Date.now()
    activeRecorder.start()
    if (recBtn) recBtn.style.display = 'none'
    if (statusEl) statusEl.style.display = 'flex'
    recTimerId = window.setInterval(() => {
      if (timeEl) timeEl.textContent = fmtTime((Date.now() - recStartTime) / 1000)
    }, 250)
  })

  stopBtn?.addEventListener('click', () => {
    if (activeRecorder && activeRecorder.state !== 'inactive') activeRecorder.stop()
  })
}

/** 停止播放（可选：只停指定卡片上的播放） */
function stopCardAudio(el?: HTMLElement) {
  if (el && playingCardEl !== el) return
  if (audioPlayer) {
    audioPlayer.pause()
    audioPlayer.onended = null
    audioPlayer = null
  }
  playingCardEl = null
  playingAudioIdx = -1
  if (el) syncPlayIcons(el)
}

/** 同步某卡片上所有播放按钮的图标（▶ / ⏸） */
function syncPlayIcons(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>('.audio-play').forEach((btn) => {
    const idx = Number(btn.dataset.idx)
    btn.textContent = playingCardEl === root && playingAudioIdx === idx ? '⏸' : '▶'
  })
}

function renderAudioState(root: HTMLElement, trip: Trip) {
  const listEl = root.querySelector('.audio-list') as HTMLElement | null
  if (!listEl) return
  const audios = trip.audios || []
  if (audios.length === 0) { listEl.innerHTML = ''; return }

  listEl.innerHTML = audios.map((a, i) => {
    const isPlaying = playingCardEl === root && playingAudioIdx === i
    return '<div class="audio-item' + (isPlaying ? ' audio-item--playing' : '') + '">' +
      '<button class="audio-play" type="button" data-idx="' + i + '" aria-label="播放/暂停">' +
        (isPlaying ? '⏸' : '▶') +
      '</button>' +
      '<span class="audio-dur">' + fmtTime(a.duration || 0) + '</span>' +
      '<button class="audio-del" type="button" data-idx="' + i + '" aria-label="删除语音">×</button>' +
    '</div>'
  }).join('')

  // 播放/暂停（所有卡片共用一个播放器）
  listEl.querySelectorAll<HTMLElement>('.audio-play').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.idx)
      const audio = audios[idx]
      if (!audio) return
      // 点同一段 → 暂停
      if (playingCardEl === root && playingAudioIdx === idx && audioPlayer) {
        stopCardAudio(root)
        return
      }
      stopCardAudio()
      audioPlayer = new Audio(audio.url)
      audioPlayer.onended = () => stopCardAudio(root)
      playingCardEl = root
      playingAudioIdx = idx
      audioPlayer.play().catch(() => {})
      syncPlayIcons(root)
    })
  })

  // 删除
  listEl.querySelectorAll<HTMLElement>('.audio-del').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.idx)
      if (playingCardEl === root && playingAudioIdx === idx) stopCardAudio(root)
      tripStore.removeAudio(trip.id, idx)
      renderAudioState(root, trip)
    })
  })
}

function focusFirstPoint() {
  if (!map) return
  const sorted = [...props.trips]
    .filter((t) => t.lat != null && t.lng != null)
    .sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''))
  if (sorted.length === 0) return
  const first = sorted[0]
  map.flyTo([first.lat!, first.lng!], 8, { duration: 1.2 })
}



// ==========================================
// 路径绘制动画（仅在播放回放时激活）
// ==========================================
// ==========================================
// 常驻动态连线（地点之间按真实道路轨迹连接、逐渐绘制）
// ==========================================
let routeRenderToken = 0

async function renderRoute() {
  if (!routeLayer || !map || !mapReady) return
  const myToken = ++routeRenderToken
  routeLayer.clearLayers()

  const sorted = [...props.trips]
    .filter(t => t.lat != null && t.lng != null)
    .sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''))

  if (sorted.length < 2) return

  // 并行获取每一段的真实道路轨迹（失败则回退为平滑曲线）
  const segs = await Promise.all(
    sorted.slice(1).map((b, i) =>
      fetchRoute(
        { lat: sorted[i].lat!, lng: sorted[i].lng! },
        { lat: b.lat!, lng: b.lng! },
        b.transport || 'auto',
      )
    )
  )
  if (myToken !== routeRenderToken) return

  sorted.slice(1).forEach((b, i) => {
    const a = sorted[i]
    const real = segs[i]
    const coords: L.LatLngExpression[] = (real && real.length >= 2)
      ? real
      : buildCurvedSegment(a.lat!, a.lng!, b.lat!, b.lng!)
    drawSegment(coords, i * 220, myToken)
  })
}

/** 绘制单段轨迹：先逐渐描出，再转为流动虚线 */
function drawSegment(coords: L.LatLngExpression[], delay: number, token: number) {
  if (!routeLayer) return

  // 底层柔光
  const base = L.polyline(coords, {
    color: '#d9744f',
    weight: 7,
    opacity: 0.14,
    lineCap: 'round',
    lineJoin: 'round',
    interactive: false,
  }).addTo(routeLayer)
  const baseEl = base.getElement() as HTMLElement | null
  if (baseEl) baseEl.style.animation = 'route-fade-in .8s ease both'

  // 上层流动线（初始隐藏，延迟后逐渐描出）
  const flow = L.polyline(coords, {
    color: '#d9744f',
    weight: 3,
    opacity: 0.92,
    lineCap: 'round',
    lineJoin: 'round',
    interactive: false,
  }).addTo(routeLayer)
  const flowEl = flow.getElement() as SVGPathElement | null
  if (flowEl) flowEl.style.opacity = '0'

  setTimeout(() => {
    if (token !== routeRenderToken || !flowEl) {
      // 拿不到元素则直接显示流动虚线
      if (flowEl) { flowEl.style.opacity = '1'; flowEl.classList.add('route-flow') }
      return
    }
    animateDashDraw(flowEl, 1300, () => {
      if (token !== routeRenderToken) return
      flowEl.style.strokeDasharray = '10 14'
      flowEl.style.opacity = '1'
      flowEl.classList.add('route-flow')
    })
  }, delay)
}

/** 用 dash-offset 把线条「画」出来（逐渐绘制效果） */
function animateDashDraw(pathEl: SVGPathElement, duration: number, onDone: () => void) {
  const len = pathEl.getTotalLength()
  if (!len || !isFinite(len)) { onDone(); return }
  pathEl.style.opacity = '1'
  pathEl.style.strokeDasharray = String(len)
  pathEl.style.strokeDashoffset = String(len)
  const start = performance.now()
  function step(now: number) {
    const p = Math.min((now - start) / duration, 1)
    const eased = 1 - Math.pow(1 - p, 3)
    pathEl.style.strokeDashoffset = String(len * (1 - eased))
    if (p < 1) requestAnimationFrame(step)
    else onDone()
  }
  requestAnimationFrame(step)
}

function renderPaths() {
  // 常驻动态连线由 renderRoute() 负责（始终显示、流动动画）
  // 此处仅在播放回放模式（playing）下叠加一次性的「手绘描边」绘制动画
  if (!props.playing) return

  if (!pathLayer || !map || !mapReady) return

  pathLayer.clearLayers()

  const sortedTrips = [...props.trips]
    .filter(t => t.lat != null && t.lng != null)
    .sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''))

  if (sortedTrips.length < 2) return

  // 构建 SVG 动画路径（叠加在常驻连线之上，做描边绘制效果）
  const latLngs: L.LatLngExpression[] = sortedTrips.map(t => [t.lat!, t.lng!])
  buildAnimatedPath(latLngs)

  // 启动绘制动画
  startPathDrawAnimation()
}

function buildAnimatedPath(latLngs: L.LatLngExpression[]) {
  if (!map || latLngs.length < 2) {
    animatedPathD.value = ''
    return
  }

  const containerSize = map.getSize()
  const w = Math.max(containerSize.x, 100)
  const h = Math.max(containerSize.y, 100)

  // 将经纬度转换为容器像素坐标
  const points = latLngs.map(ll => {
    const p = map!.latLngToContainerPoint(ll as L.LatLng)
    return [p.x, p.y] as [number, number]
  })

  // 构建 viewBox 匹配容器实际尺寸
  svgViewBox.value = '0 0 ' + w + ' ' + h

  // 构建贝塞尔曲线 path
  let d = 'M ' + points[0][0].toFixed(1) + ',' + points[0][1].toFixed(1)
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]
    const curr = points[i]
    const cpx = (prev[0] + curr[0]) / 2 + (Math.random() - 0.5) * 8
    const cpy = (prev[1] + curr[1]) / 2 + (Math.random() - 0.5) * 8
    d += ' Q ' + cpx.toFixed(1) + ',' + cpy.toFixed(1) + ' ' + curr[0].toFixed(1) + ',' + curr[1].toFixed(1)
  }

  animatedPathD.value = d

  // 计算路径长度用于 dash-offset 动画
  nextTick(() => {
    if (animPathEl.value) {
      const totalLen = animPathEl.value.getTotalLength()
      if (totalLen > 0) {
        pathDashArray.value = totalLen + ' ' + totalLen
        pathDashOffset.value = totalLen
      }
    }
  })
}

function startPathDrawAnimation() {
  stopAnimations()

  pathOpacity.value = 0
  pathDashOffset.value = 99999

  pathAnimTimer = setTimeout(() => {
    pathOpacity.value = 1

    if (animPathEl.value) {
      const totalLen = animPathEl.value.getTotalLength()
      if (totalLen <= 0) return

      pathDashArray.value = totalLen + ' ' + totalLen
      pathDashOffset.value = totalLen

      const startTime = performance.now()
      const duration = 2500

      function animate(now: number) {
        const elapsed = now - startTime
        const progress = Math.min(elapsed / duration, 1)
        const eased = 1 - Math.pow(1 - progress, 3)
        pathDashOffset.value = totalLen * (1 - eased)

        if (progress < 1) {
          animFrameId = requestAnimationFrame(animate)
        } else {
          emit('animation-complete')
        }
      }
      animFrameId = requestAnimationFrame(animate)
    }
  }, 800)
}

// ==========================================
// 移动标记回放
// ==========================================
function startMoveAlong(fromIndex: number, toIndex: number) {
  stopMoveAlong()

  const sortedTrips = [...props.trips]
    .filter(t => t.lat != null && t.lng != null)
    .sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''))

  if (sortedTrips.length < 2) return

  const endIdx = toIndex >= 0 ? Math.min(toIndex, sortedTrips.length - 1) : sortedTrips.length - 1
  if (fromIndex >= endIdx) return

  showMovingMarker.value = true

  const pathPoints: Array<[number, number]> = []
  for (let i = fromIndex; i <= endIdx; i++) {
    const t = sortedTrips[i]
    if (i === fromIndex) {
      pathPoints.push([t.lat!, t.lng!])
    } else {
      const prev = sortedTrips[i - 1]
      for (let step = 1; step <= 30; step++) {
        const ratio = step / 30
        pathPoints.push([
          prev.lat! + (t.lat! - prev.lat!) * ratio,
          prev.lng! + (t.lng! - prev.lng!) * ratio,
        ])
      }
    }
  }

  let pointIdx = 0
  const startTime = performance.now()
  const msPerPoint = 35

  function moveStep(now: number) {
    if (!props.playing) {
      moveAlongAnimId = requestAnimationFrame(moveStep)
      return
    }

    const elapsed = now - startTime
    pointIdx = Math.min(Math.floor(elapsed / msPerPoint), pathPoints.length - 1)

    if (pointIdx >= pathPoints.length - 1) {
      updateMovingMarkerPos(pathPoints[pathPoints.length - 1])
      showMovingMarker.value = false
      return
    }

    updateMovingMarkerPos(pathPoints[pointIdx])
    moveAlongAnimId = requestAnimationFrame(moveStep)
  }

  moveAlongAnimId = requestAnimationFrame(moveStep)
}

function updateMovingMarkerPos(latlng: [number, number]) {
  if (!map) return
  const point = map.latLngToContainerPoint(L.latLng(latlng[0], latlng[1]))
  movingMarkerStyle.value = {
    left: point.x + 'px',
    top: point.y + 'px',
  }
}

// ==========================================
// 工具方法
// ==========================================
// 默认聚焦第一个起点由 focusFirstPoint() 负责

function focusTrip(id: string) {
  const idx = props.trips.findIndex(t => t.id === id)
  if (idx === -1 || !map) return
  const trip = props.trips[idx]
  if (trip.lat != null && trip.lng != null) {
    map.flyTo([trip.lat, trip.lng], Math.max(map.getZoom(), 7), { duration: 0.8 })
  }
}

function stopAnimations() {
  if (animFrameId !== null) {
    cancelAnimationFrame(animFrameId)
    animFrameId = null
  }
  if (pathAnimTimer !== null) {
    clearTimeout(pathAnimTimer)
    pathAnimTimer = null
  }
}

function stopMoveAlong() {
  if (moveAlongAnimId !== null) {
    cancelAnimationFrame(moveAlongAnimId)
    moveAlongAnimId = null
  }
}

// ==========================================
// Watchers — 不使用 immediate，等 onMounted 后再渲染
// ==========================================
watch(
  () => props.trips.map((t) => t.id + ':' + t.lat + ':' + t.lng).join('|'),
  () => {
    if (mapReady) {
      renderMarkers()
      renderTransportIcons()
      renderRoute()
      renderPaths()
    }
  }
)

watch(() => props.selectedId, (id) => {
  if (id) focusTrip(id)
})

watch(() => props.playing, (playing) => {
  if (playing) {
    startMoveAlong(props.currentIndex || 0, -1)
  } else {
    stopMoveAlong()
  }
})

watch(() => props.currentIndex, (idx) => {
  if (props.playing && idx !== undefined && idx >= 0) {
    startMoveAlong(idx, -1)
  }
})

// ==========================================
// Lifecycle
// ==========================================
onMounted(() => {
  initMap()
  if (map) {
    map.on('resize', () => {
      if (props.trips.length >= 2) {
        const sorted = [...props.trips]
          .filter(t => t.lat != null && t.lng != null)
          .sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''))
        if (sorted.length >= 2) {
          buildAnimatedPath(sorted.map(t => [t.lat!, t.lng!] as L.LatLngExpression))
        }
      }
    })
  }
})

onUnmounted(() => {
  stopAnimations()
  stopMoveAlong()
  if (map) {
    map.remove()
    map = null
  }
})
</script>

<style scoped>
.travel-map {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
}

/* SVG 动画层 — 覆盖在 Leaflet tile 之上，marker 之下 */
.path-anim-layer {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 450;
}

/* 移动标记 */
.moving-marker {
  position: absolute;
  transform: translate(-50%, -100%);
  z-index: 650;
  pointer-events: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  transition: left 0.05s linear, top 0.05s linear;
}

.moving-marker-icon {
  font-size: 22px;
  filter: drop-shadow(0 2px 3px rgba(0,0,0,0.3));
  animation: bounce 0.6s ease-in-out infinite alternate;
}

.moving-marker-pulse {
  position: absolute;
  bottom: -4px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--accent, #d9744f);
  opacity: 0.4;
  animation: pulse-ring 1.2s ease-out infinite;
}

@keyframes bounce {
  from { transform: translateY(0); }
  to { transform: translateY(-6px); }
}

@keyframes pulse-ring {
  0% { transform: scale(1); opacity: 0.4; }
  100% { transform: scale(2.5); opacity: 0; }
}
</style>

<style>
.hd-marker-container {
  background: transparent !important;
  border: none !important;
  overflow: visible !important;
}
</style>
