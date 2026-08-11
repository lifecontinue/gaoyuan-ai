# 手绘旅行地图 · Hand-drawn Travel Map

一个把「自然语言行程描述」变成「手绘风格交互地图」的 Web 应用：
输入一段旅行经历 → AI（DeepSeek）解析为结构化行程 → Loading 过渡 → 手绘地图展示每个地点节点 → 点击弹出故事浮窗，左侧行程列表与地图联动。

> ⚠️ **项目隔离声明**：本项目（`handdrawn-travel-map/`）是一个**完全独立**的工程，
> 与同工作区下的「学生评价 / 高臻希」相关文件**无任何依赖、互不干扰**。
> 后续任何功能开发都只在此目录内进行，不引用、不修改工作区根目录的学生资料。

---

## 技术栈

- **前端**：Vue 3 + Vite + TypeScript + Pinia
- **地图**：Leaflet（CARTO Voyager 底图 + sepia 手绘滤镜）
- **手绘视觉**：Rough.js / SVG filter / 纸张纹理叠加
- **AI 解析（Agent）**：DeepSeek `deepseek-chat`，由 Vite dev-server 中间件在服务端调用
- **地理编码**：服务端 Nominatim（未知地名兜底）+ 内置已知城市坐标表（优先）

---

## 目录结构

```
handdrawn-travel-map/
├─ .env                      # DeepSeek API Key（gitignored，切勿提交）
├─ .env.example             # Key 模板
├─ vite.config.ts           # 含 /api/parse-trip 与 /api/geocode 中间件
├─ src/
│  ├─ prompts/parseTrip.ts  # DeepSeek 解析 Prompt + JSON schema
│  ├─ api/
│  │  ├─ tripParser.ts      # 调用 /api/parse-trip（失败降级 mockParser）
│  │  ├─ mockParser.ts      # 本地正则解析（无 key 时的兜底）
│  │  └─ geocoder.ts        # 调用 /api/geocode
│  ├─ components/           # InputStage / LoadingOverlay / TravelMap / TripListPanel / PlaybackBar / TopBar
│  ├─ stores/              # trip.ts（行程状态）/ ui.ts（阶段/面板/播放）
│  ├─ utils/coord.ts       # 坐标系转换 + 内置坐标表
│  └─ types/travel.ts      # Trip / ParseResult 等类型
├─ DESIGN_SYSTEM.md         # 设计系统规范（Design Token / 组件 / 交互）
```

---

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 配置 API Key
cp .env.example .env
#   编辑 .env，填入 DEEPSEEK_API_KEY=sk-xxx

# 3. 启动开发服务器（默认 http://localhost:5173）
npm run dev

# 4. 生产构建
npm run build      # 产物输出到 dist/
npm run preview
```

> 说明：DeepSeek 调用发生在 **Vite dev-server 中间件**（服务端），API Key 不会进入浏览器。
> 若未配置 Key 或网络异常，前端会自动降级到本地 `mockParser`，保证链路仍可跑通。

---

## AI 解析链路（Agent）

1. 用户在输入框用自然语言描述行程（如「今年7月去了杭州西湖…8月到成都…」）。
2. 前端 `POST /api/parse-trip` → 服务端用 `deepseek-chat` + 结构化 Prompt 解析
   → 返回 `{ title, trips: [{ place, city, country, startDate, story, emoji, tags, ... }] }`。
3. 逐站 `POST /api/geocode` 获取经纬度（已知城市走内置表，未知走 Nominatim）。
4. Loading 过渡 → 手绘地图渲染节点 + 路径连线 → 浮窗展示故事。

后续功能（图片生成、播放动画、移动端适配、多视角等）在此框架上逐步迭代。
