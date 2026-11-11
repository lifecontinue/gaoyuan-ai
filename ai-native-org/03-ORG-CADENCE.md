# 03 · 组织节奏 × 工具

工具不是工作本身。AI Native 组织的关键是：**人的节奏定义何时决策、对齐、创造；工具与 Agent 把上下文运到现场、把结论送回 Linear / Docs / Slack。**

本文说明 Weekly 需求评审、Biweekly 进度同步、Town Hall、Standup、1:1、Stakeholder Catchup、Service Training/Revamp、In-person / Offsite / Summit 如何与 Claude、Zoom、Docs、Figma、Slack、Linear、Metabase、Salesforce、Calendar、Langfuse 等**咬合**，避免「堆了一堆 SaaS，开会还是从零口头同步」。

配套：[架构](./01-ARCHITECTURE.md) · [工作流](./02-WORKFLOWS.md) · [Agent](./04-AGENTS-RUNTIME.md) · [清单](./05-TOOLKIT.md)

---

## 1. 原则

| 原则 | 含义 |
|------|------|
| 一种活动，一个主目的 | Standup 不评审需求；Town Hall 不定 Sprint 范围 |
| 会前自动，会中人判，会后入库 | Bot 做 Brief / 纪要草稿 / Action；人不做复制粘贴 |
| Linear 是执行真相，会议是催化剂 | 没进 Linear 的待办视为不存在 |
| 人场留给高带宽 | 1:1、Catchup、In-person、Offsite、Summit 处理信任、冲突、方向 |
| 同一上下文 | 打开任意活动应能看到同一套 Issue / 指标 / 反馈 / 决策卡 |
| 对内执行、对外叙事分层 | Squad 用 Linear 细节；Stakeholder 用结局与决策，不念看板 |
| Training / Revamp 也要闭环 | 培训材料进 Docs；Revamp 行动进 Linear，带验收 |

```text
        ┌──────────── 组织节奏（人）────────────┐
        │ Daily → Weekly → Biweekly → Quarterly │
        │ 1:1 / Stakeholder Catchup             │
        │ Training / Revamp                     │
        │ In-person / Offsite / Summit          │
        └───────────────┬───────────────────────┘
                        │ 触发 / 消费
        ┌───────────────▼───────────────────────┐
        │ Calendar 排程 → Slack 触达 → Zoom 现场 │
        │ Claude 结构化 → Linear 执行             │
        │ Metabase / SF / Rippling 供数 → Audit   │
        └───────────────────────────────────────┘
```

每场活动统一三段式：

```text
BEFORE（工具自动） → DURING（人决策） → AFTER（工具入库）
```

---

## 2. 活动地图

| 频率 | 活动 | 主目的 | 主真相源 | AI / Bot 角色 |
|------|------|--------|----------|----------------|
| 每日 | Squad Daily Standup | 暴露阻塞、当日焦点 | Linear Cycle | 会前阻塞清单；会后更新状态 |
| 每日 | Feedback Triage（异步） | 消化 `#feedback` | Linear + Slack | 自动评估建单，人审边界 |
| 每周 | Weekly 需求评审 | 决定做什么 / 不做 | Docs Spec + Linear | 会前 Spec 包与依赖图 |
| 双周 | Biweekly 进度同步 | 进度、风险、跨队依赖 | Linear + Metabase | 双周报、风险雷达 |
| 双周/按需 | Stakeholder Catchup | 与业务/客户/领导对齐预期与决策 | 一页纸 Docs + Linear 承诺 | 会前 Brief；会后承诺入库 |
| 双周 | Prompt / Harness Review | Agent 质量门禁 | Langfuse + Git | 跑分对比、坏例抽样 |
| 按计划 | Service Team Training | 赋能服务/交付团队用新产品能力 | Docs + 录播 | 材料包、FAQ、测验草稿 |
| 按计划 | Service / Process Revamp | 改造服务流程或内部操作系统 | Docs + Linear Project | 现状抽取、差距、WBS |
| 每月 | Catalog / 权限抽检 | Endpoint 与入离职对账 | Gateway + Rippling | 差异报告 |
| 每季 | Tech Town Hall | 技术方向、架构、文化 | ADR Docs + 录播 | 议题征集、会后决策卡 |
| 持续 | 1:1 | 成长、绩效、关系 | Rippling + 私密笔记 | 可选脱敏个人工作摘要 |
| 周期性 | In-person / Office Day | 高带宽协作、关系 | Calendar + 场地 | 议题预热、当日记录回流 |
| 定期 | Offsite（小队/部门） | 战略对齐、深度共建 | Docs + Linear Project | 会前材料包、会后 WBS |
| 年度/半年 | Summit / All-Hands | 公司叙事、跨组织对齐 | 主 Docs + 录播 | 议程助手、问答聚类、行动入库 |

