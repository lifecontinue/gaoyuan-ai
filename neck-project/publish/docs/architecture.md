# neck-project 整体架构

## 1. 当前现状
目前项目在文件上仍然是两个互相关联的**单文件 HTML 原型**：

- `neck-soccer.html`
- `neck-archive.html`

但在当前阶段，**唯一主线交付对象是 `neck-soccer.html`**。

它们都采用同一种开发模式：
- 页面结构、样式、脚本全部写在一个 HTML 文件中
- 直接依赖 CDN 加载第三方库
- 在浏览器端完成摄像头识别、渲染和交互逻辑

这种方式适合快速迭代第一阶段玩法，但暂时不适合作为长期工程架构。

---

## 2. 当前技术架构

## 2.1 共同技术栈
- **HTML**：承载页面结构
- **CSS**：内联样式，负责界面表现
- **Vanilla JavaScript**：游戏循环 / 状态管理 / 摄像头 / 检测 / 渲染控制
- **MediaPipe FaceMesh**：做人脸关键点检测
- **Canvas 2D**：用于 `neck-soccer` 的实时绘制
- **Three.js + WebGL**：用于 `neck-archive` 的视觉现实层

---

## 2.2 Neck Soccer 当前内部结构
可以抽象成 6 层：

### A. UI Layer
- overlay
- HUD
- banner
- mode / score / button 状态

### B. Camera Layer
- `getUserMedia()`
- `<video id="cam">`
- 摄像头启动/授权/失败提示

### C. Face Tracking Layer
- MediaPipe FaceMesh
- landmark 接收
- 头部中心、半径、偏移计算
- neutral calibration

### D. Head Model Layer
- 将 landmarks 转为可交互的“头部碰撞体”
- 输出：`header.x / header.y / header.r / header.vx / header.vy`

### E. Physics / Gameplay Layer
- ball state
- gravity
- wall bounce
- head collision
- fail condition
- score

### F. Rendering Layer
- 摄像头背景渲染
- 球体绘制
- 头部可视化绘制
- hit flash / guide text

---

## 2.3 Neck Archive 当前内部结构
也可以抽象成 6 层：

### A. UI/HUD Layer
- brand
- toggles
- axis readouts
- campaigns
- start overlay

### B. Camera Layer
- `getUserMedia()`
- video stream lifecycle

### C. Face Tracking Layer
- MediaPipe FaceMesh
- landmarks 回调
- tracking / no face 状态

### D. Pose Model Layer
- yaw
- pitch
- roll
- N offset
- 平滑插值目标值

### E. Reality Scene Layer
- Three.js renderer / scene / camera
- particles
- wireframe shapes
- campaign color system

### F. Mesh Overlay Layer
- 2D canvas landmarks overlay
- oval outline
- debug readouts

---

## 3. 当前架构问题

## 3.1 工程结构问题
### 问题 1：两个页面重复造轮子
`neck-soccer` 和 `neck-archive` 都各自实现了：
- 摄像头调用
- FaceMesh 初始化
- landmarks 处理
- 状态切换
- 错误提示

这意味着：
- 修一个 bug 要修两遍
- 两边行为容易不一致
- 后续扩展成本很高

### 问题 2：全部逻辑挤在单文件中
目前每个 HTML 同时包含：
- DOM
- 样式
- 状态
- 算法
- 渲染
- 交互

后果是：
- 很难定位问题
- 很难复用逻辑
- 很难做测试和调试

### 问题 3：CDN 依赖分散
每个文件直接写 CDN：
- 版本不统一
- 初始化方式不统一
- 失败处理方式不统一

---

## 3.2 产品架构问题
### 问题 1：缺少统一“头部输入层”
当前项目最核心的资产其实不是球或粒子，而是：

> “把摄像头中的人头，稳定转换成可供产品使用的实时输入数据。”

但这层目前没有被抽出来。

### 问题 2：缺少统一调试系统
用户现在最容易怀疑的就是：
- 到底有没有识别到我？
- 识别到的是鼻子还是整张脸？
- 为什么我看到自己碰到了球，但程序没反应？

