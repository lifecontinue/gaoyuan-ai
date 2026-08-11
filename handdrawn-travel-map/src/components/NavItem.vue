<template>
  <Motion
    class="nav-item"
    :class="{ 'is-active': active, 'is-collapsed': collapsed, 'is-disabled': disabled }"
    as="button"
    type="button"
    :disabled="disabled"
    :initial="{ opacity: 0, x: -18, scale: 0.94 }"
    :animate="{ opacity: 1, x: 0, scale: 1 }"
    :while-hover="disabled ? undefined : { scale: 1.02, transition: { type: 'spring', stiffness: 300, damping: 25 } }"
    :while-press="disabled ? undefined : { scale: 0.98, transition: { type: 'spring', stiffness: 300, damping: 25 } }"
    :transition="{ type: 'spring', stiffness: 300, damping: 25, delay: (index ?? 0) * 0.05 }"
    :style="rootStyle"
    @click="onClick"
    @mousemove="onMove"
  >
    <!-- 玻璃高光层：hover / active 时浮起显现 -->
    <span class="nav-glass" aria-hidden="true"></span>
    <!-- 光标跟随光泽 -->
    <span class="nav-sheen" aria-hidden="true"></span>

    <!-- 图标 -->
    <span class="nav-icon">
      <span class="nav-icon-glyph">{{ icon }}</span>
    </span>

    <!-- 文本 -->
    <span class="nav-text">
      <span class="nav-title">{{ title }}</span>
      <span v-if="subtitle" class="nav-subtitle">{{ subtitle }}</span>
    </span>

    <!-- 激活指示：浮起光点 -->
    <span v-if="active && !collapsed" class="nav-dot" aria-hidden="true"></span>

    <!-- 折叠态 tooltip -->
    <span v-if="collapsed" class="nav-tooltip" role="tooltip">{{ title }}</span>
  </Motion>
</template>

<script setup lang="ts">
import { Motion } from 'motion-v'
import { computed, ref } from 'vue'

const props = defineProps<{
  /** 图标（emoji 或字符） */
  icon: string
  /** 标题 */
  title: string
  /** 副标题（如日期） */
  subtitle?: string
  /** 是否激活（持久高亮） */
  active?: boolean
  /** 是否禁用 */
  disabled?: boolean
  /** 是否折叠态（仅图标 + tooltip） */
  collapsed?: boolean
  /** 入场错峰序号 */
  index?: number
}>()

const emit = defineEmits<{ select: [] }>()

const mx = ref(50)
const my = ref(50)

function onMove(e: MouseEvent) {
  const el = e.currentTarget as HTMLElement
  const r = el.getBoundingClientRect()
  mx.value = ((e.clientX - r.left) / r.width) * 100
  my.value = ((e.clientY - r.top) / r.height) * 100
}

const rootStyle = computed(
  () => ({ '--mx': mx.value + '%', '--my': my.value + '%' }) as Record<string, string>
)

function onClick() {
  if (!props.disabled) emit('select')
}
</script>

<style scoped>
/* ==========================================
   NavItem — Apple 玻璃风导航项
   ========================================== */
.nav-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 48px; /* 44px+ 点击区 */
  padding: 10px 14px;
  border: none;
  border-radius: 14px;
  background: transparent;
  cursor: pointer;
  text-align: left;
  font-family: var(--font-body);
  color: var(--ink);
  overflow: visible; /* 允许 tooltip 溢出 */
  isolation: isolate;
  -webkit-tap-highlight-color: transparent;
  outline: none;
}

/* --- 玻璃层：默认隐藏，hover/active 浮起显现 --- */
.nav-glass {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: rgba(255, 255, 255, 0.55);
  -webkit-backdrop-filter: blur(14px) saturate(180%);
  backdrop-filter: blur(14px) saturate(180%);
  box-shadow:
    0 4px 16px rgba(58, 50, 38, 0.1),
    inset 0 1px 0 rgba(255, 255, 255, 0.6);
  opacity: 0;
  transform: scale(0.96);
  transition:
    opacity 0.28s ease,
    transform 0.32s cubic-bezier(0.22, 1, 0.36, 1);
  z-index: -1;
  pointer-events: none;
}

