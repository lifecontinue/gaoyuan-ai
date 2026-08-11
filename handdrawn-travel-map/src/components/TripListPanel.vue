<template>
  <div class="nav-panel" :class="{ 'nav-panel--collapsed': !open }">
    <!-- 标题区 -->
    <div class="nav-header">
      <div class="nav-header-rod"></div>
      <h3 v-if="open" class="nav-title font-display">行迹录</h3>
      <span v-else class="nav-title-collapsed font-display">行</span>
      <button class="nav-toggle" @click="$emit('toggle')" :title="open ? '收起' : '展开'">
        <span class="toggle-icon">{{ open ? '◀' : '▶' }}</span>
      </button>
    </div>

    <!-- 可折叠行程概览 -->
    <div v-if="open && trips.length > 0" class="nav-intro" :class="{ 'nav-intro--expanded': introExpanded }" @click="introExpanded = !introExpanded">
      <div class="nav-intro__label font-display">{{ title || '我的旅行' }}</div>
      <div class="nav-intro__summary">{{ summaryLine }}</div>
      <div class="nav-intro__detail">{{ detailLine }}</div>
    </div>

    <!-- 导航项列表（展开/折叠均渲染，折叠时仅图标 + tooltip） -->
    <div class="nav-body">
      <NavItem
        v-for="(trip, index) in trips"
        :key="trip.id"
        :icon="trip.emoji || '📍'"
        :title="trip.place"
        :subtitle="dateSubtitle(trip)"
        :active="selectedId === trip.id"
        :collapsed="!open"
        :index="index"
        @select="$emit('select', trip.id)"
      />

      <div v-if="trips.length === 0" class="nav-empty">
        <span class="nav-empty-text">尚未记录行迹</span>
      </div>
    </div>

    <!-- 当前站点卡片：切换导航时的内容过渡 -->
    <div v-if="open && selectedTrip" class="nav-now">
      <Transition name="now-fade" mode="out-in">
        <div :key="selectedId || ''" class="nav-now__inner">
          <span class="nav-now__emoji">{{ selectedTrip.emoji || '📍' }}</span>
          <div class="nav-now__meta">
            <div class="nav-now__place">{{ selectedTrip.place }}</div>
            <div class="nav-now__date">{{ dateSubtitle(selectedTrip) }}</div>
          </div>
        </div>
      </Transition>
    </div>

    <!-- 底部印章 -->
    <div v-if="open && trips.length > 0" class="nav-footer">
      <div class="nav-seal">
        <span class="seal-text">{{ trips.length }}</span>
        <span class="seal-label">站</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import NavItem from './NavItem.vue'
import type { Trip } from '@/types/travel'

const props = defineProps<{
  trips: Trip[]
  selectedId: string | null
  open: boolean
  title?: string
}>()

defineEmits<{
  select: [id: string]
  toggle: []
}>()

const introExpanded = ref(false)

const first = computed(() => props.trips[0])
const last = computed(() => props.trips[props.trips.length - 1])
const selectedTrip = computed(() => props.trips.find((t) => t.id === props.selectedId) || null)

const summaryLine = computed(() => {
  if (!first.value) return ''
  const f = first.value
  const l = last.value
  const range = f.startDate && l?.endDate ? ` · ${f.startDate} – ${l.endDate}` : (f.startDate ? ` · ${f.startDate}` : '')
  const to = l && l.place !== f.place ? `至 ${l.place}` : ''
  return `共 ${props.trips.length} 站 · 自 ${f.place} ${to}${range}`
})

const detailLine = computed(() => {
  if (!first.value) return ''
  const f = first.value
  const l = last.value
  const head = f.story ? f.story.slice(0, 48) + (f.story.length > 48 ? '…' : '') : (f.summary || '')
  const tail = l && l.place !== f.place ? ` 终抵 ${l.place}。` : ''
  return (head + tail).trim()
})

function dateSubtitle(trip: Trip): string {
  if (trip.startDate && trip.endDate) return `${trip.startDate} ~ ${trip.endDate}`
  return trip.startDate || ''
}
</script>

<style scoped>
.nav-panel {
  width: 260px;
  min-width: 260px;
  height: 100%;
  background: linear-gradient(180deg, rgba(250, 243, 224, 0.92), rgba(244, 236, 216, 0.86));
  -webkit-backdrop-filter: blur(20px) saturate(160%);
  backdrop-filter: blur(20px) saturate(160%);
  border-right: 1px solid rgba(58, 50, 38, 0.08);
  box-shadow: 1px 0 0 rgba(255, 255, 255, 0.5), 6px 0 24px rgba(58, 50, 38, 0.06);
  display: flex;
  flex-direction: column;
  z-index: var(--z-panel);
  transition: width 0.32s cubic-bezier(0.22, 1, 0.36, 1), min-width 0.32s cubic-bezier(0.22, 1, 0.36, 1);
  position: relative;
  overflow: hidden;
}

/* 顶部装饰条 */
.nav-panel::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: linear-gradient(90deg, var(--accent), var(--palette-2), var(--accent));
  opacity: 0.6;
  z-index: 2;
}

