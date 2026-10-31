# 07 · PM 自动化交付流水线（需求 → Vibe Coding → PR → 上线同步）

面向 **PM**：用现有 AI Native 基建，把「收集需求 → 分析 → vibe coding 出 prototype → 出 plan → 确认后开 PR → 工程师审核（简单需求可自动合并部署）→ 每天 Slack 同步上线内容」串成一条可重复流水线。

工程师仍对架构、迁移、鉴权、生产安全负责。PM 负责把上下文备齐、用 Agent 出可审查的变更，而不是绕过评审。

配套：[架构](./01-ARCHITECTURE.md) · [工作流](./02-WORKFLOWS.md) · [Agent](./04-AGENTS-RUNTIME.md) · [清单](./05-TOOLKIT.md) · [Onboarding](./06-ONBOARDING.md)

---

## 1. 流水线总览

```text
① 需求收集          Slack #feedback / Zoom / Docs / SF / Front
        ↓
② 需求分析          Claude + Canvas：问题、用户、AC、风险、复杂度打分
        ↓
③ 上下文装配        拉取下方「资源目录」：数据、Schema、API、DS、Prompt…
        ↓
④ Vibe Coding 原型  Replit / Cursor / Codex：可点的 prototype 或分支草稿
        ↓
⑤ Plan 确认         变更面、AC 对照、风险门禁 → PM + Eng 确认（简单单可自动）
        ↓
⑥ PR 提交           GitHub PR + 自动检查 + Harness（若动 Agent/Prompt）
        ↓
⑦ 分流
   ├─ 简单 / 低风险 → 自动合并 + 自动部署（Flag 默认关或已有安全默认）
   └─ 常规 / 高风险 → 工程师 Review → 合并 → 部署 / 灰度
        ↓
⑧ 上线同步          每日 Slack Bot：今日合并/发布清单 + 链接 + 负责人
```

复杂度与风险决定人停在哪一站，而不是「AI 能不能写代码」。

---

## 2. 阶段说明（PM 视角）

### ① 需求收集

| 来源 | 工具 | PM 做什么 |
|------|------|-----------|
| 产品反馈 | Slack `#feedback` → Bot → Linear | 看 Bot 分类与 score；争议进 triage |
| 会议 | Zoom 转写 → Meeting Scribe → Linear | 确认 action owner；补 AC |
| 书面 | Google Docs / Claude Canvas | 结构化问题陈述 |
| 设计灵感 | Figma 注释 / 探索稿 | 标清是否已是需求 |
| 销售缺口 | Salesforce 字段 / Brief | 进 `#feedback` 或 `ready-for-review` |
| 客服 | Front / Aircall 摘要 | 合并进同一 Linear 主题 |

产出：Linear Issue（或一组 Issue）+ 源链接（Slack/Doc/Figma/SF）。

### ② 需求分析（Claude）

用固定 Spec 模板（可放公司 Docs / Claude Project）：

```yaml
problem:           # 谁在什么场景下痛
users_roles:       # 角色与权限含义
success_metric:    # 最好带 Metabase question_id
ac:                # 可验证条目，每条将来可对 PR
out_of_scope:
constraints:       # 性能、合规、多区域、无障碍等
complexity:        # S | M | L（见下节打分）
risk_flags:        # migration | auth | billing | pii | infra | none
prototype_goal:    # vibe coding 要证明什么（交互？数据？文案？）
agent_needs:       # 是否新 Endpoint / 新工具 / 新 Prompt
resource_refs:     # 见第 3 节：schema、api、ds、prompt 路径
```

分析时主动问 Claude：**缺哪类资源**（没有 Schema 就不要开始写库表；没有 Design Token 就不要发明颜色）。

### ③ 上下文装配（关键）

PM 在开 vibe coding 前，把 Agent 能读到的「公司资源」备进 Replit / Cursor 上下文或 Catalog 白名单。缺资源时先补文档或找 Eng 开只读 Endpoint，而不是让模型瞎编。

完整清单见 **第 3 节**。

### ④ Vibe Coding 出 Prototype

| 场景 | 推荐宿主 | 说明 |
|------|----------|------|
| 交互/文案/流程验证 | **Replit** | Secrets=逻辑 key；Endpoint=Catalog；快速可点 |
| 贴合真实前端栈 | **Cursor / Codex** 开 feature 分支 | 读仓库 AGENTS、Design System、现有组件 |
| 仅逻辑/SQL 验证 | Replit + Metabase Gold / 只读 API | 禁止自由写 Lake |

Prototype 验收（PM 自检）：

