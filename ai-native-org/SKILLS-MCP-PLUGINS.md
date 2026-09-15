# Skills · MCP · Plugins 目录

> 目标：把「会用工具的人」变成「可调用的能力面」。Claude / Codex / Cursor / Slack Bot / LangGraph **共用同一套 MCP**；Skill 是给模型的操作手册；Plugin 是各宿主里的安装单元。

---

## 0. 三者区别（统一语言）

| 概念 | 是什么 | 例子 |
|------|--------|------|
| **MCP Server** | 给模型调用的工具/资源协议服务 | `mcp-linear` 提供 `create_issue` |
| **Skill** | 面向某类任务的步骤、约束与何时调用哪些 MCP | `skill-feedback-triage` |
| **Plugin** | 在宿主中的打包安装形态 | Cursor Plugin、Slack App、Claude Project Connector、浏览器插件 |
| **Agent** | 绑定若干 Skill + MCP + 模型 + 权限的运行实体 | `feedback-eval-bot` |
| **Harness** | 对 Agent/Skill 的自动化评测支架 | `harness-feedback-classifier` |

```text
Plugin（安装到 Cursor/Slack/Claude）
  └─ 暴露 Skills
       └─ 调用 MCP Servers
            └─ 经 API Key Gateway + Auth0
                 └─ 落 Audit / Langfuse
```

---

## 1. MCP Server 清单（建议开源内部实现）

每个 MCP 均经 **API Key Gateway**；写操作默认要求 HITL scope。

### 1.1 `mcp-auth`（内部，不直接给业务 Agent）

| Tool | 说明 |
|------|------|
| `whoami` | 当前 subject、scopes |
| `exchange_token` | 短时下调其他 MCP |

### 1.2 `mcp-linear`

| Tool | 权限 | 说明 |
|------|------|------|
| `list_issues` | read | 过滤 team/label/state |
| `get_issue` | read | |
| `create_issue` | write | 必须带 source 链接 |
| `update_issue` | write | 状态、priority、label |
| `link_issues` | write | duplicate/related |
| `search_issues` | read | 语义/关键词去重 |

**资源**：`linear://issue/{id}`、`linear://project/{id}`

### 1.3 `mcp-slack`

| Tool | 权限 | 说明 |
|------|------|------|
| `post_message` | write | 频道/线程 |
| `update_message` | write | |
| `add_reaction` | write | |
| `read_thread` | read | |
| `open_modal` | write | 追问表单 |

### 1.4 `mcp-calendar`

| Tool | 权限 | 说明 |
|------|------|------|
| `list_events` | read | 时间窗 |
| `get_event` | read | 含附件与描述 |
| `update_event_description` | write | 回写纪要链接（可选） |

### 1.5 `mcp-zoom` / `mcp-meeting`

| Tool | 说明 |
|------|------|
| `get_transcript` | 取转写 |
| `list_recordings` | |

### 1.6 `mcp-docs`（Google Docs/Drive）

| Tool | 说明 |
|------|------|
| `get_doc` | 导出 markdown |
| `search_drive` | |
| `append_heading` | 受控写（HITL） |

### 1.7 `mcp-figma`

| Tool | 说明 |
|------|------|
| `get_file_meta` | |
| `get_comments` | |
| `export_node_text` | 抽取文案与标注 |
| `get_tokens` | 若有 token 管道 |

### 1.8 `mcp-metabase`

| Tool | 说明 |
|------|------|
| `list_questions` | 仅 Gold Collection |
| `run_question` | 按 ID 跑，禁自由 SQL |
| `get_dashboard` | |

### 1.9 `mcp-algolia`

| Tool | 说明 |
|------|------|
| `search` | 知识/反馈/文档索引 |
| `save_object` | 仅知识管道服务账号 |

### 1.10 `mcp-contentful` / `mcp-darklight`

| Tool | 说明 |
|------|------|
| `create_draft` | |
| `update_draft` | |
| `publish` | **HITL only** |
| `list_entries` | |