.nav-panel--collapsed {
  width: 60px;
  min-width: 60px;
  overflow: visible; /* 允许折叠态 tooltip 溢出到地图区 */
}

.nav-panel--collapsed .nav-header {
  padding: 16px 8px;
  justify-content: center;
  flex-direction: column;
  gap: 6px;
}

.nav-panel--collapsed .nav-header-rod {
  display: none;
}

.nav-panel--collapsed .nav-toggle {
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
}

.nav-title-collapsed {
  font-size: 16px;
  color: var(--ink);
  writing-mode: vertical-rl;
  text-orientation: upright;
  letter-spacing: 4px;
  line-height: 1.2;
}

/* 标题区 */
.nav-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px 14px 14px;
  border-bottom: 1.5px solid rgba(58, 50, 38, 0.1);
  flex-shrink: 0;
  position: relative;
}

.nav-header-rod {
  width: 4px;
  height: 20px;
  background: var(--accent);
  border-radius: 2px;
  flex-shrink: 0;
  box-shadow: 1px 0 0 rgba(217, 116, 79, 0.3);
}

.nav-title {
  font-size: 19px;
  color: var(--ink);
  flex: 1;
  letter-spacing: 1px;
}

.nav-toggle {
  width: 28px;
  height: 28px;
  border: 1.5px solid var(--ink-soft);
  border-radius: 8px 5px 9px 7px;
  background: transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}
.nav-toggle:hover {
  background: rgba(255, 255, 255, 0.6);
  color: var(--ink);
}
.toggle-icon {
  font-size: 11px;
  color: var(--ink-soft);
}

/* 列表区域 */
.nav-body {
  flex: 1;
  overflow-y: auto;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

/* 折叠态列表：窄列居中 */
.nav-panel--collapsed .nav-body {
  padding: 10px 9px;
  align-items: center;
}
.nav-panel--collapsed .nav-item {
  width: 42px;
}

/* ==========================================
   可折叠行程概览
   ========================================== */
.nav-intro {
  margin: 10px 12px 4px;
  padding: 10px 12px 12px;
  border: 1.5px solid rgba(58, 50, 38, 0.12);
  border-radius: 12px 8px 14px 10px / 8px 14px 10px 12px;
  background: rgba(255, 255, 255, 0.45);
  cursor: pointer;
  position: relative;
  overflow: hidden;
  transition: border-color 0.2s ease;
}
.nav-intro:hover {
  border-color: rgba(217, 116, 79, 0.35);
}
.nav-intro__label {
  font-size: 16px;
  color: var(--accent);
  letter-spacing: 1px;
  margin-bottom: 3px;
}
.nav-intro__summary {
  font-family: var(--font-serif, var(--font-body));
  font-size: 12.5px;
  color: var(--ink-soft);
  line-height: 1.5;
}
.nav-intro__detail {
  font-family: var(--font-serif, var(--font-body));
  font-size: 12px;
  color: var(--ink-light);
  line-height: 1.55;
  max-height: 0;
  opacity: 0;
  overflow: hidden;
  transition: max-height 0.25s ease, opacity 0.25s ease, margin-top 0.25s ease;
}
.nav-intro--expanded .nav-intro__detail {
  max-height: 120px;
  opacity: 1;
  margin-top: 6px;
}
.nav-intro:not(.nav-intro--expanded)::after {
  content: '…展开';
  position: absolute;
  right: 12px;
  bottom: 6px;
  font-size: 11px;
  color: var(--accent);
  background: var(--paper-light);
  padding-left: 6px;
}

/* ==========================================
   当前站点卡片（切换过渡）
   ========================================== */
.nav-now {
  padding: 8px 12px 4px;
  flex-shrink: 0;
}
.nav-now__inner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 12px;
  background: linear-gradient(135deg, rgba(217, 116, 79, 0.12), rgba(224, 169, 59, 0.08));
  border: 1px solid rgba(217, 116, 79, 0.18);
}
.nav-now__emoji {
  font-size: 20px;
}
.nav-now__meta {
  min-width: 0;
}
.nav-now__place {
  font-size: 13.5px;
  font-weight: 700;
  color: var(--accent);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.nav-now__date {
  font-size: 11px;
  color: var(--ink-soft);
}

.now-fade-enter-active,
.now-fade-leave-active {
  transition: opacity 0.28s ease, transform 0.28s cubic-bezier(0.22, 1, 0.36, 1);
}
.now-fade-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
.now-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

/* 底部印章 */
.nav-footer {
  padding: 12px 16px;
  border-top: 1.5px solid rgba(58, 50, 38, 0.1);
  display: flex;
  justify-content: center;
  flex-shrink: 0;
}
.nav-seal {
  display: flex;
  align-items: baseline;
  gap: 4px;
  padding: 4px 14px;
  border: 2px solid #c5402f;
  border-radius: 4px;
  background: rgba(197, 64, 47, 0.05);
  transform: rotate(-2deg);
}
.seal-text {
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 700;
  color: #c5402f;
}
.seal-label {
  font-size: 12px;
  color: #c5402f;
  opacity: 0.8;
}

.nav-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
}
.nav-empty-text {
  font-size: 13px;
  color: var(--ink-light);
}
</style>
