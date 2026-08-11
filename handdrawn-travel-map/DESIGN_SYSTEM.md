# 手绘旅行地图 — Design System Prompt v1.0

> 本文档是「手绘旅行地图」项目的权威设计系统规范，所有 UI 设计、组件开发、交互实现
> 必须严格遵循此文档。文档分为架构层、设计令牌层、组件层、交互层四个维度。

---

## 一、设计哲学

### 1.1 核心理念
**"像翻开一本旅行手账"** — 用户不是在看一张地图，而是在翻阅自己手绘的旅行日记。

### 1.2 设计原则

| 原则 | 说明 | 实践要点 |
|------|------|---------|
| **手作感** | 所有视觉元素都应有"人手绘制"的痕迹，而非计算机精确生成 | 不规则圆角、抖动边缘、手写字体、墨水阴影 |
| **温暖叙事** | 视觉风格传达旅行回忆的温暖感，而非工具感 | 牛皮纸底色、暖色调、故事性文案 |
| **留白呼吸** | 界面不应信息过载，给地图和故事留出展示空间 | 面板可折叠、浮窗简洁、地图为主角 |
| **渐进披露** | 信息分层展示，先看全貌再深入细节 | 列表→地图→弹窗的三级信息层次 |
| **一致语言** | 所有元素遵循统一的手绘视觉语言 | 共享圆角/阴影/字体/边框规范 |

