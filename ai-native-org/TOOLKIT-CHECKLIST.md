# AI Native 团队工具清单（可复制版）

> **用法**：把本文发给协作团队或新 BU。按「必选 / 推荐 / 可选」勾选；名称可替换为等价产品，但**职责列不要删**。复制后填「负责人 / 账号 / 环境」。

**配套**：[架构](./AI-NATIVE-INFRA.md) · [组织节奏](./ORG-OPERATING-CADENCE.md) · [工作流](./WORKFLOWS.md) · [Skill/MCP/Plugin](./SKILLS-MCP-PLUGINS.md)

---

## 如何 Copy

1. 复制本文件到团队 Docs / Notion / Git。
2. 将「示例产品」换成你们已采购或开源等价物。
3. 指定每行 **Owner**（人名）与 **Backup**。
4. 先打通「反馈→评估→Linear」与「密钥 Gateway」，再铺其他。
5. 所有模型调用统一走 Gateway + OpenAI-compatible SDK。

---

## A. 身份、密钥、审计（L0–L1）

| 必选 | 职责 | 示例产品 | 等价替代 | Owner | 备注 |
|:----:|------|----------|----------|-------|------|
| ✓ | 员工 SSO / 人机身份 / M2M | **Auth0** | Okta, Clerk, Keycloak | | Agent 用 M2M，人用 SSO |
| ✓ | 密钥真相源 | **1Password Business** | Vaultwarden, Bitwarden | | 禁止聊天传 key |
| ✓ | API Key / 模型密钥统一出口 | **API Key Gateway**（自建或采购） | LiteLLM Proxy, Portkey, Helicone Gateway | | 业务只持逻辑 key |
| ✓ | 操作审计日志 | **Audit Log** → Datadog/Lake | Splunk, ELK | | Agent 不可删除 |
| ✓ | 策略：允许/拒绝/HITL | Gateway Policy + Auth0 Actions | OPA, Cedar | | publish/对外默认 HITL |
| ○ | 密钥扫描 | Gitleaks + GitHub Secret Scanning | Trufflehog | | CI 必跑 |
| ○ | 设备/入职账号生命周期 | Google Workspace | Microsoft 365 | | offboarding 吊销 |

---

## B. 协作与知识总线（L2）

| 必选 | 职责 | 示例产品 | 等价替代 | Owner | 备注 |
|:----:|------|----------|----------|-------|------|
| ✓ | 即时协作 + 反馈频道 | **Slack** | Teams, Discord | | `#feedback` `#incidents` |
| ✓ | 任务真相源 | **Linear** | Jira, Height, Asana | | 自动建单字段约定 |
| ✓ | 文档 / Spec / ADR | **Google Docs** | Notion, Confluence | | 每 Issue 回链 |
| ✓ | 设计 | **Figma** | Penpot, Sketch | | 标注可被 MCP 读 |
| ✓ | 会议 | **Zoom** | Meet, Teams | | 需转写 |
| ✓ | 日历触发 | **Google Calendar** | Outlook Calendar | | 会前 Brief、Cycle |
| ✓ | 需求整理 / 强推理 | **Claude**（+ Canvas） | ChatGPT, Gemini | | Spec 模板化 |
| ✓ | 代码托管 | **GitHub** | GitLab, Bitbucket | | Prompt/Harness 入库 |
| ○ | 白板/探索 | Miro / FigJam | | | 结论必须回 Docs |
| ○ | 知识检索索引 | **Algolia** | Elasticsearch, Typesense, Meilisearch | | 含反馈去重 |

---

## C. 数据、内容、分析（L3）

| 必选 | 职责 | 示例产品 | 等价替代 | Owner | 备注 |
|:----:|------|----------|----------|-------|------|
| ✓ | 数据湖 / 仓 | **Data Lake**（S3+引擎等） | BigQuery, Snowflake, Databricks | | Agent 默认不直连 Bronze |
| ✓ | 语义查询 / 看板 | **Metabase** | Looker, Mode, Superset | | 建 Gold Collection |
| ✓ | CMS | **Contentful** | Sanity, Strapi | | AI 只 draft |
| ○ | 实验 / 内容态 / Flag | **Darklight** 或 LaunchDarkly | Unleash, Flagsmith | | 与发布门禁绑定 |
| ○ | 客户通讯 | **Front** | Zendesk, Intercom | | 回复 HITL |
| ○ | 通话 | **Aircall** | Dialpad 等 | | 转写脱敏 |
| ○ | Customer 360 / CRM | **Salesforce** | HubSpot | Sales 主责；只读 MCP 优先 |
| ○ | HRIS / People | **Rippling** | BambooHR, Workday, Deel | 入离职权威源 |
| ○ | 合同 / Offer 文件 | **PandaDoc** | DocuSign, HelloSign | 发送签署 HITL |

---

## C2. GTM 与 People（按团队必选）