---

## 3. Squad Daily Standup

| 项 | 内容 |
|----|------|
| 目的 | 昨天→今天→阻塞；不是深度设计 |
| 时长 | 10–15 min |
| 人 | Squad 全员 |
| 频道 | `#squad-<name>` + Calendar 短会 |

| 阶段 | 做什么 | 工具 |
|------|--------|------|
| 会前 T-15m | Bot 贴：In Progress / Blocked / 今日到期；过夜新建反馈单 | Slack ← Linear / Feedback Bot |
| 会中 | 只谈阻塞与需要他人的点；禁止长演示 | Zoom 或语音；屏幕只开 Linear |
| 会后 | 状态变更；新阻塞建 Issue；无人认领 @lead | Linear；逾期标记 |

AI 不该做：替人编造进度。成功信号：不再出现「我忘记更新票了」——票是会前唯一议程。

---

## 4. Weekly 需求评审

| 项 | 内容 |
|----|------|
| 目的 | 候选需求：问题、AC、范围、优先级、是否进下 Cycle |
| 时长 | 45–60 min |
| 人 | PM + Eng Lead + Design（按需 Sales/CS） |
| 输入池 | Linear 候选、`#feedback` 高分项、SF 产品缺口、上期延期 |

| 阶段 | 做什么 | 工具 |
|------|--------|------|
| 会前 | Claude/PM 整理「评审包」：问题、AC、Out-of-scope、依赖、反馈 ID、Figma | Claude + Docs + Canvas + Figma + Linear `ready-for-review` |
| 会前 | Bot 汇总候选与估分（反馈热度、商机关联） | Slack + Salesforce 只读 + Feedback score |
| 会中 | 逐项做 / 缓 / 砍；改写 AC；指定 Owner | Zoom；实时改 Docs/Linear |
| 会后 | 通过 → Linear Cycle + AC checklist；未通过 → backlog + 原因 | n8n/Bot；知识库决策卡 |

通过评审 = WF-03 正式入口。未评审进开发 = 流程破坏。

评审包模板：

```yaml
request_id: LIN-123
problem: ...
users: ...
ac: [...]
out_of_scope: [...]
evidence: [feedback_ids, sf_opportunity_ids, metabase_question_ids]
design: figma_url
decision: approve | defer | reject
owner: ...
cycle: ...
```

---

## 5. Biweekly 进度同步

| 项 | 内容 |
|----|------|
| 目的 | 跨队进度、风险、依赖、是否需要升降配 |
| 时长 | 30–45 min |
| 人 | EM / PM / Tech Lead；按需跨 squad |

| 阶段 | 做什么 | 工具 |
|------|--------|------|
| 会前 | 自动双周报：Cycle 完成率、逾期、阻塞、Harness 红灯、关键路径 Datadog、反馈 S0/S1 积压 | Slack / Docs ← Linear + Metabase + Langfuse + Datadog |
| 会中 | 只讨论红灯与跨队依赖；不逐票念 | Zoom |
| 会后 | 风险 Issue；调整 Cycle；决策卡 | Linear + Docs |

成功信号：会前大家已读过摘要；会上不出现「你先讲讲做到哪了」的冷启动。

---

## 6. Stakeholder Catchup

| 项 | 内容 |
|----|------|
| 目的 | 与业务负责人 / 客户成功 / 领导 / 外部客户对齐预期、承诺、待决策 |
| 时长 | 30–60 min |
| Calendar 标记 | 标题含 `[Stakeholder]` 便于 Bot 识别 |

