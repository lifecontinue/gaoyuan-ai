# 组织节奏 × 工具

工具不是工作本身。人决定什么时候对齐和拍板；Bot 只负责把材料运到会上、把结论写回系统。

任务系统在蓝图里写成 Linear。若你的工程团队像 crimson-app 一样以 GitHub PR 为交活面，把下表里的 Linear **换成 PR + 项目板** 即可，不必强行再引入一套真相源。

**配套**：[架构](./AI-NATIVE-INFRA.md) · [对照笔记](./REFLECTION.md) · [工作流](./WORKFLOWS.md) · [Skill/MCP](./SKILLS-MCP-PLUGINS.md) · [工具清单](./TOOLKIT-CHECKLIST.md)

---

## 1. 基本原则：节奏驱动，工具服从

| 原则 | 含义 |
|------|------|
| **一种活动，一个主目的** | Standup 不评审需求；Town Hall 不定 Sprint 范围 |
| **会前自动，会中人判，会后入库** | Bot 做 Brief / 纪要草稿；人不做复制粘贴 |
| **没进任务系统的待办当不存在** | Linear、Jira 或 GitHub，团队只选一个执行面 |
| **人场留给高带宽** | 1:1、Catchup、Offsite 处理信任和方向；日常尽量异步 |
| **同一上下文** | 任意活动打开时，应能看到同一套 Issue / 指标 / 反馈 / 决策卡 |
| **对内执行、对外叙事分层** | Squad/评审用 Linear 细节；Stakeholder Catchup 用结局与决策，不把看板念一遍 |

```text
        ┌──────────── 组织节奏（人）────────────┐
        │ Daily → Weekly → Biweekly → Quarterly │
        │ 1:1 / Stakeholder Catchup             │
        │ In-person / Offsite / Summit          │
        └───────────────┬───────────────────────┘
                        │ 触发 / 消费
        ┌───────────────▼───────────────────────┐
        │ Calendar 排程 → Slack 触达 → Zoom 现场 │
        │ Claude 结构化 → Linear 执行             │
        │ Metabase/SF/Rippling 供数 → Audit 留痕 │
        └───────────────────────────────────────┘
```

---

## 2. 总览：活动地图

| 频率 | 活动 | 主目的 | 主真相源 | AI/Bot 角色 |
|------|------|--------|----------|-------------|
| 每日 | Squad Daily Standup | 暴露阻塞、当日焦点 | Linear Cycle | 会前阻塞清单；会后更新状态 |
| 每日 | Feedback Triage（异步） | 消化 `#feedback` | Linear + Slack | 自动评估建单，人审边界 |
| 每周 | Weekly 需求评审 | 决定做什么/不做 | Docs Spec + Linear | 会前 Spec 包与依赖图 |
| 双周 | Biweekly 进度同步 | 进度、风险、跨队依赖 | Linear + Metabase | 进度摘要、风险雷达 |
| 双周/按需 | **Stakeholder Catchup** | 与业务/客户/领导对齐预期与决策 | Docs 一页纸 + Linear 承诺 | 会前 Brief；会后决策/行动入库 |
| 双周 | Prompt / Harness Review | Agent 质量门禁 | Langfuse + Git | 跑分对比、坏例抽样 |
| 每月 | Catalog / 权限抽检 | Endpoint 与入离职对账 | Gateway + Rippling | 差异报告 |
| 每季 | Tech Town Hall | 技术方向、架构、文化 | Docs ADR + 录播 | 会前 FAQ、会后决策卡 |
| 持续 | 1:1 | 成长、绩效、关系 | Rippling + 私密笔记 | 可选会前个人工作摘要（脱敏） |
| 周期性 | In-person / Office Day | 高带宽协作、关系 | Calendar + 场地 | 议题预热、当日记录回流 |
| 定期 | Offsite（小队/部门） | 战略对齐、深度共建 | Docs + Linear Project | 会前材料包、会后 WBS |
| 年度/半年 | Summit / All-Hands | 公司叙事、跨组织对齐 | 主 Docs + 录播 | 议程助手、问答聚类、行动入库 |