| 团队 | 必选 | 职责 | 示例产品 | Owner | AI 默认权限 |
|------|:----:|------|----------|-------|-------------|
| Sales | ✓ | CRM 真相源 | **Salesforce** | | 读机会/账户；关单/改价 HITL |
| Sales | ○ | 通话/会议入库 SF | Zoom + Aircall → SF | | 纪要草稿可自动 |
| People | ✓ | 员工生命周期 | **Rippling** | | Webhook→开通/吊销，非闲聊写 |
| People | ✓ | Offer/NDA/员工文件 | **PandaDoc** | | 只建草稿 |
| Sales + Legal | ✓ | MSA/订单/客户 NDA | **PandaDoc** | | 只建草稿；send HITL |
| CS | ○ | 工单 | Front | | 回复 HITL |

---

## D. 模型运行时与编排（L4–L7）

| 必选 | 职责 | 示例产品 | 等价替代 | Owner | 备注 |
|:----:|------|----------|----------|-------|------|
| ✓ | 统一模型客户端 | **OpenAI SDK**（指向 Gateway） | Vercel AI SDK, LangChain Chat | | `baseURL` 公司网关 |
| ✓ | 多模型路由 / 限流 / 计费 | **LLM Gateway** | LiteLLM, Portkey, OpenRouter（慎） | | 与 Key Gateway 可合一 |
| ✓ | 有状态 Agent 编排 | **LangGraph** | Temporal+workers, Inngest | | 人机节点 |
| ✓ | 系统集成工作流 | **n8n** | Make, Zapier, Temporal | | Zoom→Slack→Linear |
| ✓ | 编码助手 | **Codex** / Claude Coding / Cursor | Copilot | | 同 MCP 能力面 |
| ○ | PM 沙箱 | **Replit** | CodeSandbox, 内部 Studio | | Secrets=逻辑 key |
| ○ | Prompt 注册表 | Git + Langfuse | PromptLayer | | 版本化 |

---

## E. 评测、观测、质量（L5）

| 必选 | 职责 | 示例产品 | 等价替代 | Owner | 备注 |
|:----:|------|----------|----------|-------|------|
| ✓ | LLM Trace / 打分 / Dataset | **Langfuse** | LangSmith, Helicone, Phoenix | | 生产 Agent 全量 |
| ✓ | Eval Harness（门禁） | **自建 Harness** + CI | Promptfoo, DeepEval, Ragas | | 改 prompt 必跑 |
| ✓ | APM / RUM / 埋点 / 告警 | **Datadog** | Grafana Stack, New Relic | | AC 验证 |
| ✓ | 反馈 Bot 自动评估 | Slack Bot + LangGraph | | | 见 WF-01 |
| ○ | 错误追踪 | Sentry | Datadog Error Tracking | | 前端/后端 |
| ○ | 状态页 | Statuspage | Better Stack | | 对外 |

---

## F. 工程交付与安全

| 必选 | 职责 | 示例产品 | 等价替代 | Owner | 备注 |
|:----:|------|----------|----------|-------|------|
| ✓ | CI/CD | **GitHub Actions** | GitLab CI, Buildkite | | harness-gate job |
| ✓ | 依赖与安全 PR | Dependabot / Renovate | | | |
| ✓ | Feature Flag | LaunchDarkly / Darklight | Unleash | | AI 变更灰度 |
| ○ | IaC | Terraform | Pulumi | | Gateway/Auth0 |
| ○ | Oncall | PagerDuty | Opsgenie, Grafana OnCall | | Calendar 轮值 |
| ○ | 威胁检测 | 云厂商 GuardDuty 等 | | | 含异常 Agent 调用 |

---

## G. Plugin / 宿主安装清单

| 宿主 | Plugin / App 名称 | 必选 Skills | Owner |
|------|-------------------|-------------|-------|
| Slack | Company AI Bus | feedback-triage, metrics-answer, pre-meeting-brief, sales-opportunity-brief | |
| Cursor / Codex | company-ai-native | spec-authoring, pr-ai-review, agent-release | |
| Claude Project | Spec Studio | spec-authoring, meeting-to-actions | |
| Replit | pm-agent-sandbox | metrics-answer | |
| Salesforce | sales-copilot（侧栏/Slack） | sales-opportunity-brief | |
| Rippling + n8n | people-provisioner | people-lifecycle-sync | |
| PandaDoc | doc-copilot | pandadoc-draft | |
| GitHub Actions | harness-gate + secret-scan | — | |

MCP 明细见 [SKILLS-MCP-PLUGINS.md](./SKILLS-MCP-PLUGINS.md)。

---

## H. 最小 MCP 集合（第一期必须）

| MCP | 第一期 | 第二期 |
|-----|:------:|:------:|
| mcp-slack | ✓ | |
| mcp-linear | ✓ | |
| mcp-langfuse | ✓ | |
| mcp-harness | ✓ | |
| mcp-audit | ✓ | |
| mcp-algolia / knowledge | ○ | ✓ |
| mcp-calendar | ○ | ✓ |
| mcp-meeting / zoom | ○ | ✓ |
| mcp-metabase | ○ | ✓ |
| mcp-docs / figma | ○ | ✓ |
| mcp-contentful | | ✓ |
| mcp-front / aircall | | ✓ |
| mcp-salesforce | | ✓ |
| mcp-rippling | | ✓（People） |
| mcp-pandadoc | | ✓（People/Sales） |
| mcp-github | ○ | ✓ |
| mcp-datadog | ○ | ✓ |