### 1.11 `mcp-langfuse`

| Tool | 说明 |
|------|------|
| `get_trace` | |
| `score_trace` | |
| `list_dataset_items` | |
| `enqueue_dataset_item` | bad case 入库 |

### 1.12 `mcp-datadog`

| Tool | 说明 |
|------|------|
| `query_metrics` | |
| `query_logs` | 受限 |
| `post_event` | |

### 1.13 `mcp-front` / `mcp-aircall`

| Tool | 说明 |
|------|------|
| `get_conversation` | 脱敏视图 |
| `draft_reply` | 不直接发送 |
| `get_call_transcript` | |

### 1.13b `mcp-salesforce`

| Tool | 权限 | 说明 |
|------|------|------|
| `get_account` | read | Account + 关键字段 |
| `get_opportunity` | read | 阶段、金额、Close Date、竞品 |
| `search` | read | Lead/Contact/Oppty |
| `list_activities` | read | Task/Event 最近 N 条 |
| `draft_note` | write | 写草稿笔记，不改 Stage |
| `suggest_stage` | write | 仅建议；真正 Closed* 需 HITL |
| `log_product_feedback` | write | 创建反馈候选打到 WF-01 |

**禁默认开放**：`update_amount`、`delete_record`、批量导出。

### 1.13c `mcp-rippling`

| Tool | 权限 | 说明 |
|------|------|------|
| `get_worker` | read | 在职状态、部门、经理、start/end |
| `list_upcoming_starts` | read | 入职管道 |
| `list_terminations` | read | 离职管道 |
| `get_org_chart_edge` | read | 汇报关系（路由审批用） |

实际开通/吊销由 **Identity Provisioner**（n8n/内部服务）消费 Rippling Webhook 完成，不交给通用对话 Agent。

### 1.13d `mcp-pandadoc`

| Tool | 权限 | 说明 |
|------|------|------|
| `list_templates` | read | Offer / NDA / MSA |
| `create_draft_from_template` | draft_write | 填字段生成草稿 |
| `get_document` | read | 状态、签署方 |
| `summarize_diff` | read | 相对模板的条款差异 |
| `send_document` | publish | **HITL only** |
| `void_document` | admin | **HITL + break-glass** |

### 1.14 `mcp-github`

| Tool | 说明 |
|------|------|
| `create_pr_comment` | |
| `get_file` | |
| `list_ci_runs` | |

### 1.15 `mcp-harness`

| Tool | 说明 |
|------|------|
| `run_suite` | 跑命名评测集 |
| `get_last_report` | |
| `compare_versions` | agent@v1 vs v2 |

### 1.16 `mcp-audit`（只写/只读审计查询）

| Tool | 说明 |
|------|------|
| `emit` | 服务端用 |
| `search` | security 角色 |

### 1.17 `mcp-knowledge`（聚合）

| Tool | 说明 |
|------|------|
| `search` | 打到 Algolia + Docs + 会议决策 |
| `get_decision` | 按 ID 取决策卡 |
| `upsert_decision` | 知识园丁角色 |

### 1.18 `mcp-secrets`（**禁止**进入用户对话 Agent）

仅 Gateway 边车：`resolve(logical_name)` → 短时凭证。

---

## 2. Skill 清单（具体内容可直接复制为 SKILL.md）

### Skill：`feedback-triage`

```yaml
name: feedback-triage
description: 处理 Slack 反馈：分类、去重、评估、写入 Linear 并回复线程
when_to_use:
  - Slack #feedback 新消息
  - 用户要求评估某条反馈
mcp:
  - mcp-slack
  - mcp-linear
  - mcp-algolia
  - mcp-harness
  - mcp-langfuse
  - mcp-audit
steps:
  - 读取消息与线程
  - 调用分类 schema（type/severity/area/...）
  - search 去重
  - run 在线 eval scorecard
  - create_or_link linear issue
  - 线程回复摘要 + 按钮说明
constraints:
  - 不在描述中粘贴邮箱/电话明文
  - S0 必须通知 #incidents
  - confidence<0.75 只追问不建单（除非用户强制）
evaluation:
  harness: harness-feedback-classifier
  threshold: 0.85
```