---

## 3. 活动详解（会前 / 会中 / 会后）

每场活动统一三段式：

```text
BEFORE（工具自动） → DURING（人决策） → AFTER（工具入库）
```

---

### 3.1 Squad Daily Standup（每日）

| 项 | 内容 |
|----|------|
| **目的** | 同步「昨天→今天→阻塞」，不是深度设计 |
| **时长** | 10–15 min |
| **人** | Squad 全员 |
| **频道** | `#squad-<name>` + Calendar 短会 |

**工具咬合**

| 阶段 | 做什么 | 工具 |
|------|--------|------|
| 会前 T-15m | Bot 贴：In Progress / Blocked / 今日到期；`#feedback` 过夜新建单 | Slack Bot ← Linear / Feedback |
| 会中 | 只谈阻塞与需要他人的点；禁止长演示 | Zoom 或语音；屏幕只开 Linear 板 |
| 会后 | 状态变更、新阻塞建 Issue；无人认领 @lead | Linear；逾期自动 emoji |

**AI 不该做的事**：替人「编造进度」；Standup 文案必须以 Linear 状态为准。

**成功信号**：Standup 不再出现「我忘记更新票了」——票是会前唯一议程。

---

### 3.2 Weekly 需求评审（每周）

| 项 | 内容 |
|----|------|
| **目的** | 评审候选需求：问题、AC、范围、优先级、是否进下 Cycle |
| **时长** | 45–60 min |
| **人** | PM + Eng Lead + Design（按需 Sales/CS） |
| **输入池** | Linear 候选、`#feedback` 高分项、Salesforce 产品缺口、上期延期 |

**工具咬合**

| 阶段 | 做什么 | 工具 |
|------|--------|------|
| 会前（周一早） | Claude/PM 整理「评审包」：问题陈述、AC、Out-of-scope、依赖、相关反馈 ID、Figma 链 | Claude + Docs + Figma + Linear label `ready-for-review` |
| 会前 | Bot 汇总本周候选列表与估分（反馈热度、商机关联） | Slack + Salesforce（只读）+ Feedback score |
| 会中 | 逐项：做 / 缓 / 砍；改写 AC；指定 Owner | Zoom；实时改 Docs/Linear |
| 会后 | 通过项 → Linear Cycle + AC checklist；未通过 → 回 `backlog` 并写原因 | n8n/Bot 同步；知识库记决策卡 |

**和建造闭环的关系**：通过评审 = WF-03 的正式入口；未评审进开发 = 流程破坏。

**模板（评审包一页）**

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

### 3.3 Biweekly 进度同步（双周）

| 项 | 内容 |
|----|------|
| **目的** | 跨 Squad 看进度、风险、依赖、指标，不重做需求评审 |
| **时长** | 30–45 min |
| **人** | Squad leads + PM + 相关 stakeholder |

**工具咬合**

| 阶段 | 做什么 | 工具 |
|------|--------|------|
| 会前 | 自动生成「双周报」：Cycle 完成率、P0/P1 开放、依赖边、Datadog/Metabase 关键指标、Agent Harness 红灯 | Slack `#prog-sync` ← Linear + Metabase + Langfuse + Datadog |
| 会中 | 只讨论红灯与跨队依赖；绿项默认跳过 | Zoom；共享 Bot 贴的摘要 |
| 会后 | 风险 → Linear `risk`；依赖 → blocking link；指标异常 → 调研 Issue | Linear + 可选 Docs ADR |

**与 Weekly 需求评审分工**：Weekly 定「做不做」；Biweekly 定「做得怎样、卡在哪」。

---

### 3.4 Stakeholder Catchup（双周或按需）