.nav-item:hover .nav-glass,
.nav-item.is-active .nav-glass {
  opacity: 1;
  transform: scale(1);
}

/* --- 光标跟随光泽 --- */
.nav-sheen {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: radial-gradient(
    130px circle at var(--mx, 50%) var(--my, 50%),
    rgba(255, 255, 255, 0.6),
    rgba(255, 255, 255, 0) 60%
  );
  opacity: 0;
  transition: opacity 0.3s ease;
  z-index: -1;
  pointer-events: none;
  mix-blend-mode: screen;
}
.nav-item:hover .nav-sheen {
  opacity: 1;
}

/* --- 激活态：暖色玻璃胶囊 + 浮起阴影 --- */
.nav-item.is-active .nav-glass {
  background: linear-gradient(135deg, rgba(217, 116, 79, 0.2), rgba(224, 169, 59, 0.14));
  box-shadow:
    0 8px 22px rgba(217, 116, 79, 0.22),
    inset 0 1px 0 rgba(255, 255, 255, 0.7),
    inset 0 -2px 6px rgba(197, 64, 47, 0.12);
}

/* --- 图标 --- */
.nav-icon {
  position: relative;
  z-index: 1;
  width: 38px;
  height: 38px;
  min-width: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 11px;
  background: rgba(255, 255, 255, 0.5);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.7),
    0 1px 3px rgba(58, 50, 38, 0.1);
  transition:
    transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1),
    background 0.3s ease,
    box-shadow 0.3s ease;
}
.nav-icon-glyph {
  font-size: 19px;
  line-height: 1;
  transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.nav-item:hover .nav-icon {
  transform: scale(1.06);
}
.nav-item:hover .nav-icon-glyph {
  transform: scale(1.12) rotate(-4deg);
}
.nav-item.is-active .nav-icon {
  background: linear-gradient(135deg, rgba(217, 116, 79, 0.92), rgba(224, 169, 59, 0.85));
  box-shadow: 0 3px 10px rgba(217, 116, 79, 0.35);
}
.nav-item.is-active .nav-icon-glyph {
  transform: scale(1.1);
}

/* --- 文本 --- */
.nav-text {
  position: relative;
  z-index: 1;
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.nav-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: color 0.25s ease;
}
.nav-item.is-active .nav-title {
  color: var(--accent);
  font-weight: 700;
}
.nav-subtitle {
  font-size: 11.5px;
  color: var(--ink-soft);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.nav-item.is-active .nav-subtitle {
  color: var(--accent-hover);
}

/* --- 激活光点指示 --- */
.nav-dot {
  position: relative;
  z-index: 1;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 0 4px rgba(217, 116, 79, 0.18);
  animation: nav-dot-pulse 2s ease-in-out infinite;
}
@keyframes nav-dot-pulse {
  0%, 100% { box-shadow: 0 0 0 3px rgba(217, 116, 79, 0.2); }
  50% { box-shadow: 0 0 0 6px rgba(217, 116, 79, 0.05); }
}

/* --- 折叠态：仅图标居中 --- */
.nav-item.is-collapsed {
  justify-content: center;
  padding: 10px;
}
.nav-item.is-collapsed .nav-text {
  display: none;
}
.nav-item.is-collapsed .nav-dot {
  display: none;
}

/* --- 折叠态 tooltip（淡入 + 滑入） --- */
.nav-tooltip {
  position: absolute;
  left: calc(100% + 12px);
  top: 50%;
  transform: translateY(-50%) translateX(-6px);
  padding: 6px 12px;
  background: rgba(58, 50, 38, 0.92);
  color: #fff;
  font-size: 12.5px;
  font-weight: 500;
  border-radius: 10px;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition:
    opacity 0.22s ease,
    transform 0.26s cubic-bezier(0.22, 1, 0.36, 1);
  z-index: 1000;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.25);
}
.nav-item.is-collapsed:hover .nav-tooltip {
  opacity: 1;
  transform: translateY(-50%) translateX(0);
}

/* --- 禁用态 --- */
.nav-item.is-disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