### Skill：`meeting-to-actions`

```yaml
name: meeting-to-actions
description: 从 Zoom 转写与 Calendar 事件提取决策与 Action Item 并建 Linear
mcp: [mcp-meeting, mcp-calendar, mcp-linear, mcp-slack, mcp-knowledge]
constraints:
  - 每个 action 必须有 owner_email 或标 unassigned
  - 决策写入 knowledge.upsert_decision
```

### Skill：`pre-meeting-brief`

```yaml
name: pre-meeting-brief
description: 会前 30 分钟推送上下文简报
mcp: [mcp-calendar, mcp-linear, mcp-knowledge, mcp-slack]
```

### Skill：`stakeholder-catchup-brief`

```yaml
name: stakeholder-catchup-brief
description: 为 Stakeholder Catchup 生成一页纸（交付/下一步/待决策/风险/上次承诺），会后把承诺写入 Linear
when_to_use:
  - Calendar 标题含 [Stakeholder]
  - PM 请求 /catchup-brief
mcp: [mcp-calendar, mcp-docs, mcp-linear, mcp-metabase, mcp-salesforce, mcp-slack, mcp-knowledge]
steps:
  - 拉取上次同系列 Catchup 的 stakeholder-commit 未闭环项
  - 汇总承诺级进度与指标（非全量看板）
  - 生成一页纸并分享
  - 会后：决策卡 + create/update Linear label stakeholder-commit
  - 客户场：draft Salesforce note（HITL）
constraints:
  - 不替团队承诺日期
  - 新想法只进 ready-for-review，不当场开干
  - 不自动改 SF Stage/Amount
```

### Skill：`spec-authoring`

```yaml
name: spec-authoring
description: 用固定模板产出 AI Feature Spec / PRD
mcp: [mcp-docs, mcp-linear, mcp-figma]
output_schema: [problem, users, scenario, ac[], out_of_scope, metrics, agent_requirements]
```

### Skill：`metrics-answer`

```yaml
name: metrics-answer
description: 只通过 Metabase Gold Question 回答指标问题
mcp: [mcp-metabase, mcp-slack]
constraints:
  - 禁止自由 SQL
  - 答案必须含 question_id
```

### Skill：`support-summarize`

```yaml
name: support-summarize
description: 摘要 Front/Aircall 并可选回流反馈管道
mcp: [mcp-front, mcp-aircall, mcp-linear, mcp-contentful, mcp-salesforce]
constraints:
  - draft_reply 不发送
  - publish FAQ 需 HITL
```

### Skill：`sales-opportunity-brief`

```yaml
name: sales-opportunity-brief
description: 会前基于 Salesforce 生成客户/机会简报，并可把产品缺口送入反馈管道
when_to_use:
  - Calendar 客户会前
  - AE 在 Slack 请求 /brief deal
mcp: [mcp-salesforce, mcp-calendar, mcp-slack, mcp-linear, mcp-knowledge]
constraints:
  - 不自动改 Stage/Amount
  - 赢丢单原因结构化后，产品缺口走 feedback-triage
```

### Skill：`people-lifecycle-sync`

```yaml
name: people-lifecycle-sync
description: 消费 Rippling 入离职事件，驱动账号开通/吊销与审计（供 Provisioner 使用）
mcp: [mcp-rippling, mcp-audit, mcp-slack]
constraints:
  - 不在对话里展示薪酬明文
  - 离职吊销失败必须 P0 告警
runtime: n8n-or-internal-worker  # 非闲聊 Agent
```

### Skill：`pandadoc-draft`

```yaml
name: pandadoc-draft
description: 从 Rippling/Salesforce 字段生成 PandaDoc 草稿并做条款差异摘要
mcp: [mcp-pandadoc, mcp-rippling, mcp-salesforce, mcp-slack]
constraints:
  - send/void 必须 HITL
  - 补偿与定价字段不进公开频道
```