| 项 | 内容 |
|----|------|
| **目的** | 与 **stakeholder**（业务负责人、客户成功/大客户、跨部门 Owner、领导）对齐：进展叙事、预期、决策、资源，而不是内部排期细节 |
| **时长** | 25–45 min |
| **人** | 主办：PM 或 Eng Lead；对侧：1–3 名 stakeholder；按需带 Sales（客户场） |
| **不是** | 不是 Squad Standup，不是 Weekly 需求评审，不是全员 Town Hall |

**常见类型**

| 类型 | Stakeholder | 额外真相源 |
|------|-------------|------------|
| 业务/内部 BP | 业务线 Owner、运营 | Metabase 业务指标、Linear 承诺 |
| 客户/账号 | AE/CS + 客户侧 | Salesforce Account/Opportunity |
| 领导抽查 | VP/Director | 双周报浓缩版 + 风险 Top3 |
| 跨部门依赖 | 其他 Squad/平台 Owner | Linear blocking links |

**工具咬合**

| 阶段 | 做什么 | 工具 |
|------|--------|------|
| 会前 T-24h | 生成 **Catchup 一页纸**：目标回顾、已交付、下一步、需决策项、风险、相关反馈/商机 | Claude + Docs；Linear（只取承诺级 Issue）；Metabase Question；可选 Salesforce |
| 会前 | 发到 stakeholder 可访问处（Docs 链或 Slack DM）；Calendar 标题带 `[Stakeholder]` | Calendar + Slack |
| 会中 | 按一页纸走：先决策项，再风险；细节 Issue 不逐条念 | Zoom；可共开 Docs |
| 会中（客户场） | 注意对外表述；敏感路线图按披露级别 | Salesforce 会后补 Note（HITL） |
| 会后 24h | 决策写入决策卡；承诺 → Linear（label `stakeholder-commit`）并 @owner；纪要回帖 | Linear + Docs + Slack；客户场回写 SF Activity |
| 会后 | 新需求意向 → 进 Weekly 需求评审池（`ready-for-review`），**不当场开干** | Linear backlog |

**与邻近活动的边界**

```text
Stakeholder 提出想法
  → Catchup 记录「意向 / 决策」
  → Weekly 需求评审 才定做不做与 AC
  → Biweekly 进度同步 对内看执行
  → 下次 Catchup 用一页纸闭环「上次承诺」
```

**AI 角色**：起草一页纸、抽取上次未闭环承诺、聚类 stakeholder 原话进 `#feedback`（若是产品声音）。  
**AI 不做**：替团队向 stakeholder 承诺日期；不自动改 Salesforce 阶段或对外发邮件（Front HITL）。

**成功信号**：连续两次 Catchup 能打开「上次承诺」列表且状态可追踪；stakeholder 不再私聊多处要同一份进度。

---

### 3.5 Quarterly Tech Town Hall（每季）

| 项 | 内容 |
|----|------|
| **目的** | 技术方向、重大架构、平台能力、工程文化；面向全技术组织 |
| **时长** | 45–90 min |
| **人** | 全体 Eng/Design/Data + 嘉宾；录播给异步同事 |

**工具咬合**

| 阶段 | 做什么 | 工具 |
|------|--------|------|
| 会前 1–2 周 | 征集议题：`#townhall-topics` 或表单 → Bot 聚类投票 | Slack + Claude 聚类 |
| 会前 | 演讲者交大纲进 Docs；相关 ADR 链上 | Google Docs |
| 会中 | 直播 + 实时 Q&A；Bot 聚类重复问题 | Zoom + Slack |
| 会后 48h | 决策与行动入库；FAQ 进知识库；录播链 Calendar/Docs | Linear + Algolia/Knowledge + Slack 纪要 |

**AI 角色**：聚类问题、起草 FAQ、检查「口头承诺」是否落 Linear——**不替代** Tech Lead 讲叙事。

---

### 3.6 1:1（持续）