- [ ] 主路径可点通，对应 AC 至少覆盖 80% 的「可演示」部分  
- [ ] 用的是设计系统组件/token，不是临时 CSS 丛林  
- [ ] 调用的是 Catalog 内 API，错误态有基本处理  
- [ ] 无真实密钥、无生产写死凭证  
- [ ] 已知限制写在 Linear 评论（「未接真实权限」「用 mock 数据」）

### ⑤ 制定 Plan 并确认

Prototype 不是终点。PM（可让 Claude 起草）输出 **Implementation Plan**，贴 Linear 或 PR 草稿描述：

```markdown
## Plan
- 目标与非目标
- 拟改目录 / 服务（frontend / backend / 两者）
- 数据：是否新表/新字段；是否迁移（有则必须 Eng 批）
- API：新/改 endpoint；鉴权与对象级权限
- UI：页面、组件、Design System 引用
- Flag：开关名、默认值、回滚方式
- 测试：单测/手测清单；对照 AC
- 风险：migration | auth | billing | pii | infra
- 分流建议：auto-merge / eng-review（附理由）
```

**确认人**：

| 分流 | 谁确认 Plan |
|------|-------------|
| 简单低风险 | PM 自检 + 自动化规则通过（见第 4 节）即可开 PR |
| 常规 | PM + 对应 Eng（异步评论即可） |
| 高风险 | Eng Lead 书面同意后再写生产向代码 |

### ⑥ 开 PR

- 分支从前缀规范（如 `pm/` 或团队约定）从最新主干拉出。  
- PR 正文：Spec 链接、Plan、AC checklist、Prototype 链接/录屏、验证步骤、风险、文档是否更新。  
- CI：lint / test / secret scan；动了 `prompts/**` 或 agents → Harness。  
- `pr-agent` / 自动审查：PM 先处理明确项，拿不准 @ Eng。

### ⑦ 工程师审核 vs 自动合并部署

见第 4 节门禁。原则：**简单 = 变更面小且无风险旗标**；不是「PM 觉得简单」。

### ⑧ 每日 Slack 上线同步

n8n / Bot 定时（如 18:00 或次日 09:30）：

```text
拉取：昨日至今 merged PR + 生产/预发部署记录 + Linear「Done」且带 release 标签
整理：标题、作者、PR 链接、关联 Linear、Flag 状态、是否 auto-merge
发到：#shipped 或 #release-notes（产品）+ 可选 @相关 squad
```

模板示例：

```text
📦 上线同步 YYYY-MM-DD
• [LIN-123] 导出按钮文案修复 — PR#456 — @pm — auto-merge
• [LIN-130] 学生列表筛选 — PR#460 — @eng — Flag: list_filter=on@10%
明日注意：LIN-130 灰度中，问题请丢 #feedback
```

---

## 3. 过程资源目录（PM 必须知道「去哪找」）

Vibe coding 与 Plan 的质量，取决于上下文是否是**公司真相**，而不是模型幻觉。下列资源应进 Catalog / 仓库路径 / Claude Project Knowledge，并在 Spec 的 `resource_refs` 里点名。

### 3.1 数据来源（Data Sources）

| 资源 | 典型位置 | PM / Agent 怎么用 | 禁止 |
|------|----------|-------------------|------|
| 产品业务库 | PostgreSQL 等（经 API） | 经只读/业务 API 理解实体 | 直连生产库改数据 |
| Data Lake | S3 + 查询引擎 | 分析用；经 Metabase | Agent 对 Bronze 自由 SQL |
| Metabase Gold | 已审 Question / Dashboard | 定成功指标；DataBot 只跑 ID | 复制临时 SQL 当长期契约 |
| Algolia 索引 | 搜索/反馈去重索引 | 理解检索字段与同义 | 手改生产索引结构 |
| Salesforce | Account / Opportunity | 需求背景、客户缺口 | 用 Agent 改金额/关单 |
| Front / Aircall | 工单与通话摘要 | 质性证据 | 把 PII 贴进公开 Spec |
| Contentful | CMS 条目模型 | 文案/内容型需求 | AI 直接 publish |
| 功能开关配置 | Darklight / Flag 服务 | 灰度与回滚 | 生产默认开危险开关 |
| 用户反馈库 | Linear + Slack 源链 | 优先级与复现 | 忽略 Bot 的 duplicate 提示 |
| 埋点事件字典 | Datadog / 分析文档 | AC 里写「打什么事件」 | 发明未注册事件名却不上字典 |

**PM 检查清单**：Spec 是否写清「读哪些实体、写哪些实体、指标用哪个 question_id、埋点事件名是否已存在」。

