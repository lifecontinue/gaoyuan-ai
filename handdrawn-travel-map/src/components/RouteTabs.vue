<template>
  <div class="route-tabs" ref="tabBar">
    <button
      v-for="(trip, i) in trips"
      :key="trip.id"
      class="route-tab"
      :class="{ 'route-tab--active': trip.id === selectedId }"
      :data-id="trip.id"
      :title="trip.place"
      @click="$emit('select', trip.id)"
    >
      <span class="route-tab__thumb">
        <img v-if="thumbOf(trip)" :src="thumbOf(trip)" :alt="trip.place" />
        <span v-else class="route-tab__emoji">{{ trip.emoji || '📍' }}</span>
        <span class="route-tab__idx">{{ i + 1 }}</span>
      </span>
      <span class="route-tab__name">{{ trip.place }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import type { Trip } from '@/types/travel'

const props = defineProps<{
  trips: Trip[]
  selectedId: string | null
  currentIndex?: number
}>()

defineEmits<{
  select: [id: string]
}>()

const tabBar = ref<HTMLElement | null>(null)

function thumbOf(trip: Trip): string | undefined {
  const list = trip.images && trip.images.length ? trip.images : []
  return list[0] || trip.imageUrl || undefined
}

/** 选中项变化时，将对应 tab 滚入视野（居中） */
function scrollActiveIntoView() {
  const bar = tabBar.value
  if (!bar || !props.selectedId) return
  const el = bar.querySelector<HTMLElement>(`.route-tab[data-id="${props.selectedId}"]`)
  if (el) el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
}

watch(
  () => [props.selectedId, props.currentIndex],
  () => nextTick(scrollActiveIntoView),
  { immediate: true }
)
</script>

<style scoped>
/* ==========================================
   路线概览条 — 参考 TrailPaint story-tabs
   横向可滚动 chip，圆形缩略图 + 地名
   ========================================== */
.route-tabs {
  position: absolute;
  top: 14px;
  left: 14px;
  right: 14px;
  z-index: var(--z-overlay);
  display: flex;
  gap: 8px;
  padding: 8px 10px;
  overflow-x: auto;
  overflow-y: hidden;
  background: rgba(250, 243, 224, 0.92);
  border: 1.5px solid var(--ink-soft);
  border-radius: 14px 10px 16px 12px / 10px 16px 12px 14px;
  box-shadow: 0 3px 12px rgba(58, 50, 38, 0.14);
  backdrop-filter: blur(2px);
  -webkit-overflow-scrolling: touch;
  scrollbar-width: thin;
}

.route-tabs::-webkit-scrollbar {
  height: 5px;
}
.route-tabs::-webkit-scrollbar-thumb {
  background: var(--ink-light);
  border-radius: 3px;
}

.route-tab {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 14px 5px 5px;
  border-radius: 22px;
  border: 1.5px solid var(--paper-dark);
  background: transparent;
  color: var(--ink);
  font-family: var(--font-body);
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
  transition: border-color 0.18s ease, background 0.18s ease, transform 0.18s ease;
}

.route-tab:hover {
  border-color: var(--accent);
  transform: translateY(-1px);
}

.route-tab--active {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

/* 圆形缩略图（照片或 emoji） */
.route-tab__thumb {
  position: relative;
  width: 30px;
  height: 30px;
  min-width: 30px;
  border-radius: 50%;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--paper-dark);
  border: 1.5px solid rgba(255, 255, 255, 0.7);
}

.route-tab--active .route-tab__thumb {
  border-color: #fff;
  box-shadow: 0 0 0 2px rgba(217, 116, 79, 0.4);
}

.route-tab__thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.route-tab__emoji {
  font-size: 15px;
  line-height: 1;
}

/* 编号小角标 */
.route-tab__idx {
  position: absolute;
  right: -3px;
  bottom: -3px;
  min-width: 15px;
  height: 15px;
  padding: 0 3px;
  border-radius: 8px;
  background: var(--ink);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  line-height: 15px;
  text-align: center;
  font-family: var(--font-body);
}

.route-tab--active .route-tab__idx {
  background: #fff;
  color: var(--accent);
}

.route-tab__name {
  font-weight: 500;
  letter-spacing: 0.02em;
}
</style>