### Skill：`agent-release`

```yaml
name: agent-release
description: 对比 Harness 报告、写版本笔记、请求流量切换
mcp: [mcp-harness, mcp-langfuse, mcp-github, mcp-slack]
constraints:
  - harness 未通过禁止标 prod
```

### Skill：`incident-ai-cutswitch`

```yaml
name: incident-ai-cutswitch
description: 事故时切断 Agent 写权限并保留只读诊断
mcp: [mcp-audit, mcp-datadog, mcp-slack, mcp-linear]
# 实际切断在 Gateway API，不经通用 Agent
```

### Skill：`knowledge-garden`

```yaml
name: knowledge-garden
description: 合并冲突决策、过期文档下线、重建索引
mcp: [mcp-knowledge, mcp-docs, mcp-algolia]
```

### Skill：`pr-ai-review`

```yaml
name: pr-ai-review
description: 对 PR 做风险审查：密钥、缺失埋点、无 AC、Agent 无 harness
mcp: [mcp-github, mcp-harness, mcp-datadog]
```

---

## 3. Plugin 清单（按宿主）

### 3.1 Slack App：`Company AI Bus`

| 能力 | 实现 |
|------|------|
| `/feedback` | 打开反馈模态框 |
| 事件订阅 | `message.channels` on `#feedback` |
| 交互按钮 | 确认类型、转人工、重评 |
| Slash `/brief` | 拉取会前简报 |
| Slash `/metrics` | 调 metrics-answer |
| Home Tab | 我的开放 Linear、今日反馈队列 |

### 3.2 Cursor / Codex Plugin：`company-ai-native`

| 组件 | 内容 |
|------|------|
| MCP 连接 | linear, github, metabase(只读), langfuse, harness, knowledge |
| Skills | spec-authoring, pr-ai-review, agent-release |
| Rules | 禁止提交裸 API Key；改 prompt 必须跑 harness |
| Hooks | PR 打开时自动贴评测状态 |

### 3.3 Claude Project / Connector

| 组件 | 内容 |
|------|------|
| Project Knowledge | ADR、AI Feature Spec 模板、路由表 |
| Connectors | MCP：docs, linear, knowledge |
| Skills | spec-authoring, meeting-to-actions（只读整理） |

### 3.4 Replit Plugin/Template：`pm-agent-sandbox`

| 组件 | 内容 |
|------|------|
| Secrets | 仅 `COMPANY_GATEWAY_KEY` + Auth0 M2M |
| Endpoint allowlist | 来自 Catalog JSON |
| Starter Agents | metrics-answer, feedback simulator |
| OpenAI SDK | baseURL → Gateway |

### 3.5 GitHub App / Action Plugin

| Action | 内容 |
|--------|------|
| `harness-gate` | paths: `agents/**`, `prompts/**` |
| `secret-scan` | gitleaks |
| `audit-emit` | 发 release 审计事件 |

### 3.6 浏览器插件（可选）

| 能力 | 说明 |
|------|------|
| 选中网页/Admin → 「送去 #feedback」 | 带 URL 与截图 |
| Contentful 侧栏「AI Draft」 | 调 create_draft |

---

## 4. Agent 实例（运行实体）

| Agent | Skills | 权限档 | 宿主 |
|-------|--------|--------|------|
| `feedback-eval-bot` | feedback-triage | write:linear,slack | Slack + LangGraph |
| `meeting-scribe` | meeting-to-actions | write:linear,slack | n8n 触发 |
| `calendar-briefer` | pre-meeting-brief | read+slack post | n8n cron |
| `data-copilot` | metrics-answer | read:metabase | Slack |
| `support-copilot` | support-summarize | read+draft | Front 侧栏 |
| `sales-copilot` | sales-opportunity-brief | read:sf + slack | Slack / Calendar |
| `people-provisioner` | people-lifecycle-sync | identity write | n8n worker |
| `doc-copilot` | pandadoc-draft | draft:pandadoc | People/Sales HITL |
| `coding-copilot` | spec-authoring, pr-ai-review | read+github comment | Cursor/Codex |
| `release-copilot` | agent-release | harness+langfuse | CI / Slack |

