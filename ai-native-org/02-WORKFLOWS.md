# 02 · 端到端工作流

默认：涉及模型写 Langfuse Trace；涉及写操作写 Audit。任务产品真相源用 **Linear**；工程合并用 **GitHub PR**。

---

## 总览

```text
信号源                         处理                              出口
────────                       ────                              ────
Claude Spec / Figma            → 评审包 → Linear Cycle           → Eng + Codex
Zoom / Calendar                → n8n + Meeting Scribe            → Slack + Linear
Slack #feedback                → Eval Bot + Harness              → Linear + 线程回复
Front / Aircall                → 摘要 Agent                      → Linear / FAQ / SF
Salesforce 机会 / 丢单原因     → GTM Copilot                     → Brief / #feedback
Rippling 入离职                → Identity Provisioner            → Auth0 / Gateway 吊销
PandaDoc                       → Doc Copilot（HITL）             → SF / Rippling 回写
Metabase 提问                  → Data Bot（Gold only）           → Slack + 可选 Docs
Datadog 告警                   → 路由                            → #incidents
Harness 失败（CI）             → 门禁                            → 阻断合并 / Linear
Calendar Cycle 边界            → 定时 Bot                        → 进度摘要
```

---

## WF-01 反馈闭环（核心）：Slack → Bot 评估 → Linear

### 频道

| 频道 | 用途 |
|------|------|
| `#feedback` | 用户/内部产品反馈主收集 |
| `#feedback-triage` | Bot 日报、人审争议 |
| `#feedback-auto` | 可选：自动化 debug 日志 |

### 触发

1. 频道新消息（非 Bot）
2. Emoji：`:bug:` `:bulb:` `:wave:`（重评）
3. 线程 `@FeedbackBot reevaluate`

### 步骤

```text
1. Ingest
   message + 近 20 条线程 + 作者 + 截图 URL
   → feedback_id；Audit(feedback.ingest)

2. Normalize（可先规则）
   语言、去纯表情、抽链接/环境/版本

3. Classify（LLM via Gateway + OpenAI SDK）
   type: bug | request | question | praise | incident | spam
   product_area, severity S0–S3, reproducibility, confidence

4. Dedup
   Algolia + Linear 近 30 天相似 → 挂 duplicate，不新建

5. Evaluate（Harness 在线 + 规则）
   缺 repro？含 PII？是否值得做？
   → priority 建议；是否自动建单

6. Act
   confidence ≥ 阈值且 type∈{bug,request,incident} → 创建/更新 Linear
   低置信或缺信息 → 线程追问
   spam → 标记关闭
   S0 → 同时 #incidents（HITL）

7. Reply
   类型、严重度、Linear 链接或追问
   按钮：确认 / 改优先级 / 不是重复 / 转人工

8. Observe
   Langfuse traces；Datadog 计数；每日摘要 → #feedback-triage
```

### Linear 字段映射

| Linear | 来源 |
|--------|------|
| Title | Bot 一句话问题陈述 |
| Description | 原文引用（脱敏）+ scorecard + Slack 深链 |
| Priority | severity × impact |
| Labels | `source:slack-feedback`, `type:*`, `area:*`, `auto-filed` |
| Assignee | area routing 表；否则 triage owner |
| Relations | duplicate / related |
| Custom feedback_id / eval_score | Slack ts；0–100 |

### 门禁与指标

- 付款/安全/删数据：只建单+告警，不改生产
- PII：描述脱敏，原文进受控存储
- 「转人工」后停止自动状态机
- 目标例：自动建单 24h 内 type 未改 ≥80%；重复建单 ≤10%；Bot 中位首次响应 ≤2min

### 状态机

```text
received → classifying → evaluated →
  ├─ needs_info →（用户回复）→ classifying
  ├─ linked_duplicate → closed
  ├─ filed_linear → in_triage → in_progress → done
  └─ rejected → closed
```

---

## WF-02 会议闭环：Calendar + Zoom → Action → Linear / Slack

```text
Calendar 会议结束 / Zoom recording ready
  → n8n 拉转写
  → LangGraph「Meeting Scribe」
      decisions[] / action_items[{owner_email,text,due}] / risks[] / open_questions[]
  → 每个 action → Linear（label: from-meeting）+ Slack @owner 或频道
  → 纪要链回 Calendar 描述 / Google Doc
  → Audit + Algolia 索引
```

**会前 T-30min**

```text
Bot 读：与会人、相关 Linear project、上次同标题会议决策
  → Brief → 会议频道或 DM
```

规则：负责人猜不准标 `unassigned`，禁止乱 @；决策写入知识库决策卡。

---

## WF-03 需求建造：Claude Spec → Linear → Code → 发布

```text
Claude（+ Canvas）产出 AI Feature Spec / PRD
  → Google Docs，链 Linear Project
  → Figma「ready for eng」→ n8n 可选通知
  → Weekly 需求评审通过 → 进 Cycle；每条 AC ↔ Issue 或 checklist
  → Eng 用 Codex / Cursor 实现（读仓库 AGENTS 规则）
  → GitHub PR
      CI：lint / test / secret scan
      改 agents|prompts → Harness gate
  → Review 合并
  → Feature Flag / Darklight 灰度
  → Datadog 看板对照 AC
  → 未达标 → Linear regression
```

