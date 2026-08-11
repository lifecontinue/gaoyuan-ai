<template>
  <div class="app-root">
    <!-- 隐藏的 SVG filter 定义 -->
    <div v-html="filterSvg" style="position:absolute;width:0;height:0;overflow:hidden"></div>

    <!-- 舞台：普通界面；沉浸式天气时整体推近 + 虚化 -->
    <div class="stage" :class="{ 'stage--immersive': !!ui.immersive }">
      <!-- 顶栏 -->
      <TopBar
        v-if="ui.stage !== 'input'"
        :title="trip.title || '我的旅行地图'"
        :stop-count="trip.tripsWithCoords.length"
        @new-map="startNewMap"
      />

      <!-- 阶段1：输入界面 -->
      <InputStage
        v-if="ui.stage === 'input'"
        v-model="trip.rawText"
        :loading="trip.parseStatus === 'parsing'"
        :error="trip.parseError"
        @submit="handleSubmit"
      />

      <!-- 阶段2：Loading -->
      <LoadingOverlay
        v-if="ui.stage === 'loading'"
        :visible="true"
        :progress="ui.loadingProgress"
      />

      <!-- 阶段3：主地图界面 -->
      <template v-if="ui.stage === 'map'">
        <div class="main-layout">
          <!-- 左侧导航栏 -->
          <TripListPanel
            :trips="trip.orderedTrips"
            :selected-id="trip.selectedId"
            :open="ui.panelOpen"
            :title="trip.title"
            @select="onSelectCard"
            @toggle="uiStore.togglePanel"
          />

          <!-- 地图区域 -->
          <div class="map-area">
            <TravelMap
              :trips="trip.tripsWithCoords"
              :selected-id="trip.selectedId"
              view-mode="self"
              :playing="ui.playback.playing"
              :current-index="trip.currentIndex"
              @marker-click="(id: string) => tripStore.selectTrip(id)"
              @ready="onMapReady"
            />

            <!-- 顶部路线概览条（参考 TrailPaint story-tabs） -->
            <RouteTabs
              v-if="trip.tripsWithCoords.length > 0"
              :trips="trip.tripsWithCoords"
              :selected-id="trip.selectedId"
              :current-index="trip.currentIndex"
              @select="(id: string) => tripStore.selectTrip(id)"
            />
          </div>
        </div>

        <!-- 底部播放控制栏 -->
        <PlaybackBar
          :total="trip.tripsWithCoords.length"
          :current="trip.currentIndex"
          :playing="ui.playback.playing"
          @play="uiStore.play"
          @pause="uiStore.pause"
          @seek="(i: number) => { uiStore.seek(i); tripStore.selectTrip(trip.tripsWithCoords[i]?.id || '') }"
          @prev="prevStop"
          @next="nextStop"
        />
      </template>
    </div>

    <!-- 沉浸式天气记忆层 -->
    <WeatherAmbience />
  </div>
</template>

<script setup lang="ts">
import TopBar from './components/TopBar.vue'
import InputStage from './components/InputStage.vue'
import LoadingOverlay from './components/LoadingOverlay.vue'
import TravelMap from './components/TravelMap.vue'
import TripListPanel from './components/TripListPanel.vue'
import RouteTabs from './components/RouteTabs.vue'
import PlaybackBar from './components/PlaybackBar.vue'
import WeatherAmbience from './components/WeatherAmbience.vue'
import { onMounted, onBeforeUnmount } from 'vue'
import { useTripStore } from './stores/trip'
import { useUIStore } from './stores/ui'
import { parseTrip } from './api/tripParser'
import { geocodePlace } from './api/geocoder'
import { sampleResult, sampleCoords } from './data/sampleTrip'
import filterSvg from './assets/filters.svg?raw'

const tripStore = useTripStore()
const uiStore = useUIStore()
const trip = tripStore
const ui = uiStore