全部走：**Auth0 M2M → Gateway → MCP → Audit/Langfuse**。

---

## 5. Harness 套件

| Harness | 测什么 | 门禁 |
|---------|--------|------|
| `harness-feedback-classifier` | type/severity/area vs 金标 | PR + 日更 |
| `harness-dedup` | 是否正确挂 duplicate | PR |
| `harness-meeting-actions` | action 抽取完整度/幻觉 owner | 周更 |
| `harness-metrics-grounding` | 是否引用 question_id、数字误差 | PR |
| `harness-pii-redaction` | PII 是否泄漏到 Linear/Slack | 强制 |
| `harness-tool-policy` | 无 scope 时是否拒写 | 强制 |

**最小评测项格式**

```json
{
  "id": "fb-017",
  "input": { "text": "支付成功但权益未到账，订单 123" },
  "expect": {
    "type": "bug",
    "severity": "S1",
    "area": "billing",
    "must_not_contain_in_linear_description": ["身份证", "完整手机号"]
  }
}
```

---

## 6. Prompt / Tool Schema 片段（反馈分类）

```json
{
  "name": "classify_feedback",
  "description": "Normalize a Slack feedback message into a structured ticket proposal",
  "parameters": {
    "type": "object",
    "required": ["type", "severity", "product_area", "summary", "confidence"],
    "properties": {
      "type": {
        "enum": ["bug", "request", "question", "praise", "incident", "spam"]
      },
      "severity": { "enum": ["S0", "S1", "S2", "S3"] },
      "product_area": { "type": "string" },
      "summary": { "type": "string", "maxLength": 120 },
      "repro_steps": { "type": "array", "items": { "type": "string" } },
      "confidence": { "type": "number", "minimum": 0, "maximum": 1 },
      "questions_for_user": { "type": "array", "items": { "type": "string" } }
    }
  }
}
```

---

## 7. 权限矩阵（Skill × 危险操作）

| Skill | 建 Linear | 发 Slack | 读 PII | 发布内容 | 调 Gateway 管理 API |
|-------|-----------|----------|--------|----------|---------------------|
| feedback-triage | ✓ | ✓ | 脱敏 | ✗ | ✗ |
| meeting-to-actions | ✓ | ✓ | 低 | ✗ | ✗ |
| metrics-answer | ✗ | ✓ | ✗ | ✗ | ✗ |
| support-summarize | ✓ | ✓ | 脱敏 | HITL | ✗ |
| sales-opportunity-brief | ✓* | ✓ | 低 | ✗ | ✗ |
| people-lifecycle-sync | ✗ | ✓ | 高(受限) | ✗ | ✓（身份） |
| pandadoc-draft | ✗ | ✓ | 高(受限) | HITL(send) | ✗ |
| agent-release | ✗ | ✓ | ✗ | ✗ | HITL |
| incident-ai-cutswitch | ✓ | ✓ | ✓ | ✗ | ✓（受限角色） |

\*仅创建产品回流 Issue，不改 SF 金额/关单。

---

## 8. 落地顺序（复制到团队看板）

1. 先上 `mcp-linear` + `mcp-slack` + Skill `feedback-triage`（人工确认按钮开着）
2. 接 Gateway + OpenAI SDK + Langfuse
3. 上 `harness-feedback-classifier` 与 PII harness
4. 再开 Calendar/Zoom、Metabase、Contentful
5. 接入 `mcp-salesforce`（只读 Brief）与 `mcp-rippling`（Provisioner）
6. `mcp-pandadoc` 仅 draft；send 保持 HITL
7. 最后才把 HITL 按钮对高置信度 case 默认折叠（仍可回放）

完整工具采购/账号清单见 [TOOLKIT-CHECKLIST.md](./TOOLKIT-CHECKLIST.md)。