| 项 | 内容 |
|----|------|
| **目的** | 成长、反馈、职业、阻碍、关系；**不是**状态会 |
| **时长** | 25–50 min |
| **人** | Manager ↔ Report |
| **权威源** | Rippling（汇报线）；私密笔记不进公共频道 |

**工具咬合**

| 阶段 | 做什么 | 工具 |
|------|--------|------|
| 会前 | 可选：个人工作摘要（完成 Issue、评审参与、Oncall）——**不含薪酬** | Bot DM ← Linear（私密） |
| 会中 | 人谈；可共开成长 Doc | Zoom / In-person；Google Doc（权限仅双方） |
| 会后 | 行动若涉及团队事务 → 当事人自己建 Linear；绩效相关只留在 People 系统 | Linear / Rippling（按政策） |

**红线**：1:1 内容默认不上公共 Agent、不上 `#feedback`、不进 Town Hall 素材。

---

### 3.7 In-person / Office Day（周期性）

| 项 | 内容 |
|----|------|
| **目的** | 高带宽协作、白板、信任、招聘氛围；补远程带宽不足 |
| **人** | 按办公室/小队 |

**工具咬合**

| 阶段 | 做什么 | 工具 |
|------|--------|------|
| 会前 | Calendar 标记 Office Day；议题预热（仍用 Weekly/Biweekly 产出） | Calendar + Slack |
| 现场 | 深度设计、配对、冲突化解；拍照/便签 | 白板 → 拍照上传 Docs/Figma |
| 会后当日 | 必须回流：决策卡 + Linear；禁止「只活在白板」 | Bot 提醒未闭环议题 |

**原则**：In-person 提高带宽，**不豁免**会后入库。

---

### 3.8 Offsite（小队 / 部门，定期）

| 项 | 内容 |
|----|------|
| **目的** | 战略对齐、路线图粗颗粒、团队健康、深度共建 |
| **时长** | 1–3 天 |

**工具咬合**

| 阶段 | 做什么 | 工具 |
|------|--------|------|
| 会前 2 周 | 材料包：指标、客户声音（SF/Front/Feedback）、技术债、容量 | Docs + Metabase + Salesforce + Linear |
| 会前 | 后勤：出行、预算（People） | Rippling / PandaDoc（若需协议）+ Calendar |
| 现场 | 工作坊；指定「文书官」或现场录音 | Zoom 录音可选；Figma/Docs |
| 会后 1 周 | 战略叙事 Doc + 拆成 Linear Projects/Milestones；向 Biweekly 汇报落地 | Claude 协助结构化 → 人改 → Linear |

**成功信号**：Offsite 后 7 天内，≥80% 行动有 Owner + Linear ID。

---

### 3.9 Summit / Company All-Hands（半年或年度）

| 项 | 内容 |
|----|------|
| **目的** | 公司叙事、跨组织对齐、文化、重大发布 |
| **人** | 全员（含 Sales/People/产研） |

**工具咬合**

| 阶段 | 做什么 | 工具 |
|------|--------|------|
| 筹备 | 议程、演讲稿、客户故事（SF 脱敏）、产品里程碑 | Docs + Salesforce + Linear Releases |
| 现场 | 主会 + Breakout；Q&A 收集 | Zoom/现场 + Slack `#summit-qa` |
| 会后 | Q&A 聚类 → FAQ；承诺 → Linear / People 行动；录播入库 | Claude 聚类 + Knowledge；Rippling 可发调研 |

**与 Tech Town Hall 区别**：Summit 是公司级叙事；Town Hall 是技术深度。

---

## 4. 一条时间轴：工具如何跟着人转

以两周为一个呼吸举例：

