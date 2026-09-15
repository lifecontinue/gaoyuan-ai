# AI Native 工作流说明书

本文描述组织内**默认信息如何流转**。所有流程默认写 Audit +（若涉及 LLM）Langfuse Trace。

---

## 总览：事件从哪来、到哪去

```text
信号源                         处理                         真相源/出口
────────                       ────                         ──────────
Slack #feedback          →  Eval Bot + Harness     →  Linear + 线程回复
Zoom / Calendar 会议     →  n8n + 结构化 Agent     →  Slack AI + Linear
Google Docs / Figma      →  变更 Webhook           →  知识索引 + 相关 Issue
Front / Aircall          →  摘要 Agent             →  Linear / FAQ / CRM
Datadog 告警             →  路由规则               →  #incidents + Oncall
Harness 失败（CI）       →  门禁                   →  阻断合并 / 开 Linear
Calendar Cycle 边界      →  定时 Bot               →  进度摘要 + 风险 Issue
```

---

## WF-01 反馈闭环（核心）：Slack → Bot 评估 → Linear

### 适用频道

| 频道 | 用途 |
|------|------|
| `#feedback` | 用户/内部产品反馈主收集 |
| `#feedback-triage` | Bot 日报、人审争议 case |
| `#feedback-auto` | 可选：仅自动化日志（debug） |

### 触发

1. 频道新消息（非 Bot）
2. 消息被加 emoji：`:bug:` `:bulb:` `:wave:`（重评）
3. 线程内回复 `@FeedbackBot reevaluate`

### 处理步骤

```text
1. Ingest
   - 拉取 message + 最近 20 条线程 + 作者 profile + 可选截图 URL
   - 生成 feedback_id，写 Audit(action=feedback.ingest)

2. Normalize（规则，不调用 LLM 也可先跑）
   - 语言检测、去签到/纯表情
   - 提取链接、环境（iOS/Web）、版本号
   - 输出：raw_text, attachments[], author, channel, ts

3. Classify（LLM via Gateway + OpenAI SDK）
   - type: bug | request | question | praise | incident | spam
   - product_area: enum
   - severity: S0–S3
   - reproducibility: yes | no | unknown
   - user_impact: low | mid | high
   - confidence: 0–1

4. Dedup
   - Algolia/Linear 搜索近 30 天相似标题与 embedding
   - 若相似度 > 阈值 → link 到已有 Linear，不新建

5. Evaluate（Harness 在线模式）
   - 规则分：是否缺 repro steps、是否含 PII、是否已有 workaround
   - LLM-as-judge：相对产品原则/已知限制打「是否值得做」
   - 合成 scorecard → 建议 priority（P0–P3）与是否自动建单

6. Act
   - confidence ≥ 0.75 且 type∈{bug,request,incident} → 创建/更新 Linear
   - confidence < 0.75 或缺信息 → 线程追问模板
   - spam/out_of_scope → 标记并礼貌关闭
   - S0/incident → 同时打到 #incidents（HITL）

7. Reply（Slack 线程）
   - 贴：类型、严重度、Linear 链接或追问、评估摘要（短）
   - 按钮：确认 / 改优先级 / 不是重复 / 转人工

8. Observe
   - Langfuse：classification + judge traces
   - Datadog：feedback.auto_filed / feedback.needs_info 计数
   - 每日 09:30 摘要 → #feedback-triage
```

### Linear Issue 字段映射

| Linear 字段 | 来源 |
|-------------|------|
| Title | Bot 生成的一句话问题陈述 |
| Description | 原文引用 + 评估 scorecard + Slack 深链 |
| Priority | severity × impact 映射 |
| Labels | `source:slack-feedback`, `type:*`, `area:*`, `auto-filed` |
| Assignee | 按 area routing 表；否则留空给 triage owner |
| Relations | duplicate of / related to |
| Custom: feedback_id | Slack ts / feedback_id |
| Custom: eval_score | 0–100 |

### 人机门禁

- S0、涉及付款/安全/删除数据：只建单 + 告警，**不自动改生产**
- 客户原话含 PII：描述里脱敏，原文仅存受控存储
- 用户点「转人工」：停止自动状态机，只保留收集

### 成功指标

- 自动建单准确率（人在 24h 内未改 type）≥ 80%
- 重复建单率 ≤ 10%
- `#feedback` 中位首次响应（Bot）≤ 2 分钟

---

## WF-02 会议闭环：Calendar + Zoom → Action → Linear

```text
Calendar: meeting ending / Zoom webhook: recording ready
  → n8n 拉取转写
  → LangGraph「Meeting Scribe」
      - decisions[]
      - action_items[{owner_email, text, due}]
      - risks[]
      - open_questions[]
  → 对每个 action_item：
      - 解析 owner → Linear assignee
      - 创建 Issue（label: from-meeting）
      - Slack 私信或频道 @owner
  → 将纪要链回 Calendar 事件描述 / Docs
  → Audit + 索引到 Algolia
```

