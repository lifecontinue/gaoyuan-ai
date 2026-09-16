# AI Native 组织基建

面向技术团队的完整手册：有哪些系统、各自干什么、工作怎么转、组织活动怎么和工具咬合、Agent 怎么跑、怎么从零搭起来。

工具名可换成等价产品；**职责不要丢**。

| 文档 | 读什么 |
|------|--------|
| [01-ARCHITECTURE.md](./01-ARCHITECTURE.md) | 分层架构、身份/密钥/审计/网关、全工具地图 |
| [02-WORKFLOWS.md](./02-WORKFLOWS.md) | 端到端工作流：需求、会议、反馈、数据、发布、GTM、People |
| [03-ORG-CADENCE.md](./03-ORG-CADENCE.md) | **组织活动 × 工具**：Standup、需求评审、进度同步、Town Hall、1:1、Stakeholder Catchup、Training/Revamp、Offsite/Summit |
| [04-AGENTS-RUNTIME.md](./04-AGENTS-RUNTIME.md) | Agent 如何运转：编码 / 产品 Copilot / 组织 Bot；迁移、鉴权、Harness |
| [05-TOOLKIT.md](./05-TOOLKIT.md) | 可复制采购与账号清单、频道/标签模板、两周最小包 |
| [06-ONBOARDING.md](./06-ONBOARDING.md) | 搭建顺序 + 日常用法 + 新成员第一周 |
| [07-PM-VIBE-PIPELINE.md](./07-PM-VIBE-PIPELINE.md) | **PM 主路径**：需求收集分析 → vibe coding 原型 → Plan → PR → 简单需求自动部署 → 每日 Slack 上线同步；含数据/Schema/API/DS/Prompt 等资源目录 |

---

## 一句话

人的节奏决定何时对齐与决策；工具与 Agent 负责把上下文运到现场、把结论写回任务与文档。Auth0 + API Key 网关管身份与密钥；Slack 反馈经 Bot 评估进 Linear；Claude / Zoom / Docs / Figma 进需求与会议闭环；PM 用资源目录做 vibe coding 与自动 PR 分流；LangGraph / n8n 编排；Langfuse / Datadog / Audit / Harness 保证可观测、可追责、可回归。

---

## 读法建议

1. 架构负责人、Tech Lead：先读 `01` + `04`。
2. PM / EM：先读 `07` + `03` + `02`。
3. 新入职工程师：按 `06` 走，遇到概念再翻 `01`。
4. 给其他团队复制：甩 `05` + `02` 里的反馈闭环即可启动。
