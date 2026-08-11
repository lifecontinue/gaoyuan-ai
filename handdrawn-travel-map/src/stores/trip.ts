/**
 * 行程 / 解析核心状态管理
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Trip, AudioMemo, ParseResult, ParseStatus } from '@/types/travel'

export const useTripStore = defineStore('trip', () => {
  // --- State ---
  const rawText = ref('')
  const parseStatus = ref<ParseStatus>('idle')
  const trips = ref<Trip[]>([])
  const selectedId = ref<string | null>(null)
  const parseError = ref<string | null>(null)
  const title = ref('')

  // --- Getters ---
  /** 按时间排序的行程列表 */
  const orderedTrips = computed(() => {
    return [...trips.value].sort((a, b) => {
      if (!a.startDate) return 1
      if (!b.startDate) return -1
      return a.startDate.localeCompare(b.startDate)
    })
  })

  /** 已有坐标的行程（用于地图渲染） */
  const tripsWithCoords = computed(() => {
    return orderedTrips.value.filter(t => t.lat != null && t.lng != null)
  })

  /** 当前选中项的索引 */
  const currentIndex = computed(() => {
    if (!selectedId.value) return -1
    return tripsWithCoords.value.findIndex(t => t.id === selectedId.value)
  })

  // --- Actions ---
  function setText(t: string) {
    rawText.value = t
  }

  function setParsing() {
    parseStatus.value = 'parsing'
    parseError.value = null
  }

  function setParsed(result: ParseResult) {
    parseStatus.value = 'parsed'
    trips.value = result.trips
    title.value = result.title
    selectedId.value = null
  }

  function setGeocoded(id: string, lat: number, lng: number, src: Trip['geoSource']) {
    const trip = trips.value.find(t => t.id === id)
    if (trip) {
      trip.lat = lat
      trip.lng = lng
      trip.geoSource = src
    }
  }

  function selectTrip(id: string) {
    selectedId.value = id
  }

  function updateTrip(id: string, patch: Partial<Trip>) {
    const trip = trips.value.find(t => t.id === id)
    if (trip) Object.assign(trip, patch)
  }

  /** 追加用户上传图片，总量（AI 图 + 上传图）上限 9 张 */
  function addImages(id: string, newImages: string[]) {
    const trip = trips.value.find(t => t.id === id)
    if (!trip || newImages.length === 0) return
    const aiCount = trip.imageUrl ? 1 : 0
    const existing = trip.images || []
    const slots = 9 - aiCount - existing.length
    if (slots <= 0) return
    trip.images = [...existing, ...newImages.slice(0, slots)]
  }

  /** 直接设置上传图片数组 */
  function setImages(id: string, images: string[]) {
    const trip = trips.value.find(t => t.id === id)
    if (trip) trip.images = images
  }

  /** 追加一条语音记忆 */
  function addAudio(id: string, memo: AudioMemo) {
    const trip = trips.value.find(t => t.id === id)
    if (!trip) return
    if (!trip.audios) trip.audios = []
    trip.audios.push(memo)
  }

  /** 删除指定索引的语音记忆 */
  function removeAudio(id: string, index: number) {
    const trip = trips.value.find(t => t.id === id)
    if (!trip || !trip.audios) return
    trip.audios.splice(index, 1)
  }

  function setError(msg: string) {
    parseStatus.value = 'error'
    parseError.value = msg
  }

  function reset() {
    rawText.value = ''
    parseStatus.value = 'idle'
    trips.value = []
    selectedId.value = null
    parseError.value = null
    title.value = ''
  }

  return {
    // state
    rawText,
    parseStatus,
    trips,
    selectedId,
    parseError,
    title,
    // getters
    orderedTrips,
    tripsWithCoords,
    currentIndex,
    // actions
    setText,
    setParsing,
    setParsed,
    setGeocoded,
    selectTrip,
    updateTrip,
    addImages,
    setImages,
    addAudio,
    removeAudio,
    setError,
    reset,
  }
})