这说明项目需要一个统一 Debug Overlay：
- landmarks
- head center
- head radius / polygon
- current state
- tracking confidence

### 问题 3：产品目标还没被架构化
当前两个页面代表两种不同产品方向：
- 游戏（soccer）
- 沉浸场景（archive）

但二者共享的“head input engine”还没有被抽象出来。

---

## 4. 当前阶段推荐架构（下一步）
当前阶段不建议先做大规模工程化拆分，而应采用：

> **先围绕 `neck-soccer` 收敛成品体验，再决定是否进入统一前端重构。**

也就是说，短期架构策略是：
- 主改 `neck-soccer.html`
- 弱化 `neck-archive` 的主线地位
- 保留长期统一架构方向，但不把它作为当前阻塞项

## 4.1 推荐目录结构
```text
neck-project/
  index.md
  requirements.md
  architecture.md

  apps/
    soccer/
      index.html
    archive/
      index.html

  src/
    core/
      camera.js
      facemesh.js
      head-model.js
      debug-overlay.js
      loop.js
      state-machine.js

    soccer/
      soccer-game.js
      soccer-physics.js
      soccer-renderer.js
      soccer-ui.js

    archive/
      archive-scene.js
      archive-renderer.js
      archive-ui.js
      pose-mapper.js

    shared/
      constants.js
      math.js
      dom.js

  assets/
    styles/
      base.css
      hud.css
      soccer.css
      archive.css
```

---

## 4.2 推荐模块边界

### Core 层
负责可复用能力：
- 摄像头接入
- FaceMesh 启动与关闭
- landmark 数据流
- 头部模型计算
- debug overlay
- game/render loop
- 全局状态机

### Feature 层
按场景拆开：
- `soccer/` 只关心游戏逻辑
- `archive/` 只关心场景导航逻辑

### Shared 层
放公共工具：
- 数学计算
- DOM helpers
- 常量定义

---

## 4.3 数据流建议
统一采用这条数据流：

```text
Camera Stream
  -> FaceMesh
  -> Landmarks
  -> Head Model
  -> Feature Mapper
  -> Scene / Game Logic
  -> Renderer
  -> UI Feedback
```

具体解释：
1. 摄像头输出视频流
2. FaceMesh 输出 landmarks
3. Head Model 计算出统一的人头输入对象
4. Feature Mapper 决定这些输入怎么映射到具体业务
   - soccer: 映射成碰撞体
   - archive: 映射成姿态导航参数
5. 场景或游戏逻辑消费这些输入
6. 渲染层画出来
7. UI 层反馈当前状态

---

## 4.4 建议统一的数据结构
```js
headInput = {
  tracked: true,
  center: { x, y },
  radius: number,
  velocity: { x, y },
  yaw: number,
  pitch: number,
  roll: number,
  offset: { x, y },
  confidence: number
}
```

这样 `soccer` 和 `archive` 都可以直接消费同一份输入，而不是各自重新算。

---

## 5. 当前阶段推荐开发顺序

### Phase 1：先把 Soccer 做成型
- 优化开始页、HUD、失败页与重开流程
- 修掉识别与碰撞的不确定性
- 支持“位置移动 + 姿态变化”双输入模型
- 收敛 debug，只保留验证识别可信度所需信息
- 把命中反馈、得分反馈和整体游戏感做起来

### Phase 2：再补 P1 增强
- 连击、难度渐进、音效、反馈分层
- 头部碰撞体从圆形进一步优化为更贴近头型
- 更自然的新手引导与手感调优

### Phase 3：最后再决定是否工程化
- 视第一阶段完成度决定是否拆分 CSS / JS
- 视优先级决定是否恢复 archive 主线
- 若继续扩展，再进入统一 head input engine 抽象

---

## 6. 结论
当前 neck-project 的真正核心不是两个页面本身，而是这个能力：

> **把“人的头部动作”稳定、实时、可解释地变成前端交互输入。**

所以接下来的架构重点不该只是继续堆页面，而是先建立一个稳定的：

- Camera Layer
- Face Tracking Layer
- Head Input Engine
- Debug / Validation Layer

一旦这层稳了，游戏、训练、沉浸式导航这些上层玩法才会自然长出来。