```text
每天
  Standup ← Linear 板
  Feedback Bot 消化 #feedback → Linear

周一
  Weekly 需求评审 ← 评审包（Claude/Docs/Figma/Feedback/SF）
  通过项写入 Cycle

每天继续建造
  Codex/Claude 开发 → CI/Harness → Flag → Datadog

第 2 周中段
  Biweekly 进度同步 ← 自动双周报（Linear+指标+Harness）
  Stakeholder Catchup ← 一页纸（承诺级叙事 + 待决策）
  风险与依赖入库；对外承诺进 `stakeholder-commit`

穿插
  1:1（Rippling 汇报线，私密）
  Office Day / In-person（回流决策）

季末
  Tech Town Hall（方向与 ADR）
  权限与 Catalog 抽检（Rippling↔Auth0）

半年/年
  Offsite（战略→Project）
  Summit（公司叙事→行动）
```

---

## 5. 「有机结合」对照表（活动 × 工具职责）

| 工具 | Standup | 需求评审 | 进度同步 | **Stakeholder** | Town Hall | 1:1 | In-person | Offsite | Summit |
|------|:-------:|:--------:|:--------:|:---------------:|:---------:|:---:|:---------:|:-------:|:------:|
| Calendar | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Slack | 议程帖 | 评审包 | 双周报 | 一页纸/DM | Q&A | DM 可选 | 预热 | 材料 | Q&A |
| Zoom | 短会 | 评审 | 同步 | Catchup | 主会 | ✓ | — | 可选录 | 主会/录 |
| Linear | 真相板 | 出入 Cycle | 风险/依赖 | **承诺级** Issue | 行动 | 偶发 | 回流 | Project | 承诺 |
| Docs/Claude | — | Spec/AC | 纪要 | **Catchup 一页纸** | ADR/FAQ | 私密笔记 | 照片纪要 | 战略包 | 演讲/FAQ |
| Figma | — | 设计输入 | — | 可选演示 | — | — | 共创 | 工作坊 | — |
| Metabase | — | 证据 | 指标 | 结局指标 | 大图 | — | — | 材料 | 大图 |
| Datadog/Langfuse | — | — | 红灯 | 仅重大事故 | 平台话题 | — | — | 技术债 | — |
| Salesforce | — | 商机缺口 | 可选 | **客户场主源** | — | — | — | 客户声 | 客户故事 |
| Front/Aircall | — | — | — | 可选客户声音 | — | — | — | — | — |
| Rippling | — | — | — | — | — | 汇报线 | 差旅 | 后勤 | 全员名单 |
| PandaDoc | — | — | — | 合同节点时 | — | — | — | 场地/NDA | 赞助/协议 |
| Algolia/Knowledge | 查决策 | 查旧评审 | 查风险 | 查历史承诺 | FAQ | — | — | 历史战略 | FAQ |

读表方式：勾选表示该活动**默认会碰**该工具；空白表示不要硬塞，避免仪式变成工具巡演。

---

## 6. 角色在节奏中的分工

| 角色 | 每日 | 每周 | 双周 | 每季 | 人场活动 |
|------|------|------|------|------|----------|
| Squad 成员 | Standup、推票 | 参与评审相关项 | 听同步、解依赖 | Town Hall | Offsite 共建 |
| PM | Feedback 边界 | **主持需求评审** | 进度叙事；**主持/出席 Stakeholder Catchup** | 议题输入 | Offsite 路线 |
| Eng Lead | 阻塞升级 | 技术可行性 | **主持进度同步**；关键 Catchup 陪同 | Town Hall 内容 | 架构深度会 |
| Design | — | 评审设计约束 | 体验风险；按需 Catchup | — | In-person 共创 |
| Sales | SF 活动 | 提供缺口证据 | 大客户风险；**客户场 Catchup** | — | Summit 客户故事 |
| People | 入离职事件 | — | — | 文化/调研 | Offsite/Summit 后勤 |
| Leadership | — | 抽查决策质量 | 看双周报；可发起 Catchup | Town Hall/Summit | Offsite 定方向 |
| Stakeholder（业务/客户） | — | 异步看一页纸评论 | **Catchup 决策与预期** | Summit/All-Hands | 按邀约 |