### 3.2 Schema（数据模型）

| 资源 | 典型位置 | 用途 |
|------|----------|------|
| DB schema / 迁移历史 | `services/*/migrations` 或 schema 文档 | 字段类型、约束、是否已有列 |
| ER / 领域模型说明 | `docs/domains/*.md`、DBML、Schema 图 | 实体关系与业务不变量 |
| GraphQL / API schema | `schema.graphql`、OpenAPI | 可查询字段与 mutation |
| CMS content model | Contentful content types | 内容字段与发布态 |
| 事件 schema | 埋点字典 JSON/YAML | 属性名、类型、必填 |
| 配置 schema | Flag / Darklight 配置项 | 开关 payload 形状 |
| Agent 状态 schema | Copilot state / thread 元数据文档 | 勿与业务表混淆 |

**规则**：Plan 若出现「新表/新列/改枚举」→ 自动标 `risk: migration`，取消 auto-merge，走 Eng。

### 3.3 API（接口契约）

| 资源 | 典型位置 | 用途 |
|------|----------|------|
| Endpoint Catalog | 公司 Catalog JSON（Gateway） | **唯一**允许 Agent/Replit 调用的接口白名单 |
| REST / RPC 文档 | OpenAPI、内部 Portal | 请求响应样例 |
| GraphQL 文档 | GraphiQL、schema 注释 | query/mutation 与权限 |
| BFF / 聚合接口 | 前端用的 gateway API | 避免 PM 直接打一堆底层服务 |
| Webhook 目录 | n8n / 事件总线文档 | Slack、Zoom、SF、Rippling 入边 |
| MCP tool 列表 | 内部 MCP 目录 | 组织 Bot 可调工具 |
| 错误码表 | API 错误手册 | Prototype 要演示的失败态 |
| 幂等与限流说明 | Catalog `rate_limit` | 防 vibe coding 打爆接口 |

**Replit Secrets**：只放 `COMPANY_GATEWAY_KEY` + Auth0 M2M；**Endpoints**：只勾选 Catalog 中 `access_level=read` 或已批的 `draft_write`。

### 3.4 Design System（设计系统）

| 资源 | 典型位置 | 用途 |
|------|----------|------|
| 组件库 | 仓库 `design-system/` 或 Storybook | 按钮、表单、弹层、表格 |
| Design Token | Figma Variables / JSON tokens | 色、字号、间距、圆角 |
| 布局与栅格 | DS 文档 | 页面骨架 |
| 图标与插画规范 | 图标集路径 | 禁止临时外链图标 |
| 无障碍约定 | a11y checklist | 对比度、焦点、aria |
| 文案语气 | Voice & Tone Doc | 按钮文案、空态 |
| Figma 主文件 | 团队 Library | 真源；prototype 对齐组件名 |
| 主题 / 多品牌 | theme provider 文档 | 勿写死单品牌色 |

**Magic 约束（可写进 Prompt）**：优先复用现有组件；新增组件必须在 Plan 里声明并 @ Design。

### 3.5 Magic Prompt（提示词与指令资产）

把「一次性聊天」升级为**版本化资产**（进 Git + Langfuse）：

| Prompt / 指令包 | 用途 | 建议路径或宿主 |
|-----------------|------|----------------|
| `spec-authoring` | 需求 → Spec YAML | Claude Project / Skill |
| `complexity-router` | 打分 S/M/L + 风险旗标 | LangGraph 或 Claude |
| `context-packer` | 按 Spec 收集 schema/api/ds 引用 | Skill + Catalog |
| `vibe-frontend` | 按 DS + API 出 UI 草稿 | Cursor/Replit system prompt |
| `vibe-backend` | 按模块边界出 handler 草稿 | Codex Skill |
| `plan-from-prototype` | 原型 → Implementation Plan | Claude |
| `pr-body-writer` | Spec+Plan → PR 描述 | GitHub App / Skill |
| `ac-traceability` | AC ↔ 文件/测试对照表 | Harness 辅助 |
| `release-digest` | PR 列表 → Slack 上线文案 | n8n + LLM |
| `feedback-triage` | 已有反馈分类 | 组织 Bot |
| 仓库 `AGENTS.md` | 编码交活铁律 | 全仓 |
| 领域 runbook | 迁移/鉴权专项 | `docs/` |

每条 Magic Prompt 要有：输入 schema、输出 schema、禁止事项、所属 Harness（若影响生产 Agent）。

### 3.6 Frontend Format（前端约定）

