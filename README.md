# gaoyuan-ai · gaoyuan的个人品牌与 AI 应用集

本仓库是 **gaoyuan-ai.xyz** 个人品牌站及其相关 AI 应用源代码的统一归档（monorepo）。

线上站点：[https://www.gaoyuan-ai.xyz](https://www.gaoyuan-ai.xyz)
通过 Vercel 部署（项目 `lifecontinues-projects/gaoyuan-ai`）。

## 目录结构

| 目录 | 应用 | 说明 |
| --- | --- | --- |
| `personal-brand-site/` | 个人品牌站 | 静态站点（Vercel 部署根）。含 `practice/`（FRET FLOW 构建产物） |
| `AI Music Practice Interface/` | **FRET FLOW** 吉他/钢琴 AI 陪练 | React 19 + Vite + TS。实时音高/和弦/节奏检测 + AI 教练反馈 |
| `[孩子]成长评价系统/` | 儿童成长评估（Child Growth Assessment） | 幼儿园/小学阶段成长评估系统（ES Modules 分层架构） |
| `neck-project/` | 颈部足球（Neck Soccer） | 基于 MediaPipe FaceMesh 的体感小游戏 |
| `handdrawn-travel-map/` | 旅行故事地图（Trails） | 手绘风旅行故事地图 |
| `breathe/` | 呼吸（Breathe） | 引导式呼吸放松单页应用 |
| `wechat-migrate/` | 公众号文章迁移工具 | 将公众号历史文章导出为 Markdown + 本地化图片 + JSON 索引 |
| `satir_family_communication_system/` | 萨提亚家庭沟通系统 | 家庭沟通模式相关系统 |
| `Vibe Coding 课件/` | Vibe Coding 课件 | 课程资料 |
| `collab-whiteboard/` | 协作白板（Collab Whiteboard） | Miro 类单文件 HTML 协作白板，可配置 Supabase 后端 + localStorage 回退 |
| `tank-wars/` | 坦克大战（Tank Wars） | 纯静态 Canvas 小游戏（index.html + css + js），无构建、无依赖 |
| `poop-tracker/` | 宝宝便便记录（Baby Poop Tracker） | 单文件 HTML 移动应用（Tailwind/FontAwesome CDN + localStorage） |
| `pm-growth-os/` | PM 成长操作系统（PM Growth OS） | React 19 + Vite + TS + Supabase 全栈应用（.env 占位，需配 Tavily/WandB/Langfuse 等） |

## 品牌站中的应用映射（apps.js）

`personal-brand-site/assets/js/data/apps.js` 是应用目录的唯一数据源。本仓库已收录其中全部有本地源码的应用：
`fret-flow`、`child-assessment`（含 `growth-stars` 星空前端）、`neck-soccer`、`travel-map`、`breathe`、
`collab-whiteboard`，以及新增的 `tank-wars`、`poop-tracker`、`pm-growth-os`。

各应用统一通过 **`gaoyuan-ai.xyz`** 访问：品牌站为站点根，其余应用分别挂在 `*.gaoyuan-ai.xyz` 子域名下（见下方部署说明）。

## 部署

- 品牌站：`personal-brand-site/` 目录即 Vercel 部署根（`vercel.json` 为静态零构建），发布到 `gaoyuan-ai.xyz`。
- FRET FLOW 作为子站点挂载在 `/practice/`（构建产物位于 `personal-brand-site/practice/`）。
- 子域名：每个独立应用各建一个 Vercel 项目，根目录指向本仓库对应子文件夹，自定义域名设为 `*.gaoyuan-ai.xyz`（如 `tank-wars.gaoyuan-ai.xyz`、`pm-growth-os.gaoyuan-ai.xyz`、`child-assessment.gaoyuan-ai.xyz` 等），并在 DNS 处为各子域名添加 CNAME 指向 Vercel。

## 注意事项

- **密钥已排除**：所有 `.env` / `.env.local` 等真实环境变量文件均未入库（见 `.gitignore`）。
  各项目如需运行，请参考各自的 `.env.example` 自行配置。
- `node_modules`、`dist`、`.npm-cache`、各项目 `dist-*` 构建产物与运行时目录（`server/public` 等）均未入库。
