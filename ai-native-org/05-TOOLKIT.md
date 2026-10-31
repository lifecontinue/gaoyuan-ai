# 05 · 工具清单（可复制）

发给协作团队或新 BU。按必选 / 推荐 / 可选勾选；名称可换，**职责列不要删**。填 Owner / Backup / 环境。

配套：[架构](./01-ARCHITECTURE.md) · [工作流](./02-WORKFLOWS.md) · [节奏](./03-ORG-CADENCE.md) · [Agent](./04-AGENTS-RUNTIME.md)

---

## A. 身份、密钥、审计

| 必选 | 职责 | 示例 | 等价 | Owner | 备注 |
|:----:|------|------|------|-------|------|
| ✓ | SSO / 人机身份 / M2M | **Auth0** | Okta, Keycloak | | Agent 用 M2M |
| ✓ | 密钥真相源 | **1Password** | Bitwarden | | 禁止聊天传 key |
| ✓ | API Key / 模型统一出口 | **API Key Gateway** | LiteLLM, Portkey | | 业务持逻辑 key |
| ✓ | 统一模型客户端 | **OpenAI SDK** → Gateway | 兼容 SDK | | 统一 baseURL |
| ✓ | 审计 | Audit → Datadog/Lake | Splunk, ELK | | Agent 不可删 |
| ✓ | 策略 HITL | Gateway + Auth0 Actions | OPA | | publish 默认人审 |
| ○ | 密钥扫描 | Gitleaks + GitHub Scanning | Trufflehog | | CI |
| ○ | 办公套件生命周期 | **Google Workspace** | M365 | | offboarding |

---

## B. 协作与知识总线

| 必选 | 职责 | 示例 | 等价 | 备注 |
|:----:|------|------|------|------|
| ✓ | 即时协作 + 反馈 | **Slack** | Teams | `#feedback` `#incidents` |
| ✓ | 任务队列 | **Linear** | Jira | 自动建单字段约定 |
| ✓ | 文档 / Spec / ADR | **Google Docs** + Canvas | Notion, Confluence | Issue 回链 |
| ✓ | 设计 | **Figma** | Penpot | 可被 MCP 读 |
| ✓ | 会议转写 | **Zoom** | Meet | 需转写 |
| ✓ | 日历触发 | **Google Calendar** | Outlook | Brief / Cycle |
| ✓ | 需求强推理 | **Claude** | ChatGPT | Spec 模板化 |
| ✓ | 代码托管 | **GitHub** | GitLab | Prompt/Harness 入库 |
| ○ | 白板 | Miro / FigJam | | 结论必须回 Docs |
| ○ | 检索索引 | **Algolia** | ES, Typesense | 含反馈去重 |

---

## C. 数据、内容、分析

| 必选 | 职责 | 示例 | 备注 |
|:----:|------|------|------|
| ✓ | 数据湖 | **Data Lake** | Agent 不直连 Bronze |
| ✓ | 语义查询 | **Metabase** | Gold Collection |
| ✓ | CMS | **Contentful** | AI 只 draft |
| ○ | 实验/内容态 | **Darklight** / LaunchDarkly | 发布门禁 |
| ○ | 客服 | **Front** | 回复 HITL |
| ○ | 通话 | **Aircall** | 转写脱敏 |
| ○ | CRM | **Salesforce** | Sales；只读优先 |
| ○ | HRIS | **Rippling** | 入离职权威源 |
| ○ | 合同/Offer | **PandaDoc** | send HITL |

---

## D. 模型、编排、编码

| 必选 | 职责 | 示例 | 备注 |
|:----:|------|------|------|
| ✓ | 有状态 Agent | **LangGraph** | 人机节点 |
| ✓ | 系统胶水 | **n8n** | Zoom→Slack→Linear |
| ✓ | LLM 观测 | **Langfuse** | 生产全量 |
| ✓ | Eval 门禁 | **Harness** + CI | 改 prompt 必跑 |
| ✓ | 编码助手 | **Codex** / Cursor | 同仓库规则 |
| ✓ | APM/埋点 | **Datadog** | 对照 AC |
| ○ | PM 沙箱 | **Replit** | Secrets=逻辑 key；Endpoint=Catalog |
| ○ | Feature Flag | Darklight / LD | AI 变更灰度 |

---

## E. GTM / People 按团队必选

| 团队 | 必选 | 职责 | 产品 | AI 默认 |
|------|:----:|------|------|---------|
| Sales | ✓ | CRM | Salesforce | 读；关单/改价 HITL |
| People | ✓ | 生命周期 | Rippling | Webhook→开通吊销 |
| People | ✓ | Offer/NDA | PandaDoc | 只草稿 |
| Sales+Legal | ✓ | MSA/订单 | PandaDoc | send HITL |
| CS | ○ | 工单 | Front | 回复 HITL |

---

## F. Plugin / 宿主

