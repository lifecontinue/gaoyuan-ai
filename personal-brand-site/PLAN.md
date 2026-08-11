# 个人品牌网站（交互式房间）实现计划

> 计划版本 v2.0 | 2026-08-05 | 待用户确认后执行
> 前置方案：DESIGN.md v1.0（Bento Grid）已被本方案取代，方向从「便当网格」转为「沉浸式房间 + 热点」。

---

## 0. 背景与方向变更

- 用户参考 Miu Miu `immersivebags.miumiu.com` 的**交互形式**（房间内物体上的浮动热点、点击弹出详情、Change room / 声音 / 分享 / 计数等控件），以及一张 AI 生成的**静态书房房间图**（书桌、地球仪、坦克模型、相机/显示器、纸张上标注 Tank Wars / Travel Experiences / Camera Exercise / Web6amm / Toddler Evaluation）。
- 经确认的关键决策：
  1. **实现方式**：静态房间图 + 可点击热点（不建真 3D/WebGL、不做 360 全景）
  2. **房间数量**：仅 1 个书房房间
  3. **房间图来源**：使用用户提供的这张 AI 房间图（需用户提供原图文件，避免截图压缩）
  4. **热点行为**：点击弹出详情面板（名称/简介/截图/「打开应用」按钮），不直接跳转
  5. **物件→应用映射（已确认）**：坦克→Tank Wars；地球仪+书→Travel Experiences；相机→Camera Exercise；显示器/摄像头→Web6amm；纸张/画作→Toddler Evaluation。
  6. **应用命名（已确认）**：图中 5 个标签即真实已发布平台名称，直接作为标题；功能/简介取各平台实际信息展示（占位描述后续可细化）。
- 视觉基调沿用此前方案的温暖纸质/编辑感（奶油纸 `#F5ECD7`、金棕描边 `#C4A882`、深褐文字 `#3D2B1F`、鼠尾草绿 `#7A8C68`、琥珀 `#D9A441`；衬线字体 Playfair Display + Noto Serif SC + Lora + DM Mono），但 UI 需与房间图的黄昏暖光协调。

---

## 1. 页面结构（单页 DOM 骨架）

```
<body>
  <div id="app">
    <div class="room">                      <!-- 全屏舞台 -->
      <div class="room-stage">              <!-- cover 数学盒，尺寸=图片cover盒 -->
        <video class="room-video" autoplay muted loop playsinline poster="assets/img/room.png"></video>  <!-- 背景视频（room.png 作海报兜底） -->
        <div class="hotspots">              <!-- 热点层（百分比坐标子元素） -->
          <!-- 由 JS 根据 apps.js 注入 .hotspot -->
        </div>
      </div>
      <div class="room-overlay"></div>      <!-- 暗角/暖光氛围层（可选） -->
    </div>

    <header class="topbar">                 <!-- 顶部：站点名 + 计数 1/1 -->
      <div class="brand">…</div>
      <div class="counter">01 / 01</div>
    </header>

    <div class="controls">                  <!-- 底部控件条 -->
      <button class="ctrl ctrl--room" disabled>Change room</button>
      <button class="ctrl ctrl--sound">Sound</button>
      <button class="ctrl ctrl--share">Share</button>
    </div>

    <aside class="panel" hidden>            <!-- 详情面板（桌面右侧/移动底部抽屉） -->
      <button class="panel__close">×</button>
      <div class="panel__media"><img/></div>
      <h2 class="panel__title"></h2>
      <p class="panel__desc"></p>
      <div class="panel__tags"></div>
      <a class="panel__cta" target="_blank">打开应用 ↗</a>
    </aside>
    <div class="panel-scrim" hidden></div>   <!-- 面板遮罩 -->

    <nav class="chips" aria-label="应用索引"> <!-- 移动端兜底索引（横滑） -->
      <!-- 由 JS 注入 chip -->
    </nav>

    <div class="loader">…</div>             <!-- 首屏加载层 -->
  </div>
</body>
```

---

## 2. 文件目录设计

