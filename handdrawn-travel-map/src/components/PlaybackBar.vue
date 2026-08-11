<template>
  <div class="playback-bar">
    <div class="playback-left">
      <button class="play-btn" :title="playing ? '暂停' : '播放'" @click="playing ? $emit('pause') : $emit('play')">
        <span v-if="playing">⏸</span>
        <span v-else>▶</span>
      </button>
      <button class="nav-btn" title="上一站" @click="$emit('prev')">⏮</button>
      <button class="nav-btn" title="下一站" @click="$emit('next')">⏭</button>
    </div>

    <div class="playback-center">
      <div class="progress-dots">
        <button
          v-for="(_, i) in total"
          :key="i"
          class="progress-dot"
          :class="{ 'progress-dot--active': i === current }"
          :title="`第 ${i + 1} 站`"
          @click="$emit('seek', i)"
        ></button>
      </div>
    </div>

    <div class="playback-right">
      <span class="page-info">第 {{ current + 1 }} / 共 {{ total }} 站</span>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  total: number
  current: number
  playing: boolean
}>()

defineEmits<{
  play: []
  pause: []
  seek: [index: number]
  prev: []
  next: []
}>()
</script>

<style scoped>
.playback-bar {
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  background: var(--paper-light);
  border-top: 2px solid var(--ink-soft);
  z-index: var(--z-panel);
  gap: 16px;
}

.playback-left,
.playback-right {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.playback-center {
  flex: 1;
  display: flex;
  justify-content: center;
}

.play-btn,
.nav-btn {
  width: 34px;
  height: 34px;
  border: 1.5px solid var(--ink-soft);
  border-radius: 10px 7px 11px 9px;
  background: var(--paper);
  cursor: pointer;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.play-btn:hover,
.nav-btn:hover {
  background: var(--paper-dark);
  border-color: var(--ink);
  transform: translateY(-1px);
}

.progress-dots {
  display: flex;
  align-items: center;
  gap: 8px;
}

.progress-dot {
  width: 10px;
  height: 10px;
  border: 1.5px solid var(--ink-light);
  border-radius: 50%;
  background: transparent;
  cursor: pointer;
  padding: 0;
  transition: all 0.2s ease;
}

.progress-dot:hover {
  border-color: var(--accent);
  transform: scale(1.25);
}

.progress-dot--active {
  background: var(--accent);
  border-color: var(--accent);
  transform: scale(1.3);
  box-shadow: 0 0 0 3px rgba(217, 116, 79, 0.25);
}

.page-info {
  font-family: 'Caveat', cursive;
  font-size: 16px;
  font-weight: 700;
  color: var(--ink-soft);
}
</style>