---

## 7. 异步优先：哪些不该开会

| 事 | 默认方式 | 何时升级开会 |
|----|----------|--------------|
| 状态更新 | Linear + Standup 自动帖 | 阻塞 >1 天 |
| 小 AC 澄清 | Slack 线程 + 改 Docs | 影响范围跨队 |
| 指标问答 | `@DataBot` | 口径争议 |
| 重复反馈 | Feedback Bot 挂 duplicate | 严重度争议 |
| Stakeholder 要进度 | 发 Catchup 一页纸异步批注 | 有待决策或预期冲突 → 开会 |
| 发版说明 | Linear Release + Slack | 事故或重大 breaking |

**AI Native 的会议变少，不是活动变少，而是低频高带宽活动更贵、更值得准备。**

---

## 8. 活动产出物规范（强制入库）

| 活动 | 必须产出 | 存哪 |
|------|----------|------|
| Standup | 阻塞票最新状态 | Linear |
| 需求评审 | 决策（做/缓/砍）+ AC | Docs + Linear |
| 进度同步 | 风险/依赖列表 | Linear `risk` / blocks |
| Stakeholder Catchup | 一页纸 + 决策 + `stakeholder-commit` | Docs + Linear（+ SF Note 若客户场） |
| Town Hall | 决策卡 + FAQ + 录播 | Knowledge + Docs |
| 1:1 | （可选）双方同意的行动 | 私密 Doc；团队事项进 Linear |
| In-person | 当日决策回流 | Linear + Docs |
| Offsite | 战略叙事 + Project 拆解 | Docs + Linear |
| Summit | 承诺清单 + Q&A FAQ | Linear + Knowledge |

没有产出物的活动，下一次应降级为异步或取消。

---

## 9. Calendar 命名与 Bot 触发约定

| Calendar 标题前缀 | 触发自动化 |
|-------------------|------------|
| `[Standup] Squad X` | T-15m Linear 摘要 |
| `[Req Review] Weekly` | T-2h 评审包链接汇总 |
| `[Prog Sync] Biweekly` | T-2h 双周报 |
| `[Stakeholder] ...` | T-24h Catchup 一页纸；会后承诺扫描 |
| `[Town Hall] Tech YYYY-QN` | 征集期 Bot + 会后纪要管道 |
| `[1:1] A / B` | 仅私密 Brief（需双方 opt-in） |
| `[Offsite] ...` | 材料包清单检查 |
| `[Summit] ...` | Q&A 频道自动创建 |

---

## 10. 新建一种活动时的检查清单

1. 主目的是否与现有活动重复？  
2. 会前 Brief 能否自动生成？数据从哪几个真相源来？  
3. 会中决策格式是什么？（一页模板）  
4. 会后 24–48h 内什么必须进 Linear/Docs？谁负责？  
5. 哪些字段禁止进公开 Bot？（PII、薪酬、1:1）  
6. 成功指标是什么？（例如「行动入库率」）  

---

## 11. 和文档其它部分的关系

| 你在… | 应先读 |
|-------|--------|
| 设计一场新会 | 本文 |
| 实现会前/会后自动化 | [WORKFLOWS.md](./WORKFLOWS.md)（会议闭环、反馈闭环） |
| 给 Bot 加 Skill | [SKILLS-MCP-PLUGINS.md](./SKILLS-MCP-PLUGINS.md)（`pre-meeting-brief`、`meeting-to-actions`） |
| 采购/账号 | [TOOLKIT-CHECKLIST.md](./TOOLKIT-CHECKLIST.md) |
| 分层架构 | [AI-NATIVE-INFRA.md](./AI-NATIVE-INFRA.md) |

---

*维护：组织节奏变更时（增减仪式）先改本文，再改 Calendar 前缀与 Bot 触发表。*