```
personal-brand-site/
├── index.html                  # 单页入口（含上述 DOM 骨架 + 内联首屏关键 CSS）
├── DESIGN.md                   # 设计说明书（v2.0 更新本方案，撤销 Bento 部分）
├── README.md                   # 项目说明 / 如何加应用 / 如何替换素材
│
├── assets/
│   ├── css/
│   │   ├── tokens.css          # 设计变量：色板/字体/间距/圆角/层级
│   │   ├── base.css            # reset + 全局排版 + 通用工具类
│   │   ├── room.css            # 房间舞台 + cover-stage 数学 + 背景层/氛围层
│   │   ├── hotspots.css        # 热点 ping 脉冲动画 + 标签气泡
│   │   ├── components.css      # topbar / controls / panel / chips / loader
│   │   └── motion.css          # 关键帧 + 状态类 + reduced-motion
│   │
│   ├── js/
│   │   ├── main.js             # 入口：装配各模块、初始化
│   │   ├── utils.js            # DOM 助手、坐标换算、clipboard、share
│   │   ├── loader.js           # 首屏加载（图片预载 + 进度）
│   │   ├── room.js             # 房间渲染 + cover-stage 尺寸/焦点计算
│   │   ├── hotspots.js         # 热点生成 + 脉冲 + 点击 → 打开面板
│   │   ├── panel.js            # 详情面板开/关/ESC/遮罩逻辑
│   │   ├── controls.js         # Change room（禁用态）/ Sound / Share
│   │   ├── sound.js            # 环境音开关（占位音频，可静音）
│   │   ├── share.js            # Web Share API / 复制链接
│   │   ├── calibrate.js        # ?calibrate=1 时动态导入：点击取坐标→剪贴板
│   │   └── data/
│   │       ├── apps.js         # 应用配置（核心扩展点）
│   │       ├── rooms.js        # 房间配置（单房间，预留多房间）
│   │       └── profile.js      # 个人信息/联系方式/二维码路径
│   │
│   ├── fonts/                  # 自托管 woff2 子集（Noto Serif SC 等，提升国内加载）
│   └── img/
│       ├── room.jpg            # 书房房间背景原图（用户提供，建议 ≥2400×1350）
│       ├── apps/               # 各应用图标/截图（占位→真实）
│       └── qrcode.png          # 公众号二维码
```

> 关键决策：不设 `render.js`（职责并入 room/hotspots/panel）；v1 不设 `theme.js`（单房间黄昏暖调，预留 `rooms[].mood`→overlay 滤镜扩展点）。

---

## 3. 核心数据结构（数据驱动）

`assets/js/data/apps.js`
```js
export const apps = [
  {
    id: "tank-wars",
    name: "坦克大战",
    desc: "更大的地图、立体化地形与 QWER 技能战斗。",
    tagline: "立体战场 · 实时技能对战",
    url: "https://0eab4a97014d401f9f8adca41bbbc0ff.gz3.agentos-app.net",
    tags: ["游戏", "实时对战", "3D 地形"],
    placements: [
      {
        room: "study",
        x: 24,
        y: 33,
        lx: 24,
        ly: 19,
        label: "坦克大战",
        anchor: "top",
        shape: [
          { x: 13, y: 25 }, { x: 19, y: 22 }, { x: 27, y: 23 },
          { x: 34, y: 27 }, { x: 37, y: 33 }, { x: 35, y: 40 },
          { x: 27, y: 43 }, { x: 18, y: 42 }, { x: 12, y: 36 }
        ]
      }
    ]
  },
  // 其余应用同理：使用真实名称、真实链接、tagline、lx/ly 与 shape 轮廓
];
```

`assets/js/data/rooms.js`
```js
export const rooms = [
  {
    id: "study",
    name: "书房",
    img: "assets/img/room.jpg",
    aspect: 16 / 9,            // 房间图实际比例（用户提供后填）
    focus: { x: 50, y: 50 },   // 桌面端图片对齐视口中心的点
    focusSm: { x: 50, y: 38 }  // 移动端偏向书桌区域
  }
];
```

`assets/js/data/profile.js`
```js
export const profile = {
  name: "你的名字",
  title: "产品经理 / AI 产品",
  motto: "…",
  contacts: { wechatQR: "assets/img/qrcode.png", email: "...", phone: "...", github: "..." }
};
```

**新增应用 = 只改一处**：在 `apps.js` 追加一条对象（含 `placements` 坐标），无需动 HTML/CSS/其它 JS。`status:"soon"` 自动以半透明热点占位，支持用户说的新增 2 个工具类应用先占位。

---

## 4. 热点定位方案（cover-stage 数学，防漂移）

`object-fit: cover` 会让「容器百分比 ≠ 图片百分比」导致热点漂移。解法：让「舞台」元素尺寸**精确等于图片的 cover 盒**，热点作为舞台的百分比子元素天然跟随。

```css
:root { --room-ar: 16/9; --focus-x: 50; --focus-y: 50; }
.room-stage{
  position:absolute; left:50%; top:50%;
  width:  max(100vw, calc(100svh * var(--room-ar)));
  height: max(100svh, calc(100vw / var(--room-ar)));
  transform: translate(calc(var(--focus-x) * -1%), calc(var(--focus-y) * -1%));
}
.hotspot{ position:absolute; left: calc(var(--x) * 1%); top: calc(var(--y) * 1%);
          transform: translate(-50%,-50%); }
```