### 1.3 禁止事项
- ❌ 不使用 Material Design / iOS 风格的阴影和圆角
- ❌ 不使用纯黑(#000)文字或纯白(#fff)背景
- ❌ 不使用直线边框（所有边框都应有手绘感）
- ❌ 不使用系统默认弹窗/对话框
- ❌ 不使用蓝紫色系作为主色调

---

## 二、整体架构

### 2.1 技术架构

```
┌─────────────────────────────────────────────────────────┐
│                     App.vue (顶层布局)                    │
│  ┌─────────────────────────────────────────────────────┐ │
│  │                 Pinia Store Layer                    │ │
│  │  ┌─────────────────┐    ┌─────────────────────────┐ │ │
│  │  │   tripStore     │    │       uiStore           │ │ │
│  │  │  (行程数据)      │    │    (UI 阶段/面板/播放)   │ │ │
│  │  └────────┬────────┘    └───────────┬─────────────┘ │ │
│  └───────────┼─────────────────────────┼───────────────┘ │
│              │                         │                  │
│  ┌───────────▼─────────────────────────▼───────────────┐ │
│  │              Composables Layer                       │ │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ │ │
│  │  │useMapControl │ │useRoughMarker│ │  useTimeline │ │ │
│  │  │ (Leaflet 封装)│ │(SVG 标记生成) │ │  (GSAP 动画) │ │ │
│  │  └──────────────┘ └──────────────┘ └──────────────┘ │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌─────────────────────────────────────────────────────┐ │
│  │              Components Layer                        │ │
│  │  ┌────────┐ ┌──────────┐ ┌────────┐ ┌────────────┐ │ │
│  │  │TopBar  │ │InputStage│ │Loading │ │ TravelMap  │ │ │
│  │  ├────────┤ ├──────────┤ ├────────┤ ├────────────┤ │ │
│  │  │TripList│ │TripListItem│ │Playback│ │StoryPopup │ │ │
│  │  └────────┘ └──────────┘ └────────┘ └────────────┘ │ │
│  └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### 2.2 阶段状态机

```
    ┌─────────┐     submit()      ┌─────────┐    geocode done   ┌──────┐
    │  input  │ ───────────────▶  │ loading │ ────────────────▶ │ map  │
    │ (输入)   │                   │ (加载)   │                   │(地图) │
    └─────────┘                   └─────────┘                   └──────┘
         │                             │                           │
         │ error                       │ timeout                   │ reset()
         ▼                             ▼                           ▼
    ┌─────────┐                   ┌─────────┐               ┌─────────┐
    │  error  │                   │  map    │               │  input  │
    │ (重试)   │                   │ (降级)   │               │ (重置)  │
    └─────────┘                   └─────────┘               └─────────┘
```

### 2.3 数据流

```
用户输入文本
    │
    ▼
mockParser / aiParser ──▶ ParseResult { title, trips[] }
    │
    ▼
tripStore.setParsed(result)
    │
    ▼
geocoder(trips) ──▶ 为每个 trip 填充 lat/lng
    │                    │
    │                    ▼
    │              uiStore.setProgress()
    │
    ▼
uiStore.setStage('map')
    │
    ▼
TravelMap.vue watch(trips) ──▶ renderMarkers() + renderPaths()
    │
    ▼
用户交互 ──▶ tripStore.selectTrip(id) ──▶ 地图 flyTo + 浮窗打开 + 列表高亮
```

### 2.4 布局系统

```
┌──────────────────────────────────────────────────────────────┐
│                        TopBar (52px)                          │
├──────────────┬───────────────────────────────────────────────┤
│              │                                               │
│  TripList    │              TravelMap                        │
│  Panel       │           (Leaflet 地图)                       │
│  (280px)     │                                               │
│              │                                               │
│              │                                               │
├──────────────┴───────────────────────────────────────────────┤
│                     PlaybackBar (52px)                        │
└──────────────────────────────────────────────────────────────┘

总高度 = 100vh
TopBar:   52px (fixed)
PlaybackBar: 52px (fixed)
主区域:    calc(100vh - 104px)
左侧面板:  280px (可折叠 → 0px)
地图区域:  flex: 1 (填满剩余)
```

---

## 三、设计令牌（Design Tokens）

### 3.1 色彩系统

#### 3.1.1 背景色阶（牛皮纸色系）

| Token | 值 | 用途 |
|-------|-----|------|
| `--paper` | `#f4ecd8` | 全局背景、地图外区域 |
| `--paper-light` | `#faf3e0` | 卡片、面板、浮窗背景 |
| `--paper-dark` | `#e8dcc4` | 输入框、面板 hover、分割线 |

#### 3.1.2 墨色阶（文字/边框）

| Token | 值 | 用途 |
|-------|-----|------|
| `--ink` | `#3a3226` | 主文字、标题、主边框 |
| `--ink-soft` | `#6b5d49` | 次要文字、描述、次要边框 |
| `--ink-light` | `#8c7b66` | 辅助文字、占位符、禁用态 |

#### 3.1.3 强调色

| Token | 值 | 用途 |
|-------|-----|------|
| `--accent` | `#d9744f` | 主按钮、选中态、高亮 |
| `--accent-hover` | `#c5653f` | 主按钮 hover |
| `--accent-light` | `rgba(217, 116, 79, 0.15)` | focus ring、选中背景 |

#### 3.1.4 调色板（行程节点颜色循环）

| Token | 值 | 名称 | 适用场景 |
|-------|-----|------|---------|
| `--palette-1` | `#d9744f` | 赤陶 | 第1站 / 起点 |
| `--palette-2` | `#e0a93b` | 金黄 | 第2站 |
| `--palette-3` | `#4a8a8a` | 青绿 | 第3站 |
| `--palette-4` | `#6b8cae` | 雾蓝 | 第4站 |
| `--palette-5` | `#7a8b5a` | 橄榄 | 第5站 |
| `--palette-6` | `#b5688f` | 藤紫 | 第6站 |

> 超过 6 站时循环使用。颜色也用于列表编号、弹窗标签等处保持一致。

#### 3.1.5 语义色

| Token | 值 | 用途 |
|-------|-----|------|
| `--error-bg` | `#fdf0ed` | 错误提示背景 |
| `--error-border` | `#e8a598` | 错误提示边框 |
| `--error-text` | `#c54b3a` | 错误提示文字 |
| `--success` | `#7a8b5a` | 成功状态（复用橄榄色） |

#### 3.1.6 底图滤镜

```css
.leaflet-tile-pane {
  filter: sepia(0.35) saturate(0.55) contrast(0.92) brightness(1.04) hue-rotate(-6deg);
}
```

> 这组 CSS filter 将 CARTO Voyager 底图从冷色调转换为泛黄牛皮纸色调。
> **不允许修改此值**，除非整体配色方案变更。

### 3.2 字体系统

#### 3.2.1 字体族

| Token | 值 | 用途 |
|-------|-----|------|
| `--font-display` | `'Caveat', 'Ma Shan Zheng', cursive` | 标题、地名、装饰文字 |
| `--font-body` | `'Noto Sans SC', 'Nunito', -apple-system, sans-serif` | 正文、按钮、列表 |

#### 3.2.2 字号层级

| 层级 | 大小 | 行高 | 字重 | 用途 |
|------|------|------|------|------|
| Display XL | 32px | 1.3 | 700 | 输入页大标题 |
| Display L | 26px | 1.3 | 700 | Loading 标题、地图标题 |
| Display M | 20px | 1.4 | 700 | 浮窗标题、面板标题 |
| Body L | 16px | 1.6 | 400 | 正文主文字 |
| Body M | 14px | 1.65 | 400 | 浮窗故事、列表描述 |
| Body S | 13px | 1.5 | 400 | 日期、辅助信息 |
| Caption | 12px | 1.4 | 400 | 底部提示、标签 |
| Label | 11px | 1.3 | 500 | 标签、进度信息 |
| Marker | 13px | 1.0 | 700 | 地图标记编号 |
| Handwriting | 16-18px | 1.0 | 700 | 进度百分比、页码（Caveat） |

#### 3.2.3 文字颜色规则

- 主文字：`--ink` (#3a3226)
- 次要文字（日期、描述）：`--ink-soft` (#6b5d49)
- 辅助文字（提示、占位符）：`--ink-light` (#8c7b66)
- 强调文字（选中态）：`--accent` (#d9744f)
- 浮窗内文字：`--ink`
- 地图标记编号：`#fff`（带 text-shadow）

### 3.3 间距系统

采用 **4px 基准网格**：

| Token | 值 | 用途 |
|-------|-----|------|
| `--space-xs` | 4px | 紧凑间距（标签间、图标与文字间） |
| `--space-sm` | 8px | 小间距（列表项内部、按钮内边距） |
| `--space-md` | 12px | 中间距（卡片内边距、组件间） |
| `--space-lg` | 16px | 大间距（面板内边距、区块间距） |
| `--space-xl` | 20px | 超大间距（面板外边距、大区块间距） |
| `--space-2xl` | 28px | 模块间距（输入页各区块间） |
| `--space-3xl` | 40px | 页面级间距 |

### 3.4 圆角系统

**核心规则：所有圆角使用非对称值**，模拟手绘的不规则感。

| Token | 值 | 用途 |
|-------|-----|------|
| `--radius-sm` | `8px 6px 10px 7px / 6px 10px 7px 8px` | 小按钮、标签 |
| `--radius-md` | `12px 8px 14px 10px / 8px 14px 10px 12px` | 输入框、中按钮 |
| `--radius-lg` | `18px 14px 20px 16px / 14px 20px 16px 18px` | 大按钮、卡片 |
| `--radius-xl` | `20px 14px 24px 18px / 14px 24px 18px 20px` | 大容器、输入面板 |

> 格式说明：`top-left top-right bottom-right bottom-left / 水平方向同序`
> 每个角的两轴值不同，制造"画歪了"的效果。

### 3.5 阴影系统

**核心规则：使用偏移阴影（无模糊），模拟墨水渗透纸张的效果。**

| Token | 值 | 用途 |
|-------|-----|------|
| `--shadow-soft` | `2px 3px 0 rgba(58, 50, 38, 0.18)` | 卡片静态阴影 |
| `--shadow-strong` | `3px 5px 0 rgba(58, 50, 38, 0.25)` | 卡片 hover 阴影 |
| `--shadow-pressed` | `1px 1px 0 rgba(58, 50, 38, 0.18)` | 按下态阴影 |
| `--shadow-inset` | `inset 1px 2px 4px rgba(58, 50, 38, 0.08)` | 输入框内阴影 |

> 关键：`blur-radius` 始终为 `0`，这是手绘风格的核心特征——硬边偏移阴影。

### 3.6 边框系统

| Token | 值 | 用途 |
|-------|-----|------|
| `--border-width` | `2px` | 主边框（卡片、按钮） |
| `--border-thin` | `1.5px` | 次要边框（列表项、小按钮） |
| `--border-color` | `var(--ink)` (#3a3226) | 主边框颜色 |
| `--border-color-soft` | `var(--ink-soft)` | 次要边框颜色 |
| `--border-color-light` | `var(--ink-light)` | 辅助边框颜色 |

### 3.7 z-index 层级

| Token | 值 | 层级 |
|-------|-----|------|
| `--z-tile` | 100 | 地图底图瓦片 |
| `--z-overlay` | 450 | 纸张纹理叠加层 |
| `--z-path` | 500 | 路径连线 |
| `--z-marker` | 600 | 地图标记 |
| `--z-popup` | 700 | 故事浮窗 |
| `--z-panel` | 800 | 左侧列表面板 |
| `--z-loading` | 900 | Loading 遮罩 |
| `--z-topbar` | 950 | 顶栏 |

### 3.8 SVG Filter 定义

#### 3.8.1 手绘抖动 filter

```svg
<filter id="handdrawn">
  <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="2" seed="7" result="noise"/>
  <feDisplacementMap in="SourceGraphic" in2="noise" scale="3.2"
    xChannelSelector="R" yChannelSelector="G"/>
</filter>
```

| 参数 | 值 | 说明 |
|------|-----|------|
| `baseFrequency` | 0.012 | 噪声频率（越小越平缓） |
| `numOctaves` | 2 | 噪声层数（越多越细腻） |
| `seed` | 7 | 随机种子（固定值保证一致性） |
| `scale` | 3.2 | 位移强度（越大越"抖"） |

#### 3.8.2 标记抖动 filter（更轻微）

```svg
<filter id="hd-marker-draw">
  <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="{random}" result="n"/>
  <feDisplacementMap in="SourceGraphic" in2="n" scale="1.5"/>
</filter>
```

> 标记的 seed 使用随机值，让每个标记有细微差异。

### 3.9 动画系统

#### 3.9.1 缓动函数

| Token | 值 | 用途 |
|-------|-----|------|
| `--ease-handdrawn` | `cubic-bezier(0.25, 0.46, 0.45, 0.94)` | 通用手绘感缓动 |
| `--ease-bounce` | `back.out(2)` | 弹性出现（标记入场） |
| `--ease-smooth` | `power2.inOut` | 平滑过渡（淡入淡出） |
| `--ease-draw` | `power1.inOut` | 绘制动画（路径描绘） |

#### 3.9.2 动画时长

| 名称 | 时长 | 用途 |
|------|------|------|
| `fast` | 0.15s | hover、press 等微交互 |
| `normal` | 0.3s | 按钮过渡、面板展开 |
| `slow` | 0.5s | 标记入场、浮窗打开 |
| `slowest` | 0.7s | 阶段过渡、Loading 消失 |
| `loading-min` | 2s | Loading 最短持续时间 |
| `loading-max` | 5s | Loading 最长持续时间 |
| `stagger` | 0.12s | 标记依次入场的间隔 |
| `path-draw` | 0.9s | 路径连线绘制时长 |

#### 3.9.3 关键动画规格

**Loading → 地图过渡**
```
1. LoadingOverlay: opacity 0→1, scale 1→1.04, duration: 0.6s, ease: power2.in
2. map-stage: opacity 0→1, filter blur(8px)→blur(0), duration: 0.7s, ease: power2.out
3. 标记入场: scale 0→1, opacity 0→1, rotation random(-25°→25°)→0°
   duration: 0.5s, stagger: 0.12s, ease: back.out(2)
4. 路径绘制: strokeDashoffset 100%→0%
   duration: 0.9s, stagger: 0.15s, ease: power1.inOut
```

**浮窗打开/关闭**
```
打开: scale 0.8→1, opacity 0→1, y 8→0, rotation -2°→0°
      duration: 0.35s, ease: back.out(1.7)
关闭: scale 1→0.9, opacity 1→0
      duration: 0.2s, ease: power2.in
```

---

## 四、组件规范

### 4.1 TopBar 顶栏

```
┌──────────────────────────────────────────────────────────────┐
│  🗺️ 标题文字          [我的视角] [同行者视角]      [折叠] │
└──────────────────────────────────────────────────────────────┘
高度: 52px
背景: var(--paper-light)
下边框: 2px solid var(--ink-soft)
内边距: 0 20px
z-index: var(--z-topbar)
```

- 标题：`--font-display`, 20px, `--ink`
- 视角标签：`--font-body`, 13px, 未选中 `--ink-soft` / 选中 `--accent`
- 标签间距：`--space-sm`

### 4.2 InputStage 输入页

```
┌──────────────────────────────────────────┐
│         ✏️ 绘制你的旅行地图               │  ← Display XL
│   用文字记录你去过的地方，我会把它变成...  │  ← Body S, ink-soft
│                                          │
│  ┌──────────────────────────────────┐    │
│  │                                  │    │
│  │  textarea (min-height: 160px)    │    │  ← 手绘边框输入框
│  │                                  │    │
│  └──────────────────────────────────┘    │
│                                          │
│  [📝 试试示例]           [🗺️ 开始绘制]  │  ← 手绘按钮
│                                          │
│       💡 支持自然语言描述...              │  ← Caption, ink-light
└──────────────────────────────────────────┘
max-width: 640px
背景: var(--paper-light)
边框: 2px solid var(--ink-soft), --radius-xl
阴影: var(--shadow-strong)
```

### 4.3 LoadingOverlay 加载页

```
        ╭─────────╮
        │  罗盘   │  ← 120×120 SVG, 旋转动画
        ╰─────────╯

    正在绘制你的旅行地图…   ← Display L
      标记去过的地方…       ← Body M, ink-soft

    ████████████░░░░  75%  ← 进度条 + Caveat 百分比
```

- 全屏遮罩：`background: var(--paper)`
- 罗盘：外圈虚线旋转(8s)，内圈虚线反向旋转(15s)，指针摆动(3s)
- 进度条：`--accent → --palette-2` 渐变填充
- 百分比文字：`--font-display` (Caveat), `--accent`

### 4.4 TravelMap 地图

- 容器：`width: 100%; height: 100%`
- 底图：CARTO Voyager nolabels + CSS sepia 滤镜
- 纸张纹理叠加层：`z-index: 450, opacity: 0.18, mix-blend-mode: multiply`
- 路径连线：`#6b5d49`, weight: 2, opacity: 0.5, dashArray: '8 6'
- 自适应：`fitBounds` + padding 0.3

### 4.5 HandDrawnMarker 手绘标记

```
SVG 尺寸: 48×60
  ┌─────────┐
  │  ① / 📍 │  ← 圆形主体 r=17, fill=palette[n]
  └────┬────┘
       │       ← 针尖（三角形）
       ▼
iconAnchor: [24, 54]  (针尖为锚点)
```

- 圆形：`fill: palette[n], fill-opacity: 0.85, stroke: --ink, stroke-width: 2`
- 圆形应用 `filter: url(#handdrawn)` 抖动
- 针尖：`fill: --ink, opacity: 0.8`
- 高光：椭圆 `fill: white, fill-opacity: 0.25`
- 编号文字：`fill: #fff, font-size: 13px, font-weight: 700, text-shadow: 0 1px 2px rgba(0,0,0,0.3)`
- hover 效果：`scale: 1.15, transition: 0.15s`

### 4.6 StoryPopup 故事浮窗

```
┌──────────────────────────────────┐
│  [✕]                              │
│  📍 杭州西湖                      │  ← Display M
│  📅 2024-07-15 ~ 2024-07-20      │  ← Body S, ink-soft
│  ┌──────────────────────────────┐ │
│  │                              │ │
│  │     🖼️ 旅行回忆图片占位       │ │  ← 4:3, 圆角
│  │                              │ │
│  └──────────────────────────────┘ │
│  那天傍晚坐在苏堤上看夕阳...      │  ← Body M
│  #美食 #风景 #夏日               │  ← 标签
└──────────────────────────────────┘
max-width: 320px, min-width: 240px
filter: url(#handdrawn)
background: var(--paper-light)
border-radius: --radius-lg
box-shadow: --shadow-strong
```

### 4.7 TripListPanel 左侧列表

```
┌────────────────────┐
│  📋 行程列表    [◀] │  ← 面板头, 36px
├────────────────────┤
│ ① 杭州西湖          │  ← TripListItem
│   7月 · 西湖        │
│   ─ ─ ─ ─ ─ ─ ─   │  ← 手绘虚线分割
│ ② 成都宽窄巷子      │
│   8月 · 宽窄巷子    │
│   ─ ─ ─ ─ ─ ─ ─   │
│ ③ 京都              │
│   9月 · 京都        │
│   ─ ─ ─ ─ ─ ─ ─   │
│ ④ 北海道            │
│   10月 · 北海道     │
└────────────────────┘
width: 280px (展开) / 0px (折叠)
背景: var(--paper-light)
右边框: 2px solid var(--ink-soft)
```

**TripListItem 规格：**
- 编号：`--font-display`, 18px, `palette[n]`
- 标题（place）：`--font-body`, 14px, 500, `--ink`
- 摘要：`--font-body`, 12px, `--ink-soft`
- active 态：底部手绘下划线（`--accent`, `filter: url(#handdrawn)`）
- hover：背景 `--paper-dark`
- 内边距：`12px 16px`
- 分割线：`1.5px dashed --ink-light`, opacity 0.3

### 4.8 PlaybackBar 底部控制栏

```
┌──────────────────────────────────────────────────────────────┐
│  [▶] [⏮] [⏭]    ● ● ● ● ○ ○ ○ ○        第 3 / 共 8 站    │
└──────────────────────────────────────────────────────────────┘
高度: 52px
背景: var(--paper-light)
上边框: 2px solid var(--ink-soft)
```

- 按钮：34×34, `--radius-sm`, `--border-thin`, `--border-color-soft`
- 播放按钮：`▶` / `⏸` emoji
- 进度点：10×10 圆形, 未激活 `transparent + --ink-light 边框` / 激活 `--accent` + 3px glow
- 页码：`--font-display` (Caveat), 16px, `--ink-soft`

---

## 五、交互规范

### 5.1 交互状态

每个可交互元素必须定义以下状态：

| 状态 | 视觉变化 | 时长 |
|------|---------|------|
| `default` | 基础样式 | — |
| `hover` | translate(-1px, -1px) + shadow-strong + 边框加深 | 0.15s |
| `active/pressed` | translate(1px, 1px) + shadow-pressed | 即时 |
| `focus` | 3px accent-light ring | 即时 |
| `disabled` | opacity: 0.5, cursor: not-allowed | — |
| `selected/active` | accent 色高亮 + 底部手绘下划线 | 0.2s |

### 5.2 地图 ↔ 列表联动

```
列表点击                     地图标记点击
    │                             │
    ▼                             ▼
tripStore.selectTrip(id)    tripStore.selectTrip(id)
    │                             │
    ├──────────┬──────────────────┤
    ▼          ▼                  ▼
列表高亮    地图 flyTo         浮窗打开
+ scrollIntoView  (zoom≥7)     (GSAP 动画)
```

- `flyTo` 参数：`duration: 0.8s`, `zoom: max(current, 7)`
- `scrollIntoView` 参数：`behavior: 'smooth', block: 'nearest'`

### 5.3 播放模式

- 点击播放 → 从当前站开始，每 3 秒自动切换到下一站
- 自动切换时：`flyTo` + 浮窗打开 + 列表高亮 + 进度点更新
- 到达最后一站后自动暂停
- 播放过程中可手动暂停或点击任意站点跳转

### 5.4 键盘导航

| 按键 | 行为 |
|------|------|
| `←` / `↑` | 上一站 |
| `→` / `↓` | 下一站 |
| `Space` | 播放/暂停 |
| `Escape` | 关闭浮窗 |
| `Tab` | 焦点循环（列表项 → 标记 → 按钮） |

---

## 六、手绘风格实现规范

### 6.1 三层手绘效果体系

```
层次1: CSS 层 — 圆角 + 阴影 + 边框
  ↓ 所有容器、按钮、输入框
层次2: SVG Filter 层 — feTurbulence + feDisplacementMap
  ↓ 浮窗、标记、高亮下划线
层次3: 纹理层 — 纸张背景 + 墨水叠加
  ↓ 全局 body + 地图 overlay
```

### 6.2 手绘圆角规则

所有圆角使用 **非对称八值** 写法：
```css
border-radius: 18px 14px 20px 16px / 14px 20px 16px 18px;
/*                 TL   TR   BR   BL  /  TL   TR   BR   BL */
```

规则：
- 每个角的水平半径 ≠ 垂直半径
- 四个角的值互不相同
- 差值范围：2-6px
- 同类组件使用相同的圆角模式（通过 CSS 变量复用）

### 6.3 纸张纹理

- 生成方式：`feTurbulence` 程序生成灰度噪声 → 导出 PNG
- 纹理尺寸：320×320px（平铺）
- 叠加方式：`mix-blend-mode: multiply, opacity: 0.18`
- 应用范围：`body` 全局 + `.map-paper-overlay` 地图层

### 6.4 墨水效果

- 阴影：偏移阴影 `offset-x offset-y 0 color`（blur 恒为 0）
- 边框：2px 实线，颜色为墨色阶
- 描边：SVG stroke 使用 `#3a3226`，stroke-width 2
- 文字阴影：`text-shadow: 0 1px 2px rgba(0,0,0,0.3)`（仅标记编号）

---

## 七、响应式断点

| 断点 | 宽度 | 布局调整 |
|------|------|---------|
| Desktop L | ≥ 1280px | 全功能布局，面板固定 280px |
| Desktop M | 1024-1279px | 全功能布局，面板 260px |
| Tablet | 768-1023px | 面板可折叠，浮窗宽度收窄至 280px |
| Mobile | < 768px | 面板默认折叠为底部抽屉，地图全屏 |

> MVP 阶段优先保证 Desktop 体验，移动端适配在 v1.1 实现。

---

## 八、开发约定

### 8.1 文件命名

- 组件文件：`PascalCase.vue`（如 `StoryPopup.vue`）
- composables：`camelCase.ts`，以 `use` 开头（如 `useMapController.ts`）
- 工具函数：`camelCase.ts`（如 `smoothPath.ts`）
- 类型定义：`camelCase.ts`（如 `travel.ts`）
- 样式文件：`kebab-case.css`（如 `main.css`, `rough.css`）

### 8.2 CSS 规范

- 全局变量定义在 `:root` 中，使用 `--` 前缀
- 组件内样式使用 `<style scoped>`，全局样式用 `<style>`（无 scoped）
- 禁止硬编码颜色值，必须使用 CSS 变量
- 禁止使用 `!important`（除非覆盖 Leaflet 内联样式）
- 动画优先使用 GSAP，简单过渡使用 CSS transition

### 8.3 组件 props 规范

- 使用 TypeScript `defineProps<{ ... }>()` 类型标注
- 事件使用 `defineEmits<{ ... }>()` 类型标注
- 不使用 `any` 类型
- 可选 props 使用 `?` 标注并提供合理默认值

---

*Design System Version: 1.0*
*最后更新: 2026-08-04*
*适用项目: handdrawn-travel-map*
