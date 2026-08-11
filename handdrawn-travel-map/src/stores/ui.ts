/**
 * UI 状态管理（加载、面板、播放、弹窗）
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { AppStage, PlaybackState } from '@/types/travel'

export const useUIStore = defineStore('ui', () => {
  // --- State ---
  const stage = ref<AppStage>('input')
  const loadingProgress = ref(0)
  const panelOpen = ref(true)
  const popupOpen = ref(false)
  const playback = ref<PlaybackState>({ current: 0, playing: false })
  const viewMode = ref('self')
  /** 沉浸式天气记忆：null 表示退出；否则记录当前进入的地点 id */
  const immersive = ref<{ tripId: string } | null>(null)

  // --- Actions ---
  function setStage(s: AppStage) {
    stage.value = s
  }

  function setProgress(p: number) {
    loadingProgress.value = Math.min(1, Math.max(0, p))
  }

  function togglePanel() {
    panelOpen.value = !panelOpen.value
  }

  function openPopup() {
    popupOpen.value = true
  }

  function closePopup() {
    popupOpen.value = false
  }

  function play() {
    playback.value.playing = true
  }

  function pause() {
    playback.value.playing = false
  }

  function seek(i: number) {
    playback.value.current = i
  }

  function setMode(mode: string) {
    viewMode.value = mode
  }

  /** 进入某地点的沉浸式天气记忆 */
  function enterWeather(tripId: string) {
    immersive.value = { tripId }
  }

  /** 退出沉浸式天气记忆 */
  function exitWeather() {
    immersive.value = null
  }

  return {
    // state
    stage,
    loadingProgress,
    panelOpen,
    popupOpen,
    playback,
    viewMode,
    immersive,
    // actions
    setStage,
    setProgress,
    togglePanel,
    openPopup,
    closePopup,
    play,
    pause,
    seek,
    setMode,
    enterWeather,
    exitWeather,
  }
})
