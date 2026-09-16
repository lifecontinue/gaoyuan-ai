# 06 · 搭建、日常用法与入职

把前面文档落成可执行计划：怎么搭、每天怎么用、新成员第一周做什么。

---

## 1. 搭建阶段（项目计划）

### 第 0 周：编码 Agent 能按规矩交活

1. 写根目录与各应用 `AGENTS.md`（分支、验证、文档、高风险：迁移/鉴权）。
2. PR 模板 + CI 最小集（lint / test / secret scan）。
3. `docs/business-map` + 至少一个 domain 文档开始当交付物。
4. 全员 Codex/Cursor；仓库规则自动加载。
5. 1Password；本地环境脚本；禁止群里发 key。

**验收**：任意工程师用编码 Agent 做一个小改动，PR 含验证说明与文档判断。

### 第 1–2 周：受控模型出口 + 观测

1. Auth0：员工应用 + Bot M2M 拆开。
2. API Key Gateway 代理 OpenAI/Anthropic；业务只配逻辑 key。
3. OpenAI SDK 统一 baseURL。
4. Langfuse 接通；至少一条生产或预发 Agent 全量 trace。
5. Endpoint Catalog 空表，先登记 Linear / Slack / Gateway。

**验收**：开发机与 CI 搜不到厂商原始 key；吊销逻辑 key 后 Bot 立刻失败。

### 第 3–4 周：反馈闭环（WF-01）

1. `#feedback` + `#feedback-triage` + Linear 标签。
2. LangGraph（或 n8n+LLM）分类 → 人工确认按钮 → Linear → 回帖。
3. 30–50 条金标；`harness-feedback-classifier` 进 CI 或日更。
4. PII 规则：原文不进 Linear 描述。

**验收**：Bot 中位首次响应 ≤2min；人 24h 内改 type 比例可接受（如 &lt;20%）。

### 第 2 个月：会议 + 数据 + 产品 Copilot

1. Calendar T-30 Brief；Zoom 转写 → Meeting Scribe → Linear（先 HITL）。
2. Metabase Gold Collection；`@DataBot` 只跑 Question ID。
3. 产品 Copilot：流式接口 + Flag + 一种对象上下文 + 授权复用。
4. Datadog 关键路径埋点对照 AC。

**验收**：一场真实会议的 action 当日进 Linear；Copilot 开关能关停入口。

### 第 3 个月起：GTM / People / 内容

1. Salesforce 只读 Brief；缺口进 `#feedback`。
2. Rippling 入职开通 / 离职吊销与 Auth0·Gateway 对账。
3. PandaDoc 仅草稿；send HITL。
4. Contentful draft + Darklight/Flag；Front/Aircall 摘要可选。
5. Replit PM 沙箱：Secrets=逻辑 key，Endpoint=Catalog。

**验收**：自评表（见 [05-TOOLKIT.md](./05-TOOLKIT.md) L 节）≥12/20 再扩新 Agent。

---

## 2. 仓库与目录约定（落地检查清单）

```text
[ ] AGENTS.md 含：不直提主干、最小验证、文档同 PR、迁移/鉴权先问人
[ ] docs/domains 有权限与状态机
[ ] PR 模板含 Validation + Knowledge-Base + Risks
[ ] agents/ 或 prompts/ 变更触发 Harness job
[ ] gitleaks / secret scan 必过
[ ] Catalog JSON 有 owner 与 access_level
```

---

## 3. 日常用法

### 3.1 工程师：普通功能

1. Linear 确认 AC 与范围外。  
2. 编码 Agent 说明「只改哪个应用」。  
3. 先让 Agent 列文件与风险，再写代码。  
4. 跑它提示的测试；你再点主路径。  
5. 审 diff：有无无关格式化、无关文件。  
6. 开 PR；自动审查说得对就改。

### 3.2 工程师：迁移

1. 人先定类型、默认值、null、backfill、锁表窗口。  
2. 明确告诉 Agent：可起草，不执行生产，不改旧文件。  
3. 本地 migrate + rollback。  
4. PR 标数据负责人。详见 [04](./04-AGENTS-RUNTIME.md) §3。

### 3.3 工程师：鉴权 / 角色可见性

1. 先读/补 domain 文档里的可见性规则。  
2. 改授权函数 + 测试：未登录、错角色、跨 id。  
3. 同一 PR 更新文档。详见 [04](./04-AGENTS-RUNTIME.md) §4。

### 3.4 PM：从想法到进 Cycle

1. Claude + Canvas 出 Spec（含 AC、agent_requirements）。  
2. Docs 定稿，链 Linear；Figma 标注状态机。  
3. 打 `ready-for-review`；进 Weekly 需求评审。  
4. 通过后进 Cycle；需要试接口 → Replit + Catalog 只读。  
5. 用 Metabase Question 定成功指标，写进 Spec。

端到端「需求 → vibe coding → Plan → PR → 简单自动上线 → `#shipped`」及资源目录（数据/Schema/API/Design System/Magic Prompt/前后端约定）：见 [07-PM-VIBE-PIPELINE.md](./07-PM-VIBE-PIPELINE.md)。

### 3.5 PM / EM：双周与 Stakeholder

