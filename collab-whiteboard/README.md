# 素白板 · CollabBoard

一个**单文件、零依赖**的网页白板原型（类 Miro），原生 Canvas 2D + DOM 实现，支持便签、画笔、连线、图形、多选组合、撤销重做、PNG/JSON 导入导出，并内置**可配置的 Supabase 云端同步 + 多画布管理**。

> 文件即应用：`collab-whiteboard.html` 一个文件包含全部 HTML / CSS / JS，无需构建、无外部依赖、可离线打开。

---

## 功能一览

- **无限画布**：拖拽平移 + 滚轮向光标缩放；右下角迷你地图点击导航；一键缩放适配（Zoom to Fit）。
- **便签**：点加 / 拖移 / 双击富文本编辑（加粗·斜体·下划线·删除线·字号·颜色·列表）；右键删除；四角缩放；多色切换。
- **画笔**：自由绘制，可调粗细与颜色。
- **连线**：便签间连线，端点自动贴边；支持三种**线型**（直线 / 折线 / 曲线）、实线/虚线、单向/双向箭头、中点标签。
- **图形库**：矩形 / 椭圆 / 菱形 / 三角 / 直线 / 箭头，可放置、缩放、选中。
- **多选与组合**：框选 / Shift 点选、组合与解组、对齐（左/中/右/顶/中/底）。
- **复制粘贴**：`Ctrl+C / V / D`（含内部连线，粘贴带偏移）。
- **撤销重做**：JSON 快照栈（上限 80）。
- **图层**：置于顶层 / 底层。
- **吸附对齐**：拖拽时与其它对象边/中心对齐并绘制引导线。
- **导入导出**：PNG（2x 离屏重绘）、JSON 导出 / 导入。

### 云端同步 + 多画布管理

- **可配置后端**：顶栏账户按钮填写 Supabase **Project URL + publishable key**；留空则全程使用浏览器 `localStorage`（本地模式）。
- **多用户登录**：Supabase 魔法链接（免密码邮箱 OTP）登录，数据按用户隔离（RLS）。
- **多画布管理**：左侧抽屉面板（`Ctrl+K` 开合）——新建 / 搜索 / 切换 / 行内重命名 / 创建副本 / 删除；顶栏标题框改名即时生效。
- **自动保存**：编辑即标「未保存」，1.1 秒防抖自动存；`Ctrl+S` 立即存；保存状态四态（已保存 / 未保存 / 保存中 / 失败）。
- **启动恢复**：记住上次打开的画布，刷新 / 重开自动恢复。

---

## 快速开始

### 方式一：直接打开（本地模式）
双击 `collab-whiteboard.html` 用浏览器打开即可使用。此时为**本地模式**，画布存在本机浏览器，不联网。

### 方式二：本地起服务（启用云端登录）
魔法链接登录需要浏览器能接收 OAuth 回跳，`file://` 直接打开无法收到回调，需用本地 HTTP 服务：

```bash
# 在本文件夹下执行（二选一）
python -m http.server 8000
# 或
npx serve .
```

然后访问 `http://localhost:8000/collab-whiteboard.html`。

### 部署版
`dist/index.html` 是发布用的同名构建（内容与主文件一致），可直接托管到任意静态空间。

---

## 云端同步（Supabase）配置

### 1. 准备项目
在 [supabase.com](https://supabase.com) 新建项目，记下 **Project URL**（形如 `https://xxxx.supabase.co`）和 **Project API keys → Publishable key**（客户端用，安全可公开）。

### 2. 建表 + 权限
在 Supabase **SQL Editor** 执行本仓库的 `supabase-setup.sql`，它会创建 `public.boards` 表并开启 RLS（按 `auth.uid() = user_id` 隔离每个用户的数据）。

### 3. 开启登录方式
**Authentication → Providers** 中开启 **Email**，并确保 **Email / Magic Link (OTP)** 可用。
在 **Authentication → URL Configuration** 的 **Redirect URLs** 中加入你的部署域名（如 `https://<你的域名>` 或本地 `http://localhost:8000`）。

### 4. 填入配置
- 打开白板 → 顶栏账户按钮 → 填写 **Project URL** 与 **Publishable key** → 保存。
- 本仓库主文件已把 **Publishable key 预置为默认值**，你只需补填 **Project URL** 即可一键切到云端。
- 填写后点击「发送魔法链接」，到邮箱点链接完成登录，此后画布自动同步到云端、按用户隔离。

### 注意事项
- `file://` 打开时魔法链接无法回跳，必须走 HTTP（见「快速开始 · 方式二」）。
- 已部署到公网后，魔法链接回跳正常，`file://` 限制不再适用。

---

## 项目结构

```
collab-whiteboard/
├── collab-whiteboard.html     # 主程序（单文件，全部逻辑在此）
├── supabase-setup.sql         # 建表 + RLS 策略（云端同步必需）
├── dist/                      # 发布构建（index.html）
├── overview.md                # 功能概览
├── wabi-sabi-design-prompt.md # 设计语言规范（Wabi-Sabi）
├── verify-cloud-boards.mjs    # 回归：云端/多画布（15 项）
├── verify-regression.mjs      # 回归：通用交互（7 项）
├── verify-note-drag.mjs       # 回归：便签拖拽（10 项）
└── README.md                  # 本文件
```

---

## 回归测试

使用 `playwright-core` + 本机 Chrome 做真实浏览器回归（捕捉语法检查查不出的运行时错误）。

**环境要求**
- Node.js（仓库使用 `C:/Users/haida/.workbuddy/binaries/node/...` 的托管版本）
- `playwright-core` 已装在 `C:/Users/haida/.workbuddy/binaries/node/workspace/node_modules`
- 本机已安装 Google Chrome（`chromium.launch({ channel: 'chrome' })` 复用）

**运行**
```bash
# 在 collab-whiteboard/ 目录下
node verify-cloud-boards.mjs
node verify-regression.mjs
node verify-note-drag.mjs
```
脚本硬编码了主文件路径，放在本文件夹内直接运行即可；全部通过时进程退出码为 `0`、且控制台零报错。

---

## 部署

`dist/index.html` 为单文件构建，可托管到任意静态托管（如 CloudStudio / Vercel / GitHub Pages / Nginx）。
重新部署时，确保从本文件夹的 `dist/` 目录取最新 `index.html`（主文件有改动后，先 `cp collab-whiteboard.html dist/index.html` 再发布）。

---

## 安全提示

- 客户端只应使用 Supabase **Publishable / anon key**。**切勿**把 **service_role** secret key 写进前端代码——那会绕过 RLS，任何人可读写全库。
- 云端数据隔离依赖 `supabase-setup.sql` 中的 RLS 策略，请确保该 SQL 已正确执行、且不要关闭 RLS。
- 本地模式数据仅存于访问者自身浏览器，不会上传。
