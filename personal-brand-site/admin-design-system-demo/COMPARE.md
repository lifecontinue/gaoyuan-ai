# COMPARE · 原型对照 DESIGN.md Sketch 节

对照对象：`DESIGN.md` version **1.1-arco-base+sketch-ref**（2026-11-06）「原型视觉与版式参考（Sketch）」+ inventory 案例页。  
Demo：`index.html` 系统设置 / 岗位管理切片。

处理原则：色 / 字 / 圆角只消费 `--ads-*`；版式跟 Sketch 案例；冲突登记，不覆盖 token。

## 匹配

| 检查项 | DESIGN / Sketch 要求 | Demo |
|---|---|---|
| 主色入口 | `--ads-theme-6` `#0152D9` | `css/ads.css` 只改这一处主题色；hover = 混白 36%，active = 混黑 22%（`color-mix`，不背 `#2A6BDD` / `#003EAA`） |
| 页面底 / 白卡 | 壳底 `#F8F8F8`，卡 `--ads-surface` 圆角 8、padding 24 | `.app` / `.page-card` |
| 侧栏宽 / 内边距 | 壳表 **148 px**，padding `8px 12px`，禁 margin 撑布局 | `--ads-sider-width: 148px`；`.sider { padding: 8px 12px }` |
| 顶栏 | 64 px | `.topbar` 64 |
| 左树右列表 | 树 220 + gap 24 | `.tree-panel` 220，`.workspace` gap 24 |
| 菜单去线 | 案例「侧栏导航去线」 | 侧栏菜单无条目分割线 |
| 表格行高 / 操作列 | 46 px；操作列右侧**文字链接** | `--ads-table-row-height`；编辑 / 查看 / 删除均为文字按钮 |
| 已选条数 | 底栏「已选左 / 分页右」，文案「已选 N 条」 | 始终渲染「已选 **N** 条」；有选中时出「取消选择」 |
| 分页气质 | 统计 → 页码 → 每页 10/50/100/200 → 跳页 | `.pagination` 顺序一致 |
| 抽屉档位 | 固定 px：md 640 / xl 960；禁 clamp | 编辑 = 640；查看 = 960 |
| 抽屉头底 | 头/底各 56，左右 padding 24；面板圆角 8 | `--ads-drawer-header`、`.drawer` radius card |
| 表单 | 标签宽约 120；开关下 12 px 说明 | `--ads-label-width`；`.field-note` caption 12/20、`--ads-text-45` |
| 筛选 | Form filter + 冒号标签 | 「岗位名称：」等；查询主按钮 / 重置默认按钮 |
| 按钮三套 | 主 / 默认 / 危险（+ 文字链） | 顶条「组件规范」+ 工具栏 + 抽屉脚 |
| 字号 | 内容区 12 / 14 / 16；正文 14/22 | 未引入 13/15/18 |
| 字体栈 | PingFang-SC / Microsoft YaHei | `--ads-font-family` |
| 空值 / 空态 | 无数据引导 | 筛选无结果：「暂无数据…」 |
| 不可逆 | 先确认再删 | 删除走 Popconfirm 气质浮层 |
| 文案 | 简体中文；无 Ant Design / Element 组件名 | 界面无 antd/element 用词 |
| Sketch 已登记色差 | Link `#1677FF`、danger `#F43F3F`、Success `#51C31A`、warning `#F9AD14` 不覆盖 token | 业务链接 / 主按钮走 theme-6；危险走 `--ads-danger` `#FF4D4F` |

## 差异（有意保留 token / 切片范围）

| 项 | Sketch / 案例预览 | Demo | 原因 |
|---|---|---|---|
| 功能侧栏明暗 | 案例预览「有面包屑」为**深色**功能轨 + 二级菜单 | **亮色**侧栏，选中 `--ads-theme-1` 底 + theme-6 字 | DESIGN Do’s：「侧栏不要深色」；`navy #16335F` 标明避免新用。色板以 `--ads-*` 为准 |
| 侧栏宽度叙事 | 案例含「侧栏导航宽度调整」多版；预览深色轨视觉偏窄（图标轨） | 按壳表画死 **148** | 未打开 `.sketch` 量像素。若实测 ≠148，问 Core/gaoyuan，不改 token |
| 图标交付 | 交付须 `@arco-design/web-vue/es/icon` | 内联 SVG symbol（线型 16px） | 静态 HTML、无构建；禁止 Unicode/伪元素假图标。观感临摹 Sketch Line icon |
| 全屏抽屉 / 分步 | 案例 xs480…full 1280/1440/1920 | 只做 md 640 + xl 960 | 本切片范围 |
| 授权穿梭 | 「授权组件」15 画板 | 未做 | 非本页必须项 |
| 深色 Typography 页 | 组件库有深色文字页 | 不用 | 管理端默认亮色 |
| 筛选 1 行 4 列 | 组件库「标签120 / 1行4列-收起」 | 流式 wrap，宽屏近似 4 列 | 窄屏允许折行，未做「收起」 |
| 三级 Tab 胶囊 | 特例半径 28 | 页内下划线 Tab | 岗位管理用一级下划线，未做胶囊三级 |
| Modal 16 圆角 | `--ads-radius-lg` | 未做 Modal；Popconfirm 用 `--ads-radius-sm` | 删除确认用轻量浮层 |
| 表头列自定义 | 案例「表格列自定义字段按钮」 | 工具栏有按钮，仅 toast | 位置对齐，无列配置面板 |
| 组件库 976 画板 | Asset-Components 全态 | 一条规范条：主/默认/危险/文字 + Tag | 证明 token，不复刻组件百科 |
| 顶栏搜索 / 用户 | 案例顶栏有操作区 | 搜索框 + 帮助 + 切换 + 头像 | 示意壳扩展位，非 help-center 真抽屉 |

## 开放问题

1. **深色侧栏是否仍要进原型？** 案例预览与 DESIGN「侧栏不要深色」冲突。本 demo 跟 token/Don’ts。若产品确认案例深色轨才是 2026 壳，需要单独开「壳皮肤」而不是改 `--ads-theme-6`。
2. **148 vs 宽度调整画板**：需要从 `admin-prototype-cases.sketch`「20250418 侧栏导航宽度调整」「20250428 顶栏侧栏导出」量一次。量到的值应写回 DESIGN「待核对差异」，不要先改 CSS 变量名含义。
3. **已选 0 条**：案例强调勿省略已选文案。Demo 在 0 条时仍显示「已选 0 条」。若现网是选中才出现，再对齐现网交互，不改色 token。
4. **Arco `Link` `#165dff`**：本页操作列用文字按钮 + theme-6，未引入 Link 组件默认蓝。

## 本切片未覆盖（inventory 有、demo 无）

帮助中心抽屉、全屏抽屉输入宽度自动、批量授权 / Shift 多选、多树切换、AI 陪练标签、步骤向导、Upload / Transfer / Cascader 全态。
