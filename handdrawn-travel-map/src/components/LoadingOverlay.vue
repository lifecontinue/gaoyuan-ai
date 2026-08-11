<template>
  <Transition name="loading-fade">
    <div v-if="visible" class="loading-overlay">
      <div class="loading-content">
        <!-- 手绘罗盘动画 -->
        <div class="compass-wrapper">
          <svg class="compass-svg" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
            <!-- 外圈（虚线，逐步描绘效果） -->
            <circle
              cx="60" cy="60" r="50"
              fill="none"
              stroke="#3a3226"
              stroke-width="1.5"
              stroke-dasharray="4 3"
              class="compass-ring compass-ring--outer"
            />
            <!-- 内圈 -->
            <circle
              cx="60" cy="60" r="35"
              fill="none"
              stroke="#d9744f"
              stroke-width="2"
              stroke-dasharray="6 4"
              class="compass-ring compass-ring--inner"
            />
            <!-- 指针 -->
            <g class="compass-needle">
              <polygon points="60,18 55,60 60,55 65,60" fill="#d9744f" />
              <polygon points="60,102 55,60 60,65 65,60" fill="#6b5d49" />
              <circle cx="60" cy="60" r="4" fill="#3a3226" />
            </g>
            <!-- 方位标记 -->
            <text x="60" y="12" text-anchor="middle" font-family="Caveat, cursive" font-size="11" fill="#3a3226" class="compass-label">N</text>
            <text x="112" y="64" text-anchor="middle" font-family="Caveat, cursive" font-size="11" fill="#3a3226" class="compass-label">E</text>
            <text x="60" y="115" text-anchor="middle" font-family="Caveat, cursive" font-size="11" fill="#3a3226" class="compass-label">S</text>
            <text x="8" y="64" text-anchor="middle" font-family="Caveat, cursive" font-size="11" fill="#3a3226" class="compass-label">W</text>
          </svg>
        </div>

        <!-- 文案 -->
        <div class="loading-text">
          <h2 class="loading-title font-display">正在绘制你的旅行地图…</h2>
          <p class="loading-desc">{{ progressText }}</p>
        </div>

        <!-- 进度条 -->
        <div class="loading-bar-wrap">
          <div class="loading-bar-track">
            <div
              class="loading-bar-fill"
              :style="{ width: `${progress * 100}%` }"
            ></div>
          </div>
          <span class="loading-percent">{{ Math.round(progress * 100) }}%</span>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  visible: boolean
  progress: number
}>()

const progressText = computed(() => {
  const p = props.progress
  if (p < 0.3) return '读取你的旅行故事…'
  if (p < 0.6) return '标记去过的地方…'
  if (p < 0.9) return '绘制路线与风景…'
  return '即将完成…'
})
</script>

<style scoped>
.loading-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-loading);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--paper);
}

.loading-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 28px;
  padding: 40px;
}

.compass-wrapper {
  width: 120px;
  height: 120px;
}

.compass-svg {
  width: 100%;
  height: 100%;
  animation: compass-spin 8s linear infinite;
}

@keyframes compass-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.compass-ring--outer {
  animation: dash-move 20s linear infinite;
}
.compass-ring--inner {
  animation: dash-move 15s linear infinite reverse;
}

@keyframes dash-move {
  to { stroke-dashoffset: -100; }
}

.compass-needle {
  transform-origin: 60px 60px;
  animation: needle-swing 3s ease-in-out infinite;
}

@keyframes needle-swing {
  0%, 100% { transform: rotate(0deg); }
  25% { transform: rotate(6deg); }
  75% { transform: rotate(-6deg); }
}

.compass-label {
  animation: counter-spin 8s linear infinite;
}

@keyframes counter-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(-360deg); }
}

.loading-text {
  text-align: center;
}

.loading-title {
  font-size: 26px;
  color: var(--ink);
  margin-bottom: 6px;
}

.loading-desc {
  font-size: 14px;
  color: var(--ink-soft);
}

.loading-bar-wrap {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 280px;
}

.loading-bar-track {
  flex: 1;
  height: 8px;
  background: var(--paper-dark);
  border: 1.5px solid var(--ink-soft);
  border-radius: 6px 4px 7px 5px;
  overflow: hidden;
}

.loading-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #d9744f, #e0a93b);
  border-radius: 4px 2px 5px 3px;
  transition: width 0.4s ease;
}

.loading-percent {
  font-family: 'Caveat', cursive;
  font-size: 18px;
  font-weight: 700;
  color: var(--accent);
  min-width: 36px;
  text-align: right;
}

/* 过渡动画 */
.loading-fade-enter-active,
.loading-fade-leave-active {
  transition: opacity 0.6s ease;
}
.loading-fade-enter-from,
.loading-fade-leave-to {
  opacity: 0;
}
</style>
