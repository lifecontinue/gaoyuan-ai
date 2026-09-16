# 对照笔记：文档 vs crimson-app

对照范围只覆盖仓库里的 Agent 说明，没有遍历业务代码：

- 根目录 `AGENTS.md`、`README.md`
- `apps/web/AGENTS.md`、`services/api/AGENTS.md`
- `apps/web/src/components/organisms/Agent/AGENTS.md` 与 runtime README
- `docs/getting-started.md`、`docs/applying_infrastructure.md`
- `.agents/skills/` 里现有 Skill 入口

日期：2026-09-16。

---

## 结论

原稿把 **目标组织 OS** 和 **仓库里已经能跑的 Agent 基建** 写在同一张图上，读起来像已经全部上线。真正已经扎实的，是编码 Agent 的交付纪律，以及产品 Copilot 的前端运行时。组织级 Slack/Linear/Gateway 总线，仓库文档里看不到对应实现。

---

## 已存在、原稿几乎没写的

| 现场做法 | 出现位置 | 文档应怎么写 |
|----------|----------|----------------|
| 分层 `AGENTS.md`：根仓库管流程，workspace 管实现 | 根 / web / api / Agent 组件 | 这是编码 Agent 的操作系统，不是可选项 |
| 交付闭环：改代码 → 最小验证 → 更新业务知识库 → 推分支 → 开 PR | 根 `AGENTS.md` | 比「Codex 写代码」更具体 |
| 业务知识库算交付物：`docs/business-map.md`、`docs/domains/*.md`、`docs/log.md` | 根 `AGENTS.md` | 不要只写 Algolia MCP |
| 每条 PR 要声明有没有改业务规则；没改也要写明判断 | 根 `AGENTS.md` | 这是防 Agent 静默改行为 |
| 高风险变更先问人：迁移、鉴权、计费、共享基建 | 根 `AGENTS.md` | HITL 已经写在工程规则里 |
| 分支前缀 `codex/`，不直接提交 `master` | 根 `AGENTS.md` | 任务真相源是 GitHub PR，不是 Linear |
| `pr-agent` 自动评 PR，Agent 要处理明确问题 | 根 `AGENTS.md` | 已有审查插件，不是规划项 |
| `agent_log/` 记轻量使用摘要，禁止塞聊天记录和密钥 | 根 `AGENTS.md` | 组织记忆的最小形态 |
| 产品 Agent：Vercel AI SDK、Zustand、GraphQL 线程/文档、Langfuse | Agent `AGENTS.md` | 运行时不是 LangGraph |
| 入口：`default_agent` / `student_onboarding` / `ssa_copilot` | Agent `AGENTS.md` | 产品 Agent 有多入口，不是通用 Slack Bot |
| 上下文：学生、文档、页面；页面内容发送时注入，不进持久化 | Agent `AGENTS.md` | 这是真正的 context bus |
| 后端：`POST /crimson-copilot`、`POST /student-onboarding` | Agent `AGENTS.md` | 流式 SSE + tool invocation |
| Feature flag：`GLOBAL_AGENT`、`COPILOT_AGENT_UI`、`AGENT_DOCUMENT_GENERATION` | Agent `AGENTS.md` | 灰度用 `featureSwitches`，不是默认 Darklight |
| 页面与 Agent 用 `AgentBus` 双向通信 | Agent runtime README | 产品内编排，不等于 n8n |
| 密钥：本地 `local.env`（1Password / `get-env`），staging/prod 走 AWS Secrets Manager | 根 README / Getting Started | 运行时出口是 Secrets Manager，不是 LLM Gateway |
| Auth0 出现在 Terraform 变量里；开发者用 Google + AWS SSO | applying_infrastructure / getting-started | 有员工 SSO，没有文档化的 Agent M2M Catalog |
| Salesforce 同步在 `services/delegate` | 根 README | GTM 系统存在，但不是 Slack Brief Bot |
| Contentful 用于 exam-prep 同步 | 根 README | CMS 存在；AI draft/publish HITL 是目标 |
| 仓库 Skill：`.agents/skills/`（如 application-review） | 仓库 | Skill 是给编码 Agent 的手册，不是 MCP 安装包 |
| Harness 以「复杂调参走评测」Skill 出现 | 个人/团队 Codex skill | 不是每个 prompt PR 的 CI gate |

---

## 原稿写得过满、仓库对不上的

| 原稿说法 | 问题 |
|----------|------|
| Linear 是执行唯一真相源 | 工程交付以 GitHub 为准；入职文档在 Confluence。Linear 最多是产品/反馈目标态 |
| LangGraph + n8n 是默认编排 | 产品 Copilot 是 Vercel AI SDK；n8n 未出现在 Agent/README |
| 全员共用同一套 MCP | 现场是 Cursor/Codex + 仓库 Skill + 各人 MCP，没有公司级 MCP 总线说明 |
| API Key Gateway 已是运行时 | 现场是 1Password + `local.env` + Secrets Manager |
| `#feedback` Bot → Harness → Linear | 组织流程设想，仓库无对应 Agent 规则 |
| Metabase Gold Collection、Algolia 去重 | 未出现在对照文档里 |
| Darklight 作为 Flag/CMS 态 | Web 侧写的是 `featureSwitches` |
| Replit 作为 PM 默认沙箱 | 仓库有 `libraries/replit-sdk`，但不能据此写成全员入口 |
| Rippling / PandaDoc 已接入身份与合同总线 | 对照的工程文档未提及 |
| 九层都已「补齐」 | 「补齐」应改成「目标能力」；否则读者以为已上线 |

---

## 修正原则（已回写到各文）

1. 先写 **as-is**，再写 **to-be**。
2. 编码 Agent 的知识库、验证、PR 纪律，提升为一等基建。
3. 产品 Copilot 单独成层：SDK、入口、上下文、Flag、观测。
4. Linear / Gateway / 反馈 Bot 保留为可复制蓝图，但标明尚未被这份 codebase 证实。
5. 工具用「职责」描述，品牌名可替换。