| 阶段 | 做什么 | 工具 |
|------|--------|------|
| 会前 | 一页纸：交付结果、下一步、待决策、风险、**上次承诺闭环情况**；客户场附 SF 机会摘要 | Claude/Docs + Linear `stakeholder-commit` + Metabase + Salesforce |
| 会中 | 谈结局与决策，不念看板；新想法进 `ready-for-review`，不当场开干 | Zoom + 实时改一页纸 |
| 会后 | 决策卡；承诺 → Linear label `stakeholder-commit`；客户场 draft SF Note（HITL） | Linear + Docs + SF |

约束：

- Bot / PM 助手不替团队承诺日期。
- 不自动改 SF Stage / Amount。
- 对内细节与对外叙事分层。

---

## 7. Prompt / Harness Review（双周）

| 项 | 内容 |
|----|------|
| 目的 | 决定 Agent / Prompt 版本是否晋升；消化坏例 |
| 人 | AI Platform + 相关 Squad Lead |

| 阶段 | 工具 |
|------|------|
| 会前 | Langfuse 对比、Harness 报告、Badcase 抽样进 Dataset |
| 会中 | 升 / 留 / 回滚；是否改金标 |
| 会后 | Git tag；Gateway 流量；Linear `needs-harness` 清掉或新建 |

未过 Harness 禁止标 prod（见 WF-05）。

---

## 8. Tech Town Hall（每季）

| 项 | 内容 |
|----|------|
| 目的 | 技术方向、架构取舍、工程文化；不是排期会 |
| 时长 | 60–90 min |

| 阶段 | 做什么 | 工具 |
|------|--------|------|
| 会前 2 周 | Slack 征集议题；Claude 聚类成议程草案 | Slack + Docs |
| 会前 | 预读 ADR / 架构一页纸 | Google Docs |
| 会中 | 演讲 + 问答；Zoom 录播 | Zoom |
| 会后 | 决策卡 / FAQ 入库；行动进 Linear；录播链到知识库 | Docs + Algolia + Linear |

禁止：在 Town Hall 上现场拍板未评审的大型需求范围（应回到 Weekly 评审）。

---

## 9. 1:1

| 项 | 内容 |
|----|------|
| 目的 | 成长、绩效、关系、阻塞的人侧因素 |
| 工具 | Rippling 汇报线；私密笔记（Google Doc 或 HR 工具） |

可选：会前 Bot 给经理一份**脱敏**个人工作摘要（完成 PR / Linear、不写绩效评语）。

约束：1:1 内容**默认不上**公共 Agent、不上 `#feedback`、不进公司知识索引。

---

## 10. Service Team Training（培训）

服务 / 交付 / 顾问 / CS 团队上新能力或新产品流程时：

| 阶段 | 做什么 | 工具 |
|------|--------|------|
| 会前 | 培训大纲：目标学员、会后能独立完成的操作、禁忌 | Claude + Docs |
| 会前 | 从 PRD / Figma / Linear 已交付 AC 抽「教学用场景」 | Docs + Figma + Linear |
| 会前 | FAQ 草稿；Contentful 帮助中心 draft（不 publish） | Contentful HITL |
| 会中 | Zoom 演示 + 实操；录播 | Zoom |
| 会后 | 测验/检查清单；错误操作进 `#feedback` 或 Linear `training-gap` | Slack + Linear |
| 会后 | 录播与材料进知识库；Algolia 可检索 | Docs + Algolia |

成功信号：培训后一周，服务侧能在不找 Eng 的情况下完成主路径；卡点有票可追。

---

## 11. Service / Process Revamp（流程改造）

对服务流程、内部操作系统、交接手册做结构性改造（不是一次培训）：

| 阶段 | 做什么 | 工具 |
|------|--------|------|
| 发现 | Front/Aircall/Salesforce/反馈 抽样：失败模式与耗时 | Metabase + Front + `#feedback` |
| 现状 | Claude 整理 as-is 流程图与痛点一页纸 | Docs + Canvas |
| 设计 | to-be + 角色权限 + 系统依赖（是否新 Endpoint） | Docs + Figma（若有 UI） |
| 评审 | 走 Weekly 需求评审或专项评审；进 Linear Project | Linear |
| 建造 | Eng 交付；Flag 灰度；服务侧平行 Training | GitHub + Darklight + WF Training |
| 验收 | 前后指标（处理时长、升级率、CSAT 等）对照 Metabase Question | Metabase + Datadog |
| 收尾 | 旧流程文档下线；决策卡；Revamp 复盘 | Docs + Algolia |

