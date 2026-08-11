# CollabBoard — 云端同步 + 多画布管理 完成

## 本次交付
- **`collab-whiteboard.html`**（单文件，持续迭代）：在已有的「无限画布 + 连线多线型」白板基础上，接入云端同步与多画布管理。
- **`supabase-setup.sql`**（前序已建）：Supabase 建表 + RLS 策略，用户按需在 SQL Editor 执行。
- **`verify-cloud-boards.mjs`**：真实浏览器回归脚本（playwright-core + 本机 Chrome），15 项全绿、0 console error。

## 功能要点
1. **可配置后端（零 SDK）**：顶栏账户弹层填 Supabase Project URL + anon key → 走云端（GoTrue 魔法链接登录 + PostgREST）；留空则全程浏览器 localStorage，无缝降级。RLS 按 `auth.uid()=user_id` 隔离多用户画布。
2. **多画布 CRUD**：左侧抽屉（Ctrl+K 开合）支持新建 / 搜索 / 切换 / 行内重命名 / 创建副本 / 删除；顶栏标题框改名即时生效。
3. **自动保存**：编辑即标「未保存」、1100ms 防抖自动存；Ctrl+S 立即存；保存状态点带 已保存/未保存/保存中/失败 四态。
4. **启动恢复**：首屏自动种入演示画布；之后记住上次打开的画布（K_LAST），刷新/重开自动恢复。
5. **快捷键**：Ctrl+K 抽屉、Ctrl+S 保存；连线走线 1/2/3 切换仍有效。

## 关键修复
- **输入框 stopPropagation 导致全局快捷键整体失效**：`newBoard` 会 focus `#boardTitle`，原输入框 keydown 里 `e.stopPropagation()` 把 Ctrl+K/Ctrl+S 等全局键一并掐掉。改为 `isGlobalKey()` 白名单放行（仅对 Ctrl/Cmd+S|K 放行，其余仍拦截），修复后快捷键在任意焦点下均可用。
- **重复 `const mod` 声明**：曾导致整段脚本解析期 SyntaxError、页面全崩；已通过真实浏览器验证（不只靠语法检查）。

## 验证
真实 Chrome 回归（verify-cloud-boards.mjs）覆盖：首启种入、脏检测→自动保存→持久化、新建、重命名、切换、删除、Ctrl+S、刷新恢复、连线走线切换。全部通过，0 console error。

> 注：`file://` 直接打开时魔法链接无法回跳，需用 `npx serve .` 或 `python -m http.server` 起本地服务后再登录云端。