| 资源 | 说明 | Agent 必须遵守 |
|------|------|----------------|
| 框架与语言 | 如 React + TypeScript | 不引入未批准的新框架 |
| 目录结构 | pages / components / hooks / … | 改对目录；单 workspace |
| 样式方案 | Styled / Tailwind / DS | 与项目一致，禁止混用三套 |
| 状态管理 | Context / Zustand / Redux 等 | 按模块现有模式 |
| 表单与校验 | 项目统一库 | 错误展示一致 |
| 路由与 URL | 路由表文档 | 深链与权限路由 |
| i18n 格式 | 文案 key 规范 | 新文案走现有字典 |
| 日期/数字/货币格式 | locale 工具 | 勿手写格式化 |
| 测试约定 | Jest / RTL 等 | 关键交互补测 |
| Feature Flag 接入 | hook 名与默认值 | 新 UI 默认关 |
| 包体积/懒加载 | 现有 lazy 模式 | 大页不一次打满 |

### 3.7 Backend Arch（后端约定）

| 资源 | 说明 | Agent 必须遵守 |
|------|------|----------------|
| 服务边界 | monorepo 内 api / worker / fringe | 不跨服务乱改 |
| 模块结构 | modules / domain 划分 | 业务进对模块 |
| API 风格 | GraphQL / REST / 混合 | 跟现有入口 |
| 鉴权中间件 | Auth0 / session / RBAC | 新接口挂同一套 |
| 数据访问 | Query builder / ORM 规范 | 无字符串拼 SQL 注入 |
| 迁移工具 | Knex 等 | 只新增迁移；先问人 |
| 异步任务 | Queue / Scheduler | 长任务不挡请求 |
| 配置与 Secret | AppConfiguration / Secrets Manager | 不读错环境 |
| 观测 | 日志字段、trace id、Datadog | 关键路径打点 |
| 错误模型 | 统一错误码 | 与前端约定一致 |
| 测试 | 单测 / DB 集成测 | 权限与跨对象用例 |

### 3.8 其它常被漏掉、但 PM 流水线要用的资源

| 资源 | 用途 |
|------|------|
| **环境矩阵** | local / staging / prod 差异；Prototype 默认 staging 或 mock |
| **账号与角色夹具** | 测试用户、角色矩阵表（integration users） |
| **Fixture / Mock** | Replit 无后端时的 JSON 契约，需标注「非生产」 |
| **CI 流水线定义** | 什么检查不过不能合 |
| **部署流水线** | 自动部署触发条件、审批人 |
| **Flag 命名规范** | `team_feature_verb` |
| **Linear 工作流状态** | Triage → Ready → In Progress → In Review → Done |
| **分支与 PR 规范** | 前缀、标题、关联 `LIN-xxx` |
| **Audit / Langfuse 项目** | 评估 vibe 过程与 Bot 行为 |
| **Harness 金标集** | 改分类/文案 Bot 时必跑 |
| **On-call 与回滚 runbook** | 自动合并后出问题找谁 |
| **法务/合规清单** | Cookie、同意、未成年人、PII 字段 |
| **依赖白名单** | 禁止 AI 随便加 npm/pypi 包 |

---

## 4. 简单需求：自动 PR 合并与部署

### 4.1 复杂度打分（`complexity-router`）

| 分 | 含义 | 例 |
|----|------|-----|
| **S** | 单侧展示/文案/开关已有位；无 schema 变更 | 文案、空态、埋点属性补齐、纯 CSS 间距 |
| **M** | 单服务内逻辑 + UI；可能小 API 字段 | 列表筛选、已有 API 新参数 |
| **L** | 跨服务、新模型、迁移、鉴权、计费 | 新权限、新表、支付 |

### 4.2 自动合并必须同时满足

```text
complexity = S
且 risk_flags = none
且 只改允许路径白名单（如 apps/web/src/components/**、文案字典）
且 无 migrations/**、无 auth/**、无 billing/**、无 devops/**
且 CI 全绿（lint/test/secret scan）
且 自动审查无 blocker
且 PR 关联 Linear 且 AC checklist 自填完成
且 Flag 策略：无新危险默认；或仅改已有 Flag 文案
且 作者是批准的 PM bot 或白名单人类账号
```

任一不满足 → **必须 Eng Review**，禁止 auto-deploy。

### 4.3 自动部署

- 合并到主干后走现有 CD；**staging 先**，prod 按团队策略（S 可连续，仍建议 Flag）。  
- 部署事件写入 Audit；失败自动通知 `#incidents` 与作者。  
- 回滚：Revert PR 或关 Flag；Bot 在上线同步里标「已回滚」。