Revamp 的行动项必须进 Linear，禁止只活在幻灯片里。

---

## 12. In-person / Office Day

| 阶段 | 做什么 | 工具 |
|------|--------|------|
| 会前 | Calendar 场地与议题；预热材料进频道 | Calendar + Slack + Docs |
| 会中 | 白板/结对/冲突解决；高带宽议题 | 现场；FigJam/Miro 可选 |
| 会后 | **必须**回流：照片/结论 → Docs；Action → Linear；关键决策 → 决策卡 | Docs + Linear |

没有回流的 In-person = 团建，不算操作系统的一部分。

---

## 13. Offsite（小队 / 部门）

| 阶段 | 做什么 | 工具 |
|------|--------|------|
| 会前 1–2 周 | 战略问题清单；数据袋（Metabase + 反馈主题 + SF 管道风险） | Docs + Metabase + Linear + SF |
| 会中 | 深度共建、路线图草案 | 现场 + Canvas/Docs |
| 会后 48h 内 | WBS → Linear Project；原则/ADR → Docs；向公司同步摘要 | Linear + Docs + Slack |

Offsite 产出若两周内未进 Linear Cycle，视为失败，需补救会。

---

## 14. Summit / All-Hands

| 阶段 | 做什么 | 工具 |
|------|--------|------|
| 会前 | 叙事大纲；各部门一页纸；问答征集聚类 | Claude + Docs + Slack |
| 会中 | 公司级对齐；录播 | Zoom / 现场 |
| 会后 | 行动聚类 → 各团队 Linear；FAQ → 知识库；禁止把 Summit 当成唯一任务来源 | Linear + Docs + Algolia |

---

## 15. 月度 Catalog / 权限抽检

| 检查项 | 工具 |
|--------|------|
| Endpoint Catalog 与 Gateway 实际放行是否一致 | Gateway + Catalog Doc |
| Rippling 在职 vs Auth0 / GitHub / 逻辑 key | Rippling + Auth0 + Audit |
| 长期未用 M2M / 过宽 scope | Auth0 |
| 生产 publish scope 持有者 | Auth0 Actions 日志 |

差异进 Linear `security`，P0 走 Incident。

---

## 16. 日历如何驱动整周

| 时间 | 流程 |
|------|------|
| 每日 | Standup 摘要；Feedback 消化；逾期 Linear；Gateway 成本异常 |
| 每周 | Weekly 需求评审（评审包 → Cycle） |
| 双周 | 进度同步；Stakeholder Catchup；Prompt/Harness Review |
| 周一附加 | Cycle 目标 Brief；Sales pipeline 风险（SF） |
| 按计划 | Service Training / Revamp 里程碑 |
| 每季 | Tech Town Hall；权限/Catalog 抽检加重 |
| 周期 | In-person / Offsite / Summit（会后必须回流） |
| 月末 | Key 轮换检查、成本回顾；入离职权限抽检 |

---

## 17. 活动 × 工作流对照

| 活动 | 主要触发的 WF |
|------|----------------|
| Standup | Linear 状态；轻量 WF-01 过夜单 |
| 需求评审 | WF-03 入口 |
| 进度同步 | Linear + Metabase + Langfuse + Datadog |
| Stakeholder Catchup | 承诺 Linear；可选 WF-07 SF Note |
| Harness Review | WF-05 |
| Town Hall | 决策卡 + Linear 改进 |
| Training | Docs/Contentful draft；training-gap → Linear |
| Revamp | 发现→评审→WF-03→Training |
| 会议（任意） | WF-02 |
| 入离职 | WF-08 |

---

## 18. 成功与反模式

| 做得对 | 反模式 |
|--------|--------|
| 会前已有 Brief / 评审包 | 开会现场打开空白文档 |
| 结论当日进 Linear | 「我回去想想」且无票 |
| Stakeholder 一页纸 | 对着 40 列看板念进度 |
| Training 后有检查清单 | 只讲 PPT 无操作验收 |
| Revamp 有前后指标 | 换一套话术但系统不变 |
| 1:1 私密 | 把绩效讨论喂给公司 Bot |

下一篇：[04-AGENTS-RUNTIME.md](./04-AGENTS-RUNTIME.md)