两条 `max()` 组合后舞台宽高比恒等于 `--room-ar`；`--focus-x/y` 让图片任意点对齐视口中心，移动端用 `focusSm` 偏向书桌。配合 `calibrate.js` 取真实坐标。

---

## 5. 交互逻辑

- **热点脉冲**：CSS `@keyframes ping`（scale + opacity），性能仅 transform/opacity。
- **点击热点** → `panel.js` 填充数据并打开面板；支持 关闭按钮 / ESC / 点击遮罩 三种关闭。
- **面板 CTA** → `target="_blank"` 打开 `app.url`。
- **Sound**：`sound.js` 切换环境音（占位静音音频，可后续替换），按钮状态持久化到 localStorage。
- **Share**：`share.js` 优先 `navigator.share`，否则复制当前链接并 toast 提示。
- **Change room**：`rooms.length < 2` 时 `disabled` + 提示「更多房间即将开放」；切换逻辑已留好，加第二间房只需在 `rooms.js` 加一条。
- **计数器**：`01 / 01`（单房间占位，预留多房间）。
- **chips 索引**：移动端底部横滑 chips，保证任何热点被切出视口时仍可达（同时是无障碍/图片加载失败降级视图）。

---

## 6. 响应式断点

| 断点 | 宽度 | 布局/控件变化 |
|------|------|--------------|
| Desktop | ≥1024px | 全屏房间 + 绝对定位热点；面板右侧浮层（宽 ~420px）；控件底栏常显 |
| Tablet | 768–1023px | 同 Desktop，热点坐标按焦点微调；面板改为更宽抽屉 |
| Mobile | <768px | 舞台 `focusSm` 偏向书桌；热点跟随百分比；面板改为底部抽屉（高 ~70svh）；控件折叠为图标；chips 索引显示 |
| Touch | — | 无 hover：脉冲持续显示，点按直接打开面板 |

---

## 7. 加载与降级

- **首屏加载层**：`loader.js` 预载房间图，显示进度；图就绪后淡出。
- **图片懒加载**：应用截图在面板打开时才加载。
- **无 JS / 图失败降级**：`chips` 索引始终渲染应用列表，保证内容可达；`<noscript>` 提示开启 JS。
- **prefers-reduced-motion**：关闭脉冲/过渡，保留静态可点击热点。

---

## 8. 实现顺序（里程碑，每档独立可验收）

- **M0 素材**：用户提供房间原图、各应用截图/图标、真实名称与链接、二维码、联系方式（阻塞内容，不阻塞骨架）
- **M1 骨架与令牌**：index.html + tokens.css + base.css
- **M2 房间层**：room.css + room.js（cover-stage 数学 + 焦点）
- **M3 数据与校准**：apps.js / rooms.js / profile.js + calibrate.js（`?calibrate=1` 取坐标）
- **M4 热点**：hotspots.css + hotspots.js（脉冲 + 点击）
- **M5 面板**：components.css(panel) + panel.js
- **M6 控件**：controls.js + sound.js + share.js + components.css(controls/topbar/chips/loader)
- **M7 响应式**：断点适配 + chips 索引 + 移动抽屉
- **M8 性能与降级**：reduced-motion、懒加载、noscript、loader 进度
- **M9 内容落地**：用真实素材替换占位（名称/简介/截图/链接/二维码/环境音）

---

## 9. 待用户补充素材清单（阻塞项标 ★）

1. ★ **房间原图**：≥2400×1350，最好 16:9；若非 16:9 请告知实际比例（决定 `--room-ar`）
2. ★ **物件对照**：图中哪个物件对应哪个应用（已初步：坦克→Tank Wars、地球仪+书→Travel Experiences、相机→Camera Exercise、显示器/摄像头→Web6amm、纸张/画作→Toddler Evaluation；其中「相机/显示器」需确认分别归属）
3. **5 个应用真实信息**：名称、一句话简介、链接 URL、图标/截图
4. **新增 2 个工具应用**：名称/简介/链接（可先 `soon` 占位）
5. **公众号二维码**（qrcode.png）、联系电话、邮箱、GitHub
6. **环境音文件**（可选，无则 Sound 按钮占位静音）

---

## 10. 备注

- 本方案与 Miu Miu 的「交互形式」对齐（房间热点 + 详情面板 + 声音/分享/计数控件），但不复制其 WebGL 引擎，采用轻量静态图方案，性能与可维护性更优。
- 「品牌设计风格专家」skill 在当前环境未安装，已用 ardot-ui-design 的设计纪律（克制圆角、细描边、衬线体、editorial 气质）替代执行。
