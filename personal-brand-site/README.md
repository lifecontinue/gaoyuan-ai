# 个人品牌网站 · 应用工坊

交互式单房间个人品牌站：以一张「书房」房间图为背景，物件上浮动热点，点击弹出应用详情面板。
参考 Miu Miu immersive bags 的交互形式，采用轻量静态图方案（无 WebGL、无构建步骤）。

## 目录结构

```
personal-brand-site/
├── index.html
├── DESIGN.md          # 设计说明（v2.0，已转向房间方案）
├── PLAN.md            # 实现计划（与计划文件一致）
├── README.md
└── assets/
    ├── css/  tokens / base / room / hotspots / components / motion
    ├── js/   main / utils / loader / room / hotspots / panel / controls / share / calibrate / profilePanel
    │   └── data/  apps.js / rooms.js / profile.js   ← 主要编辑文件
    ├── fonts/       # 自托管 woff2 子集 + fonts.css（无外网依赖）
    ├── vendor/      # three.module.min.js（Three.js 本地副本）
    └── img/   room.png / qrcode.png
```

## 本地预览

任意静态服务器即可（ES Modules 需经 http 协议，不能用 file://）：

```bash
cd personal-brand-site
python -m http.server 8090
# 浏览器打开 http://localhost:8090
```

校准热点坐标：打开 `http://localhost:8090/?calibrate=1`，在房间图上点击，坐标会自动复制到剪贴板。

## 如何新增一个应用

只改 `assets/js/data/apps.js`，追加一条：

```js
{
  id: "my-app",
  name: "我的应用",
  desc: "一句话简介",
  tagline: "悬停浮窗中的一句短描述",
  url: "https://...",
  tags: ["标签"],
  placements: [{
    room: "study",
    x: 50,
    y: 50,
    lx: 56,
    ly: 38,
    label: "我的应用",
    anchor: "top",
    shape: [
      { x: 45, y: 46 },
      { x: 54, y: 45 },
      { x: 58, y: 52 },
      { x: 48, y: 56 }
    ]
  }]
}
```

`x / y` 为物件中心点，`lx / ly` 为标签锚点，`shape` 为物件不规则轮廓的百分比顶点坐标，均可用 `?calibrate=1` 辅助获取。

## 当前站点内容

1. `assets/img/room.png` —— 已使用的书房背景图
2. 3 个已接入应用：坦克大战 / 行迹 · 旅行故事地图 / [孩子]成长星空
3. `profile.js` 已填入姓名、职位、邮箱、电话、LinkedIn 与公众号二维码路径
4. 详情浮窗当前使用实时 iframe 预览；如需更强品牌感，可后续再补每个应用的静态封面图

## 部署到自定义域名（gaoyuan-ai.xyz）

本站为纯静态，且已**完全自包含**（字体与 Three.js 均本地化，无 Google Fonts / jsDelivr 外网依赖），可直接托管到任意静态平台。

### 方式 A：Vercel / Netlify（海外 · 免备案，最快上线）
1. 把 `personal-brand-site/` 整个目录推到 Git 仓库，或在平台控制台直接拖拽上传该目录。
2. 构建命令留空，发布目录设为站点根（即含 `index.html` 的目录）。
3. 平台分配临时域名后，进入 Domains 设置，添加 `gaoyuan-ai.xyz` 与 `www.gaoyuan-ai.xyz`。
4. 平台会给出要填的 DNS 记录（通常 `www` 用 CNAME 指向 `cname.vercel-dns.com` 之类，根域名 A 指向平台 IPv4）。

### 方式 B：阿里云 OSS + CDN（国内 · 需 ICP 备案）
1. 将目录上传到 OSS Bucket，开启静态网站托管。
2. 绑定自定义域名 `gaoyuan-ai.xyz`（OSS/CDN 控制台），并上传 SSL 证书开启 HTTPS。
3. 大陆节点需先完成 ICP 备案，否则无法对外提供大陆访问。

### 阿里云 DNS 解析（通用）
控制台 → 域名 → `gaoyuan-ai.xyz` → 解析设置，添加：
- 主机记录 `@`，类型 `A`，指向托管商提供的 IPv4（或按平台要求用 CNAME / ALIAS）
- 主机记录 `www`，类型 `CNAME`，指向托管商地址
- HTTPS 在托管侧配置证书（阿里云可申免费 SSL）

> 域名购买后需先在阿里云完成**实名认证**，否则解析不生效。

> 当前版本已可直接预览和交付；后续新增应用时，仅需在 `apps.js` 追加配置并补对应热区坐标。