---

## I. Slack 频道模板（直接建）

| 频道 | 用途 |
|------|------|
| `#feedback` | 反馈收集（Bot 监听） |
| `#feedback-triage` | 日摘要与争议 |
| `#sales-wins` | 赢单/丢单结构化回流（可选） |
| `#people-ops` | 入离职开通结果与失败告警（无薪酬明文） |
| `#ai-agents` | Agent 发版与 Harness 报告 |
| `#ai-costs` | Gateway 成本告警 |
| `#incidents` | 事故 |
| `#security-alerts` | 密钥/审计异常 |
| `#proj-<name>` | 项目频道（会议 Brief） |

---

## J. Linear 标签模板

```text
source:slack-feedback
source:meeting
source:front
source:aircall
source:salesforce
source:rippling
type:bug | type:request | type:incident
area:<product_area>
auto-filed
needs-harness
security
pii
```

---

## K. 环境与密钥命名规范

```text
# 1Password vaults
Shared-Dev / Shared-Staging / Shared-Prod / Shared-AI-Gateway

# 逻辑 key（发给应用的）
COMPANY_GATEWAY_KEY_DEV
COMPANY_GATEWAY_KEY_STAGING
COMPANY_GATEWAY_KEY_PROD

# Auth0
AUTH0_DOMAIN
AUTH0_M2M_CLIENT_ID
AUTH0_M2M_CLIENT_SECRET   # 仅 Gateway / Bot 运行时

# 可观测
LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY / LANGFUSE_BASE_URL
DATADOG_API_KEY / DATADOG_APP_KEY
```

**禁止**：`OPENAI_API_KEY` 直接出现在 Replit/前端/文档（应只在 Gateway 保险库）。

---

## L. 两周落地最小包（给其他团队的「先跑通」）

1. 建 `#feedback` + Linear team + 标签。
2. Auth0 应用（人）+ M2M（Bot）。
3. 1Password + Gateway 代理 OpenAI/Anthropic。
4. n8n 或 LangGraph：Slack 消息 → 分类 → Linear → 回帖（先人工确认按钮）。
5. Langfuse 接通；准备 30 条金标 → `harness-feedback-classifier`。
6. 文档里放 Endpoint Catalog 空表，先登记 Linear/Slack。

完成以上六步，即具备可复制的 AI Native 控制面雏形。

---

## M. 验收评分（发给团队自评）

| 项 | 0 分 | 1 分 | 2 分 |
|----|------|------|------|
| 反馈进 Linear | 纯手工 | 半自动 | Bot 评估+去重+回帖 |
| 密钥 | 散落 .env | 1Password | Gateway 逻辑 key + 审计 |
| 身份 | 共享账号 | SSO | 人/机分离 + scope |
| 评测 | 无 | Langfuse 只读 | Harness CI 门禁 |
| 会议行动 | 口头 | 人工纪要 | Calendar/Zoom 自动建单 |
| 销售上下文 | 口头 | SF 手查 | 会前 Bot Brief + 缺口进反馈 |
| 入离职权限 | 工单手工 | 半自动 | Rippling 驱动开通/吊销+审计 |
| 指标问答 | 截图 | 固定看板 | Bot 带 Question ID |
| 事故 | 群里喊 | 有频道 | 可切断 Agent 写权限 |
| 可复制性 | 口口相传 | 有文档 | 本清单+Skill/MCP 齐全 |

**建议达标**：总分 ≥ 12 / 20 再扩展新 Agent。

---

## N. 职责对照（换品牌时不要丢）

| 职责（不可丢） | 本清单默认 |
|----------------|------------|
| 身份 | Auth0 |
| 密钥保管 | 1Password |
| 密钥运行时 | API Key Gateway |
| 模型 SDK | OpenAI SDK |
| 协作聊天 | Slack |
| 任务 | Linear |
| 文档 | Google Docs |
| 设计 | Figma |
| 会议 | Zoom |
| 日程 | Google Calendar |
| 编排（集成） | n8n |
| 编排（推理） | LangGraph |
| LLM 观测 | Langfuse |
| 评测门禁 | Eval Harness |
| 产品观测 | Datadog |
| 分析 | Metabase |
| 检索 | Algolia |
| 内容 | Contentful + Darklight |
| 编码 | Codex / Cursor |
| PM 沙箱 | Replit |
| 客服 | Front |
| 电话 | Aircall |
| 销售 CRM | Salesforce |
| People HRIS | Rippling |
| 合同/Offer | PandaDoc |
| 审计 | Audit Log |

---

*版本：与 ai-native-org 文档同步维护。对外分享时附上 WORKFLOWS 中 WF-01 与本文件 L 节即可启动。*
