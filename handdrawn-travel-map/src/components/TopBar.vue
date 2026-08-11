<template>
  <div class="topbar">
    <div class="topbar-left">
      <span class="topbar-brand font-display">行迹</span>
      <span class="topbar-sep">·</span>
      <h2 class="topbar-title">{{ title }}</h2>
    </div>
    <div class="topbar-right">
      <button class="topbar-new" @click="$emit('new-map')">✎ 新地图</button>
      <span class="topbar-count">{{ stopCount }} 站</span>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  title: string
  stopCount?: number
}>()

defineEmits<{
  'new-map': []
}>()
</script>

<style scoped>
.topbar {
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  background: var(--paper-light);
  border-bottom: 2px solid var(--ink-soft);
  z-index: var(--z-topbar);
  position: relative;
}

.topbar-left {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.topbar-brand {
  font-size: 24px;
  font-weight: 700;
  color: var(--accent);
  letter-spacing: 2px;
}

.topbar-sep {
  color: var(--ink-light);
  font-size: 16px;
}

.topbar-title {
  font-size: 17px;
  color: var(--ink);
  font-weight: 500;
}

.topbar-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.topbar-new {
  font-family: var(--font-body);
  font-size: 13px;
  color: var(--accent);
  padding: 4px 12px;
  border: 1.5px solid var(--accent);
  border-radius: 10px 7px 12px 9px;
  background: transparent;
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease;
}

.topbar-new:hover {
  background: var(--accent);
  color: var(--paper-light);
}

.topbar-count {
  font-size: 13px;
  color: var(--ink-soft);
  padding: 3px 12px;
  border: 1.5px solid var(--ink-light);
  border-radius: 10px 7px 12px 9px;
  background: var(--paper);
}
</style>
