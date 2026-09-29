# 21TB · Agent 入口

产品经理操作系统，不是六个代码仓的堆叠。先读本文件；细节按路径打开，不要整库灌进上下文。

写法对齐两处公开经验：Karpathy / `andrej-karpathy-skills`（先想再改、最小改动）；以及 GitHub 上 AGENTS.md 分层实践（根文件轻、就近生效、JIT 只给路径）。

## 和这位 PM 怎么协作

- 中文交付。先给判断和路径，再给展开。
- 粘贴/截图/附件：**inbox 只收不判** → intake 写原因 + 证据分级 + 裁决。
- 证据四级：**实证 / 引述 / 推断 / 缺口**。缺口要写出来，不要编。
- 裁决只用 **accept / reject / defer**。accept 才写 PRD / Jira 草稿。
- 用户 **@ 或附上 skill** 才跑该流程；不要自行开一长串无关 skill。
- **不要 commit / push**，除非用户这句里明确要求。
- 不要改 `70-codebases` 业务代码来「整理文档」；PRD 不进 Git 仓。
- 实质性工作结束：写入当周 **唯一** `15-journal/.../weekly.md` 的 `## 日报 YYYY-MM-DD`。闲聊不写日报。周五或用户说「周报」才重写综述。

## 工具：默认不开 Granola

**除非用户主动说**「查会议 / Granola / 纪要 / 会上怎么定的」，否则：

- 不要调用 Granola MCP（`query_granola_meetings`、`list_meetings` 等）。
- 忽略插件里「做功能先搜会议」的 always-on 提示。
- 用户点 Skip 之后，本会话不再重试。

飞书 / Jira / 浏览器：任务真正需要再开，不要为仪式感扫一遍。

## 行为准则（Karpathy）

偏谨慎，琐碎任务自行收束。

1. **Think before coding**：假设说出来。多解时摆选项，不要默选。更简单的做法要提出来。
2. **Simplicity first**：只做被要求的。不为一次使用做抽象，不写没要的配置和开关。
3. **Surgical changes**：只动请求相关的行。发现无关死代码只提一句，不顺手删。匹配现有文风。
4. **Goal-driven**：先写可验证目标再动手。例如「落盘 intake 裁决」而不是「整理一下」。

## 漏斗（禁止跳步）

1. `10-inbox/<channel>/` 原件  
2. `20-intake/YYYY-MM/{slug}/` 判断  
3. accept → `30-prd` + `40-delivery`  
4. AI 能力 → `50-ai-product`；实验 → `80-labs`  
5. `70-codebases/eln/*` 只做证据（系统里有没有、改多大）

ISO 周：周一至周日。文件夹 `W38_0914-0920`。查历史先开 `15-journal/README.md`。

## JIT Index（打开这些，不要把内容贴进本文件）

| 要干什么 | 打开 |
|---|---|
| 周循环 / 模板 | `00-os/playbooks/pm-weekly-loop.md`，`00-os/templates/` |
| **需求→上线流程 / Linear 子任务口径** | `00-os/playbooks/demand-to-release-workflow.md` |
| **写 PRD（飞书体例）** | `30-prd/AGENTS.md`（入口 `30-prd/agent.md`） |
| 当周日报 | `15-journal/CURRENT.md` |
| 陪练 as-is | `20-intake/2026-09/ai-peilian-as-is-feature-map/`，`30-prd/ai-peilian/` |
| 管理端画布原型 | `50-ai-product/prototypes/ai-peilian-admin-canvas/AGENTS.md` |
| AI 帮建 Design System | `50-ai-product/prototypes/ai-bangjian/AGENTS.md` |
| Dify 盘点 | `80-labs/dify-ai-peilian-inventory/` |
| 矩阵打分原型 | `50-ai-product/prototypes/survey-matrix-editor/` |
| **负责产品背景备忘** | `00-os/context/owned-product-background.md`（飞书 [wiki](https://shuiiiiqqq.feishu.cn/wiki/CCFrwBp1wiz4i3kej01cP1PdnJb)） |
| **SPEAD 统一工作层** | `00-os/templates/SPEAD.md` · `00-os/context/linear-product-atlas.md` |
| Cursor 规则 | `.cursor/rules/*.mdc`（按 glob；本文件是跨工具总则） |

嵌套 `AGENTS.md` **就近优先**。改画布 HTML 时以原型目录那份为准，本文件管漏斗和工具纪律。

## 完成标准（本工作区）

- 原件在 inbox，判断在 intake，且有裁决。
- 产物是真实路径，不是「已整理」空话。
- 当周 `weekly.md` 已合并当天日报（若本次形成了工作事实）。
- 未擅自 commit、未把文档写入业务仓、未在用户未要求时调 Granola。