### 4.4 工程师审核队列（非 S）

Linear 标签 `needs-eng-review`；Slack 通知值班 Eng；SLA 例如工作日 24h。Eng 重点看：授权、数据、DS 滥用、范围蔓延、测试缺口。

---

## 5. 编排实现参考（n8n / LangGraph）

| 步骤 | 编排 | 输入 | 输出 |
|------|------|------|------|
| 收集聚合 | n8n | Slack/Zoom/SF webhook | Linear Issue |
| 分析 | LangGraph + Claude | Issue + 历史反馈 | Spec Doc + complexity |
| 装上下文 | Skill `context-packer` | Spec + Catalog | resource_refs 包 |
| 原型 | 人在 Replit/Cursor 触发 | resource_refs + vibe-* prompt | 预览 URL / 分支 |
| Plan | Claude | 原型说明 + diff 摘要 | Plan Markdown |
| 门禁 | GitHub Action | diff 路径 + labels | auto-merge 允许/拒绝 |
| PR | GitHub API | 分支 + PR body prompt | PR URL → Linear |
| 部署 | 现有 CD | merge 事件 | 环境 URL |
| 日报 | n8n cron + release-digest | GitHub releases/PRs | `#shipped` |

全程：OpenAI SDK → Gateway；Trace → Langfuse；写操作 → Audit。

---

## 6. PM 每日/每周节奏（与本流水线咬合）

| 节奏 | 做什么 |
|------|--------|
| 每日上午 | 看 `#feedback-triage` 与 Linear 自动单；决定进分析还是进 Cycle |
| 每日开发中 | 1～2 个 S/M 走 vibe → plan → PR |
| 每日定时 | 读 `#shipped`；异常丢 `#feedback` 或开 regression |
| Weekly 需求评审 | M/L 与风险项带 Spec+资源引用上会；S 可异步 |
| Biweekly | 看 auto-merge 占比、回滚次数、Eng 排队时长（Metabase） |
| Stakeholder | 一页纸用 `#shipped` 聚合，不念 PR 列表 |

---

## 7. 度量（建议 Metabase Gold）

| 指标 | 含义 |
|------|------|
| 需求→首次 PR 中位时长 | 流水线是否真加速 |
| auto-merge 占比与回滚率 | 门禁是否过宽 |
| Eng Review 中位等待 | 人机分工是否健康 |
| AC 在发布后的满足率 | Datadog / 业务指标对照 |
| Spec 含 resource_refs 的比例 | 上下文装配是否落地 |
| `#shipped` 消息后 24h 反馈量 | 同步是否有效 |

---

## 8. 反模式

| 反模式 | 正确做法 |
|--------|----------|
| 无 Schema/API 文档就开始 vibe | 先补 resource_refs 或只做 mock 并标明 |
| 把生产 key 放进 Replit | 只放 Gateway 逻辑 key |
| 用「我觉得简单」跳过 Eng | 用路径白名单 + risk_flags 规则 |
| Prototype 直接当生产 PR 且无 Plan | 先 Plan，再净化合规 diff |
| 自动合并含迁移 | 永远人工 |
| 上线不同步 | 强制 `#shipped` 定时任务 |
| Magic Prompt 只在聊天里 | 进 Git + 版本 + Harness |

---

## 9. 启动检查清单（PM 团队一周内）

- [ ] Claude Project 装入：Spec 模板、DS 链接、Catalog 说明、AGENTS 摘要  
- [ ] Replit 模板：Secrets 占位 + Endpoint 从 Catalog 拉取  
- [ ] GitHub：`pm-auto-merge` 规则与路径白名单  
- [ ] Linear：状态、标签 `auto-merge-candidate` / `needs-eng-review`  
- [ ] n8n：每日 `#shipped`  
- [ ] Langfuse：spec / vibe / release-digest 三条 trace 名  
- [ ] 与 Eng Lead 书面确认：S 级定义与禁止路径  
- [ ] 试跑 3 个真实 S 需求全流程，再开自动合并  

---

## 10. 和其它文档的关系

- 反馈进 Linear、会议进 Action：仍以 [02-WORKFLOWS.md](./02-WORKFLOWS.md) 为准。  
- Weekly 评审如何消化本流水线的 M/L：[03-ORG-CADENCE.md](./03-ORG-CADENCE.md)。  
- 迁移/鉴权红线：[04-AGENTS-RUNTIME.md](./04-AGENTS-RUNTIME.md)。  
- 账号与频道：[05-TOOLKIT.md](./05-TOOLKIT.md)。

返回目录：[README.md](./README.md)