Spec 最小章节：problem、users、scenario、ac[]、out_of_scope、metrics、agent_requirements（要否新 Endpoint / 新工具）。

---

## WF-04 数据洞察：提问 → Metabase Gold → 结论

```text
Slack @DataBot「上周 retention？」
  → 鉴权（Auth0 / Slack 用户映射）
  → 只允许 Metabase Gold Collection
  → 返回：数字 + Question ID + 图链 + 注意事项
  → 可选：贴 Docs 并链 Linear 决策
```

禁止：Bot 对 Lake 跑任意 SQL（除非独立只读沙箱 + 强 Audit）。

PM 在 Replit：用 Catalog 里的只读 metrics endpoint；结果仍应带来源 ID。

---

## WF-05 Agent 改进：Trace → Bad case → Harness → 晋升

```text
Langfuse 线上失败 / 低分
  → 抽样进 Dataset
  → 修 Prompt / LangGraph
  → 本地 + CI 跑 Eval Harness
  → 分数 ≥ 阈值且 Review 通过
  → 标记 version prod
  → Gateway 切流量百分比
  → A/B 指标进 Metabase
```

---

## WF-06 客户信号：Front / Aircall / Salesforce → 产品回流

```text
Front 标签 product-bug
或 Aircall 通话结束
或 SF 赢/丢单 feature gap 字段
  → 转写/正文摘要（脱敏）
  → 与 WF-01 同一 Classify / Dedup
  → Linear 或 Contentful FAQ 草稿（publish 人审）
  → 可选：SF Task「已同步 Linear XXX」
```

---

## WF-07 Sales：Salesforce 驱动

```text
Calendar 客户会前 30min
  → 读 Account + Opportunity + 最近 Activity
  → Brief（痛点、竞品、异议、相关 Linear）
  → AE 的 Slack DM / 机会频道

Stage = Closed Lost / Won
  → 结构化原因 / 竞品 / 产品缺口
  → 缺口 → #feedback（WF-01）
  → 赢单 → CS onboarding checklist（Linear project）

Zoom 纪要关联机会
  → 摘要写入 SF Note（HITL 或自动+可编辑）
```

门禁：改 Amount、Close Date、Closed* Stage → 默认人确认；Bot 可建议不可静默提交。

---

## WF-08 People：Rippling 入离职

```text
Hired / start_date-1
  → Google Workspace + Slack + Auth0 组
  → 角色模板：Linear team、1Password vault、Gateway 逻辑 key 档位
  → Onboarding Doc（Skills 列表，不是 20 个口令）
  → Audit: identity.provision

Terminated / last_day
  → 吊销 Auth0、Gateway keys、1Password、GitHub、Salesforce、生产权限
  → Slack 停用；开放 Issue 转交
  → Audit: identity.revoke（失败 = P0）
```

部门/经理变更：同步 Slack user group 与审批路由。

---

## WF-09 PandaDoc：Offer / 合同

```text
People：Rippling 到 Offer
  → 模板填字段（敏感字段不进 Slack）
  → 草稿 → People HITL → Send → 回写 Rippling

Sales：Opportunity 到 Contract
  → 拉 SF 字段生成草稿
  → AE/法务 HITL → Send
  → 签署完成：回写 SF + 通知 Finance/CS
```

门禁：价格、补偿、法律条款 diff 必须人看；禁止 Agent 直接 `send` / `void`（除非 break-glass + Audit）。

---

## WF-10 密钥申请与轮换

```text
申请新模型 / SaaS 能力
  → Catalog 审批 Endpoint + Auth0 scope
  → 1Password 存厂商 key
  → Gateway 注册逻辑 key 与配额
  → 业务只配 COMPANY_GATEWAY_KEY
  → 月度轮换；泄露：吊销 + Incident
  → 离职：以 Rippling 为权威触发（WF-08）
```

---

## WF-11 事故

```text
Datadog / 用户 / Bot 异常
  → #incidents + Oncall（Calendar）
  → Agent 相关：Gateway 切断该 agent 写权限
  → 修复 + Harness 回归
  → 复盘 Doc → Linear 改进 → 更新 Skill / Runbook
```

---

## WF-12 Contentful / Darklight 发布

```text
AI 生成 draft（Contentful）
  → 编辑人审
  → Darklight / Flag 控制可见态
  → publish（HITL）
  → Datadog / 业务指标观察
  → 异常：关 Flag 回滚可见性
```

---

## 路由表示例（area → Linear team）

| product_area | Linear Team | Slack |
|--------------|-------------|-------|
| auth | Platform | `#team-platform` |
| billing | Growth | `#team-growth` |
| editor | Product | `#team-product` |
| ai-agent | AI Platform | `#team-ai` |
| unknown | Triage | `#feedback-triage` |

---

## 失败降级

| 失败 | 降级 |
|------|------|
| LLM Gateway 超时 | 规则分类 + 「待评估」Linear |
| Linear API 失败 | 队列重试 + Slack 告知延迟 |
| 低置信度洪峰 | 暂停自动建单，只汇总 triage |
| PII 命中 | 阻断原文进 Linear 描述 |

组织活动如何驱动这些流程：见 [03-ORG-CADENCE.md](./03-ORG-CADENCE.md)。