| 宿主 | 名称 | 关键 Skills |
|------|------|-------------|
| Slack | Company AI Bus | feedback-triage, metrics-answer, pre-meeting-brief, stakeholder-catchup-brief, sales-opportunity-brief |
| Cursor / Codex | company-ai-native | repo-delivery, spec-authoring, pr-ai-review, agent-release |
| Claude Project | Spec Studio | spec-authoring, meeting-to-actions |
| Replit | pm-agent-sandbox | metrics-answer（只读） |
| GitHub Actions | harness-gate + secret-scan | — |
| n8n | people-provisioner 等 | people-lifecycle-sync |

---

## G. 最小 MCP 分期

| MCP | 一期 | 二期 |
|-----|:----:|:----:|
| slack, linear, langfuse, harness, audit | ✓ | |
| calendar, meeting, metabase, docs, github, datadog | ○ | ✓ |
| contentful, front, aircall, salesforce | | ✓ |
| rippling, pandadoc | | ✓（People/Sales） |
| algolia / knowledge | ○ | ✓ |

---

## H. Slack 频道模板

| 频道 | 用途 |
|------|------|
| `#feedback` | 反馈（Bot 监听） |
| `#feedback-triage` | 日摘要与争议 |
| `#ai-agents` | Agent 发版与 Harness |
| `#ai-costs` | Gateway 成本 |
| `#incidents` | 事故 |
| `#security-alerts` | 密钥/审计异常 |
| `#sales-wins` | 赢丢单回流（可选） |
| `#people-ops` | 入离职结果（无薪酬明文） |
| `#proj-<name>` | 项目频道 |
| `#squad-<name>` | Standup 相关 |

---

## I. Linear 标签模板

```text
source:slack-feedback | source:meeting | source:front | source:aircall
source:salesforce | source:rippling | source:stakeholder | source:training
type:bug | type:request | type:incident
area:<product_area>
auto-filed | stakeholder-commit | ready-for-review
needs-harness | security | pii | training-gap | from-meeting
```

---

## J. 密钥命名

```text
Vaults: Shared-Dev / Shared-Staging / Shared-Prod / Shared-AI-Gateway

COMPANY_GATEWAY_KEY_DEV | _STAGING | _PROD
AUTH0_DOMAIN | AUTH0_M2M_CLIENT_ID | AUTH0_M2M_CLIENT_SECRET
LANGFUSE_PUBLIC_KEY | LANGFUSE_SECRET_KEY | LANGFUSE_BASE_URL
DATADOG_API_KEY | DATADOG_APP_KEY
```

禁止：`OPENAI_API_KEY` 直接出现在 Replit / 前端 / 文档。

---

## K. 两周最小包

1. `#feedback` + Linear team + 标签  
2. Auth0：人 + M2M（Bot）  
3. 1Password + Gateway 代理 OpenAI/Anthropic  
4. n8n 或 LangGraph：Slack → 分类 → Linear → 回帖（人工确认按钮开着）  
5. Langfuse；30 条金标 → harness-feedback-classifier  
6. Endpoint Catalog 空表，先登记 Linear/Slack  

---

## L. 验收自评（建议 ≥12/20 再扩新 Agent）

| 项 | 0 | 1 | 2 |
|----|---|---|---|
| 反馈进 Linear | 手工 | 半自动 | Bot 评估+去重+回帖 |
| 密钥 | 散落 .env | 1Password | Gateway 逻辑 key+审计 |
| 身份 | 共享账号 | SSO | 人机分离+scope |
| 评测 | 无 | Langfuse 只读 | Harness CI 门禁 |
| 会议行动 | 口头 | 人工纪要 | Calendar/Zoom→Linear |
| 销售上下文 | 口头 | SF 手查 | 会前 Brief+缺口进反馈 |
| 入离职 | 手工工单 | 半自动 | Rippling 驱动+审计 |
| 指标问答 | 截图 | 固定看板 | Bot+Question ID |
| 事故 | 群里喊 | 有频道 | 可切断 Agent 写权限 |
| 可复制性 | 口口相传 | 有文档 | 本清单+Skill/MCP 齐 |

---

## M. 职责对照（换品牌勿丢）

| 职责 | 默认 |
|------|------|
| 身份 | Auth0 |
| 密钥保管 | 1Password |
| 密钥运行时 | API Key Gateway |
| 模型 SDK | OpenAI SDK |
| 协作 | Slack |
| 任务 | Linear |
| 文档 | Google Docs / Canvas |
| 设计 | Figma |
| 会议/日历 | Zoom / Google Calendar |
| 编排集成 | n8n |
| 编排推理 | LangGraph |
| LLM 观测 | Langfuse |
| 评测 | Harness |
| 产品观测 | Datadog |
| 分析 | Metabase |
| 湖/检索 | Data Lake / Algolia |
| 内容 | Contentful + Darklight |
| 编码 | Codex / Cursor |
| PM 沙箱 | Replit |
| 客服/电话 | Front / Aircall |
| CRM | Salesforce |
| HRIS | Rippling |
| 合同 | PandaDoc |
| 审计 | Audit Log |

下一篇：[06-ONBOARDING.md](./06-ONBOARDING.md)