// 线上预览：生产环境下若尚无数据，自动加载示例行程，让地图一打开就铺满标记
onMounted(() => {
  if (import.meta.env.PROD && trip.trips.length === 0) {
    tripStore.setParsed(sampleResult)
    for (const t of trip.trips) {
      const c = sampleCoords[t.id]
      if (c) tripStore.setGeocoded(t.id, c.lat, c.lng, 'manual')
    }
    uiStore.setStage('map')
  }
  window.addEventListener('enter-weather', onEnterWeatherEvent)
})

onBeforeUnmount(() => {
  window.removeEventListener('enter-weather', onEnterWeatherEvent)
})

/** 点击侧栏记忆卡片：选中并进入沉浸式天气 */
function onSelectCard(id: string) {
  tripStore.selectTrip(id)
  uiStore.enterWeather(id)
}

/** 浮窗「进入此刻记忆」按钮 → window 事件 */
function onEnterWeatherEvent(e: Event) {
  const id = (e as CustomEvent<string>).detail
  if (id) {
    tripStore.selectTrip(id)
    uiStore.enterWeather(id)
  }
}

function startNewMap() {
  tripStore.reset()
  uiStore.setStage('input')
}

async function handleSubmit(text: string) {
  if (!text.trim()) return

  tripStore.setText(text)
  tripStore.setParsing()

  try {
    const result = await parseTrip(text)

    if (result.trips.length === 0) {
      tripStore.setError('没太看懂你的行程描述，换个说法试试？')
      return
    }

    tripStore.setParsed(result)
    uiStore.setStage('loading')

    await runGeocoding(result.trips)

    uiStore.setStage('map')
  } catch (e) {
    console.error('Parse error:', e)
    tripStore.setError('解析出错了，请重试')
  }
}

async function runGeocoding(trips: import('./types/travel').Trip[]) {
  const total = Math.max(1, trips.length)
  for (let i = 0; i < trips.length; i++) {
    const t = trips[i]
    const [geoResult, imgResult] = await Promise.all([
      geocodePlace(t.place, { city: t.city, country: t.country }),
      preloadImage(t.imageQuery || t.place),
    ])
    tripStore.setGeocoded(t.id, geoResult.lat, geoResult.lng, geoResult.source)
    if (imgResult.imageUrl) {
      tripStore.updateTrip(t.id, { imageUrl: imgResult.imageUrl })
    }
    uiStore.setProgress((i + 1) / total)
    await new Promise(res => setTimeout(res, 300))
  }
  await new Promise(res => setTimeout(res, 800))
}

async function preloadImage(query: string): Promise<{ imageUrl?: string }> {
  try {
    const resp = await fetch('/api/generate-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    })
    if (resp.ok) {
      const d = await resp.json()
      if (d.url) {
        new Image().src = d.url
        return { imageUrl: d.url }
      }
    }
  } catch (e) {
    console.warn('[preloadImage] unavailable', e)
  }
  return {}
}

function onMapReady() {}

function prevStop() {
  const idx = Math.max(0, trip.currentIndex - 1)
  uiStore.seek(idx)
  if (trip.tripsWithCoords[idx]) {
    tripStore.selectTrip(trip.tripsWithCoords[idx].id)
  }
}

function nextStop() {
  const idx = Math.min(trip.tripsWithCoords.length - 1, trip.currentIndex + 1)
  uiStore.seek(idx)
  if (trip.tripsWithCoords[idx]) {
    tripStore.selectTrip(trip.tripsWithCoords[idx].id)
  }
}
</script>

<style scoped>
.app-root {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
}

.main-layout {
  display: flex;
  width: 100%;
  height: calc(100% - 52px);
  position: relative;
}

.map-area {
  flex: 1;
  position: relative;
  overflow: hidden;
}

/* 沉浸式天气：舞台推近 + 轻微虚化，制造"进入记忆"的镜头感 */
.stage {
  width: 100%;
  height: 100%;
  position: relative;
  transform-origin: 50% 46%;
  transition: transform 0.9s cubic-bezier(0.22, 1, 0.36, 1), filter 0.9s ease;
}
.stage--immersive {
  transform: scale(1.05);
  filter: blur(2px) brightness(0.92);
}
</style>