1. 会前读自动双周报（Linear+Metabase+Langfuse+Datadog）。  
2. Stakeholder：一页纸 + 上次 `stakeholder-commit`；会后承诺入库。  
3. 不替团队用 Bot 承诺日期。见 [03](./03-ORG-CADENCE.md)。

### 3.6 设计

1. Figma 写清状态、空态、错误态、权限差异。  
2. `ready for eng` 前对齐 Spec AC。  
3. 不把生产 key 放进文件说明。

### 3.7 Sales / CS / People（协作侧）

| 角色 | 日常 |
|------|------|
| Sales | 会前看 Brief；缺口丢 `#feedback`；不要求 Bot 改金额 |
| CS | Front 标签回流；回复用人审草稿 |
| People | Rippling 事件为准；PandaDoc 只审发送；薪酬不进公开频道 |

### 3.8 值班 / 事故

1. Copilot 异常 → 关 Flag → Langfuse + Datadog。  
2. Bot 乱建单 → 关自动建单，保留收集。  
3. 密钥疑似泄露 → Gateway 吊销 + Auth0 废 token + `#incidents`。  
4. Agent 误写 → 切断该 agent 写权限 → Harness 回归再开。

---

## 4. 组织活动速查（操作侧）

| 你要开的会 | 会前打开 | 会后必须留下 |
|------------|----------|--------------|
| Standup | Linear 阻塞帖 | 状态更新 |
| 需求评审 | 评审包 Docs | Cycle / backlog 原因 |
| 进度同步 | 双周报 | 风险 Issue |
| Stakeholder | 一页纸 | stakeholder-commit |
| Harness Review | Langfuse 报告 | 版本晋升或回滚 |
| Town Hall | 议题与 ADR | 决策卡 + Linear |
| Training | 大纲与场景 | 录播 + training-gap 票 |
| Revamp | as-is/to-be | Linear Project + 指标 |
| 1:1 | （私密） | 不上公共 Agent |
| Offsite/Summit | 材料袋 | 48h 内进 Linear/Docs |

完整咬合说明：[03-ORG-CADENCE.md](./03-ORG-CADENCE.md)。

---

## 5. 新成员第一周

### Day 1

- [ ] SSO（Auth0）、GitHub、1Password、Slack、Linear  
- [ ] 本地环境脚本跑通；确认无共享生产 key  
- [ ] 编辑器打开主仓，确认根 `AGENTS.md` 被加载  
- [ ] 两个测试角色登录产品，体会权限差异  
- [ ] 加入 `#feedback` `#incidents` `#ai-agents`（按角色）

### Day 2–3

- [ ] 跟一个小 Linear 票：编码 Agent → 最小测试 → PR  
- [ ] 读 business-map 与自己负责的 domain  
- [ ] 看一条 Copilot 或 Bot 的 Langfuse trace  
- [ ] 用 Metabase 打开一个 Gold Question（只读）

### Day 4–5

- [ ] 模拟「迁移或鉴权」任务：确认 Agent 会停下来问你  
- [ ] 知道谁能关 Copilot Flag、谁能吊销 Gateway 逻辑 key  
- [ ] 读一遍 WF-01 与 Weekly 评审模板  
- [ ] （可选）在 Replit 沙箱用逻辑 key 跑只读 metrics

**毕业标准**：能独立按仓库规则开 PR；知道反馈如何进 Linear；知道高风险变更要人批；知道事故时前两个开关在哪。

---

## 6. 90 天组织目标（对照）

- [ ] `#feedback` → 评估 → Linear 主路径（含 duplicate）  
- [ ] Auth0 人机分离；publish HITL  
- [ ] Gateway 覆盖主模型供应商；业务侧无裸 key  
- [ ] Rippling 开通/吊销与 Auth0·Gateway 对账  
- [ ] SF 会前 Brief；赢丢单缺口进反馈  
- [ ] PandaDoc 仅草稿自动；发送人审  
- [ ] 会议 Action 可进 Linear（允许先 HITL）  
- [ ] 生产 Agent：Langfuse + Audit + Harness 基线  
- [ ] Metabase Gold 供 Bot  
- [ ] Datadog 关键路径可对照 AC  
- [ ] Incident 与密钥泄露 runbook  
- [ ] 新成员第 1 周靠 Bot + Skills 完成：查决策 / 建单 / 看指标  
- [ ] Weekly / Biweekly / Stakeholder 会前材料自动化率可见  

---

## 7. 一页纸总览

```text
身份 Auth0 ← 入离职 Rippling → 密钥 1Password/Gateway → 模型 OpenAI SDK
  → 编排 n8n / LangGraph → 工作 Linear / GitHub / Contentful
  → 销售 Salesforce · 文件 PandaDoc(HITL) · 支持 Front/Aircall
  → 反馈 Slack → Bot+Harness → Linear
  → 需求 Claude/Docs/Figma → 评审 → Cycle → Codex → Flag → Datadog
  → 会议 Zoom/Calendar → Action → Slack+Linear
  → 数据 Lake/Algolia/Metabase（Gold）
  → 观测 Langfuse / Datadog / Audit → 改进
```

组织节奏（Standup → 评审 → 双周 → Catchup → Town Hall → Training/Revamp → Offsite）决定**何时**用上面这条总线；工具不替代决策，只消除复制粘贴与上下文丢失。

返回目录：[README.md](./README.md)
