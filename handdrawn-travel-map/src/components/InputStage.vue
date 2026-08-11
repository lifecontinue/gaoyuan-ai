<template>
  <div class="input-stage">
    <div class="input-container">
      <!-- 标题区 -->
      <div class="input-header">
        <h1 class="input-title">✏️ 绘制你的旅行地图</h1>
        <p class="input-subtitle">用文字记录你去过的地方，我会把它变成一张手绘地图</p>
      </div>

      <!-- 输入区 -->
      <div class="input-body">
        <textarea
          :value="modelValue"
          class="textarea-handdrawn"
          placeholder="例如：今年7月我去了杭州西湖，8月初到了成都宽窄巷子吃了火锅，9月在日本京都赏枫、逛了伏见稻荷大社..."
          @input="$emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
        ></textarea>

        <!-- 错误提示 -->
        <div v-if="error" class="error-msg">
          ⚠️ {{ error }}
        </div>

        <!-- 操作按钮 -->
        <div class="input-actions">
          <button class="btn-handdrawn btn-secondary" @click="fillExample">
            📝 试试示例
          </button>
          <button
            class="btn-handdrawn btn-primary"
            :disabled="!modelValue.trim() || loading"
            @click="$emit('submit', modelValue)"
          >
            <span v-if="loading">⏳ 解析中...</span>
            <span v-else>🗺️ 开始绘制</span>
          </button>
        </div>
      </div>

      <!-- 底部提示 -->
      <div class="input-footer">
        <span class="footer-hint">💡 支持自然语言描述，包含时间、地点和故事即可</span>
      </div>
    </div>

    <!-- 装饰性手绘元素 -->
    <svg class="deco-svg" viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg">
      <circle cx="350" cy="80" r="30" fill="none" stroke="#e0a93b" stroke-width="2" opacity="0.4" stroke-dasharray="6 4"/>
      <path d="M30 320 Q60 290 90 330 T150 310" fill="none" stroke="#d9744f" stroke-width="2" opacity="0.3" stroke-dasharray="5 3"/>
      <text x="340" y="370" font-family="Caveat, cursive" font-size="20" fill="#4a8a8a" opacity="0.35">travel</text>
    </svg>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  modelValue: string
  loading: boolean
  error: string | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  submit: [text: string]
}>()

const EXAMPLE_TEXT = `今年7月中旬我去了杭州西湖，在苏堤上看了一场绝美的夕阳，荷叶连天碧，荷花别样红。
8月初飞到成都，在宽窄巷子吃了正宗的火锅，又去大熊猫基地看了花花。
9月底去了日本京都，在岚山竹林散步，还逛了伏见稻荷大社的千本鸟居。
10月初转战北海道，正好赶上红叶季，层林尽染美不胜收。`

function fillExample() {
  emit('update:modelValue', EXAMPLE_TEXT)
}
</script>

<style scoped>
.input-stage {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
  position: relative;
  overflow: hidden;
}

.input-container {
  width: 100%;
  max-width: 640px;
  background: var(--paper-light);
  border: 2px solid var(--ink-soft);
  border-radius: 20px 14px 24px 18px / 14px 24px 18px 20px;
  box-shadow: var(--shadow-strong);
  padding: 36px 40px;
  position: relative;
  z-index: 1;
}

.input-header {
  text-align: center;
  margin-bottom: 28px;
}

.input-title {
  font-size: 32px;
  color: var(--ink);
  margin-bottom: 8px;
}

.input-subtitle {
  font-size: 15px;
  color: var(--ink-soft);
}

.input-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.error-msg {
  padding: 10px 16px;
  background: #fdf0ed;
  border: 1px solid #e8a598;
  border-radius: 10px 7px 12px 9px;
  color: #c54b3a;
  font-size: 13px;
}

.input-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 6px;
  gap: 12px;
}

.btn-secondary {
  background: transparent;
  color: var(--ink-soft);
  border-color: var(--ink-light);
}

.btn-secondary:hover {
  background: var(--paper-dark);
  color: var(--ink);
}

.input-footer {
  margin-top: 20px;
  text-align: center;
}

.footer-hint {
  font-size: 12px;
  color: var(--ink-light);
}

/* 装饰 SVG */
.deco-svg {
  position: absolute;
  width: 100%;
  height: 100%;
  top: 0;
  left: 0;
  pointer-events: none;
  z-index: 0;
}
</style>