**会前（Calendar T-30min）**

```text
Bot 读取：与会人、相关 Linear project、上次同标题会议决策
  → 推送 Brief 到会议频道或 DM
```

---

## WF-03 需求建造：Spec → Linear → Code → 发布

```text
Claude 产出 AI Feature Spec / PRD（含 AC）
  → 存 Google Docs，链到 Linear Project
  → Figma 设计：comment「ready for eng」触发 n8n
  → 拆解 Issue（可半自动）：每条 AC ↔ Issue 或 Acceptance checklist
  → Eng 用 Codex/Claude 实现
  → GitHub PR
      - CI：lint/test/secret scan
      - Harness：若改动 agents/prompts/** → 跑评测门禁
  → Review 合并
  → Feature Flag / Darklight 灰度
  → Datadog 看板对照 AC
  → 未达标 → 自动开 Linear regression
```

---

## WF-04 数据洞察：提问 → 受控查询 → 结论入库

```text
Slack: @DataBot 「上周 retention？」
  → 鉴权（Auth0 / Slack 用户映射）
  → 只允许 Metabase Gold Collection
  → 返回：数字 + Question ID + 图链 + 注意事项
  → 可选：把结论贴到 Docs 并链 Linear 决策
```

禁止：Bot 直接对 Lake 跑任意 SQL（除非独立只读沙箱 + 强 Audit）。

---

## WF-05 Agent 改进：Trace → Bad case → Harness → 晋升

```text
Langfuse 采集线上失败 / 低分
  → 每周自动抽样进 Badcase Sheet/Dataset
  → Eng 修 Prompt / Graph
  → 本地与 CI 跑 Eval Harness
  → 分数 ≥ 阈值 且 diff 经 Review
  → 标记 version prod
  → Gateway 切换流量百分比
  → A/B 指标进 Metabase
```

---

## WF-06 客户信号：Front / Aircall → 产品回流

```text
Front 工单标签「product-bug」或 Aircall 通话结束
  → 转写/正文摘要（脱敏）
  → 与 WF-01 同一 Classify/Dedup 管道
  → Linear 或 Contentful FAQ 草稿（publish 需人）
```

---

## WF-07 密钥与身份：申请 → 发放 → 轮换

```text
工程师申请新模型/SaaS 能力
  → Catalog Office Hour 审批 Endpoint + Auth0 scope
  → 1Password 存厂商 key
  → Key Gateway 注册逻辑 key 与配额
  → 业务只配置 COMPANY_GATEWAY_KEY
  → 月度轮换：1Password 更新 → Gateway reload → Audit「key.rotated」
  → 泄露：Gateway 吊销 + Auth0 token revoke + Incident WF
```

---

## WF-08 事故：发现 → 止损 → 复盘

```text
Datadog / 用户 / Bot 异常
  → #incidents 开通道 + 指定 IC（Calendar Oncall）
  → 若 Agent 相关：Gateway 切断该 agent 写权限
  → 修复 + Harness 回归
  → 复盘 Doc → Linear 改进项 → 更新 Skill/Runbook
```

---

## WF-09 周节奏（Calendar 驱动）

| 时间 | 流程 |
|------|------|
| 每日 | Feedback 摘要、逾期 Linear、Gateway 成本异常 |
| 周一 | Cycle 目标 Brief |
| 双周 | Prompt/Harness Review |
| 月末 | Key 轮换检查、成本与配额回顾 |

---

## 状态机：Feedback Item

```text
received → classifying → evaluated →
  ├─ needs_info → (用户回复) → classifying
  ├─ linked_duplicate → closed
  ├─ filed_linear → in_triage → in_progress → done
  └─ rejected → closed
```

任意状态变更写回 Slack 线程脚注（短链 + 状态）。

---

## 路由表示例（area → Linear team）

| product_area | Linear Team | Slack 备选 |
|--------------|-------------|------------|
| auth | Platform | `#team-platform` |
| billing | Growth | `#team-growth` |
| editor | Product | `#team-product` |
| ai-agent | AI Platform | `#team-ai` |
| unknown | Triage | `#feedback-triage` |

---

## 失败与降级

| 失败 | 降级 |
|------|------|
| LLM Gateway 超时 | 仅规则分类 + 建「待评估」Linear |
| Linear API 失败 | 队列重试 + Slack 告知「已记录，同步延迟」 |
| 低置信度洪峰 | 暂停自动建单，只汇总到 triage |
| PII 检测命中 | 阻断原文进 Linear 描述，改存安全桶 |

更细的 Skill/MCP 工具名见 [SKILLS-MCP-PLUGINS.md](./SKILLS-MCP-PLUGINS.md)。
