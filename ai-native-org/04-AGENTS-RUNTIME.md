# 04 · Agent 运转手册

说明三种运行实体如何工作、权限如何切分，以及**迁移、鉴权、Harness、MCP/Skill** 的操作规范。给 Tech Lead、安全与写仓库规则的人看。

---

## 1. 三种 Agent，不要共用一把钥匙

| 名称 | 宿主 | 读什么 | 默认可写 | 身份 |
|------|------|--------|----------|------|
| **编码 Agent** | Codex / Cursor / Claude Coding | 仓库、本地文件、已配 MCP | 工作区、测试、git（按规则） | 开发者本人的 SSO + 本地凭据 |
| **产品 Copilot** | Web / App 抽屉 | 请求上下文 + 业务 API | 线程/草稿；发布类要人审 | 后端 **M2M** |
| **组织 Bot** | Slack + LangGraph / n8n | 频道、日历、Linear、只读 SF/Metabase | 回帖、建 Linear、写草稿 | 独立 **M2M**，scope 更窄 |

同一个人可以触发三种，但 **token / 逻辑 key 必须拆开**。闲聊 Bot 绝不能持有生产 DB migrate 或 CMS publish。

```text
人（SSO）
  ├─ 编辑器 → 编码 Agent（人的云与本地权限）
  └─ 浏览器 → 产品 API（用户 session）→ M2M → Gateway → 模型
机器
  └─ Slack/n8n → 组织 Bot M2M → Gateway → MCP/工具 → Audit + Langfuse
```

---

## 2. 编码 Agent：一次任务怎么跑

### 2.1 仓库里的说明书（最少集）

```text
/
  AGENTS.md              # 分支、验证、文档、高风险、PR 格式
  docs/business-map.md   # 域指路
  docs/domains/*.md      # 权限、状态、副作用
  docs/log.md            # 只追加
  apps/*/AGENTS.md       # 前端命令与边界
  services/*/AGENTS.md   # 后端、迁移约定
  .agents/skills/        # 可选：可复用操作手册
```

### 2.2 内部步骤

```text
1. 定位
   读根规则 + 当前应用规则
   只打开任务相关文件，禁止无目的全仓遍历

2. 改
   默认单 workspace
   不碰 bootstrap / env 加载 / 部署脚本——除非任务就是这个

3. 验
   跑被改包的最小检查（type / lint / 相关测试）
   全仓无关失败：写进 PR，不装绿

4. 文档
   权限/可见性/状态机/校验/副作用变了 → 改 domain 文档 + log
   没变 → PR 写明「无需更新，因为…」

5. 交
   最新主干拉分支；一次一事；conventional commit
   PR：摘要 / 验证 / 知识库 / 风险
   处理自动审查里能确定的问题；吃不准标给人
```

编码 Agent 等于**借用开发者权限**，所以高风险条款必须写进 `AGENTS.md`，不能靠自觉。

---

## 3. 迁移（Schema / 数据回填）

### 什么算迁移任务

- 新建表、加列、改类型、加索引、改约束/外键/枚举
- 数据 backfill、种子与权限表变更

### 强制流程

1. Agent 识别到上述改动 → **先停**，用人能回答的方式确认：是否做、命名是否定、要否 backfill、回滚怎么做。
2. 人明确同意后才生成迁移文件；必须有 **up 与 down**（或团队等价回滚）。
3. **禁止修改**已在任一共享环境执行过的旧迁移文件；只能新增。
4. 数据迁移用事务；大批量可重跑；不要一次性不可恢复脚本。
5. 本地 migrate → 相关集成测试；需要时演示 rollback。
6. PR 单独列出：表、锁风险、backfill、回滚、是否要 DBA/负责人批准。
7. 合并后按环境执行：dev → staging → prod；**Agent 不直接打生产**。

### 可以 / 不可以

| 可以 | 不可以 |
|------|--------|
| 按现有风格起草迁移与回填草稿 | 自己决定 drop 字段 |
| 补索引与类型说明 | 在生产执行 migrate |
| 写测试 | 把密钥写进迁移/seed |
| | 改历史迁移哈希「图省事」 |

---

## 4. 鉴权与授权

鉴权 bug 常表现为「演示能过，别人能看见不该看的数据」。

### 改之前必须说清

- 调用方：浏览器用户、员工、M2M、匿名？
- 凭证：cookie、Bearer、SSO、client credentials？
- 模型：角色、资源关系、还是硬编码名单？
- 失败：401、403、还是空列表？（空列表会藏洞）
- 对象级：换一个别人的 id 能否读出资源？

### 强制流程

1. 停下来复述将改变的登录/权限行为，等人确认。
2. 不改密钥加载入口与「从哪读环境变量」的引导脚本——除非任务就是修这个。
3. 真实 secret 不进仓库、示例、文档、agent 工作日志；示例用占位符。
4. 新 API：先鉴权 → 再对象归属 → 再业务。
5. 测试覆盖：未登录、错误角色、跨对象 id。
6. Copilot 后端用独立 M2M；工具查询**复用普通 API 的授权函数**，不用超级账号。
7. 泄露：先吊销逻辑 key，再换厂商 key；Audit `key.rotated` / revoke。

### 产品 Copilot 鉴权链

```text
用户 session
  → API 确认身份 + 「能否访问上下文对象」
  → M2M 调模型网关
  → 工具层仍以该用户数据权限查询
```

### 组织 Bot 鉴权

- Slack 用户映射员工身份后，再决定能否查指标、建 Linear。
- 默认可：回帖、建任务草稿。
- 默认拒绝或 HITL：改 SF 金额/关单、PandaDoc send、CMS publish、生产配置。

---

## 5. 产品 Copilot 请求路径

**入口**：通用助手 / 引导流程 / 岗位专用。入口决定系统提示、工具集、能否生成文档。用 Feature Flag 包住整入口。

**上下文**

| 类型 | 来源 | 注意 |
|------|------|------|
| 对象 | 当前客户/学员等 | 先对象级授权再序列化 |
| 文档 | 已关联材料 | 限条数与体积 |
| 页面 | 路由 + 可见区摘要 | 发送时再取；可脱敏；勿把整页 DOM 持久化 |

**后端**：流式 `POST`；messages + contexts + entrypoint；工具走业务 API；线程落库；Langfuse 记提交/首 token/成功/失败。

---

## 6. 组织 Bot：反馈评估（LangGraph）

```text
ingest → normalize → classify（Gateway + schema）
      → dedup（Algolia/Linear）
      → evaluate（规则 + LLM-as-judge + 可选 Harness）
      → create/link Linear 或追问
      → Slack 回帖 + 按钮
      → Audit + Langfuse
```

置信度低于阈值不自动建单。转人工后状态机只收集、不改任务状态。

分类 schema 示例：

```json
{
  "name": "classify_feedback",
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
      "confidence": { "type": "number", "minimum": 0, "maximum": 1 }
    }
  }
}
```

---

## 7. PM × Replit：Secrets 与 Endpoint

PM 用 Replit 试 Agent / 调接口时：

1. Secrets 只放 `COMPANY_GATEWAY_KEY`、Auth0 M2M（非厂商原始 key）。
2. Endpoint 列表从公司 **Catalog JSON** 拉取；UI 上不可手填任意生产 URL。
3. 默认 access_level = `read`；需要 `draft_write` 走审批。
4. 用 Metabase 时只调 Gold Question ID，不贴裸 SQL 到共享 Agent。
5. 实验代码不带生产写权限；要写 Linear 用 Bot 的 draft 流程。

这是「告诉 AI 能调哪些接口」的正规方式：Catalog + Gateway，而不是把一串 key 塞进 Prompt。

---

## 8. Skill / MCP / Plugin / Harness

| 概念 | 是什么 | 例子 |
|------|--------|------|
| MCP | 模型可调的工具协议服务 | `create_issue`、`run_question` |
| Skill | 步骤、约束、何时调哪些 MCP | `feedback-triage`、`meeting-to-actions` |
| Plugin | 宿主安装单元 | Slack App、Cursor 规则包、Claude Project |
| Harness | 可重复评测支架 | `harness-feedback-classifier` |
| Agent | Skill + MCP + 模型 + 权限的运行实体 | `feedback-eval-bot` |

```text
Plugin（Cursor / Slack / Claude）
  └─ Skills
       └─ MCP Servers
            └─ API Key Gateway + Auth0
                 └─ Audit / Langfuse
```

### 建议首批 MCP（均经 Gateway；写默认 HITL）

| MCP | 用途 |
|-----|------|
| mcp-slack / mcp-linear | 反馈与任务 |
| mcp-calendar / mcp-meeting | 会前会后 |
| mcp-docs / mcp-figma | Spec 与设计 |
| mcp-metabase | Gold 查询 |
| mcp-langfuse / mcp-harness | 观测与评测 |
| mcp-github | PR 评论、CI |
| mcp-salesforce | 只读 Brief；写草稿 HITL |
| mcp-rippling / mcp-pandadoc | People；send HITL |
| mcp-contentful | draft；publish HITL |
| mcp-front / mcp-aircall | 摘要；不自动外发 |
| mcp-audit / mcp-secrets | 审计；secrets **禁止**进对话 Agent |

### 建议首批 Skill

| Skill | 何时用 |
|-------|--------|
| feedback-triage | `#feedback` / 评估反馈 |
| meeting-to-actions | 转写 → Linear |
| pre-meeting-brief | Calendar T-30 |
| stakeholder-catchup-brief | `[Stakeholder]` 会 |
| spec-authoring | Claude 出 Spec |
| metrics-answer | Metabase Gold |
| sales-opportunity-brief | 客户会前 |
| support-summarize | Front/Aircall |
| people-lifecycle-sync | Rippling（跑在 worker，非闲聊） |
| pandadoc-draft | 合同/Offer 草稿 |
| pr-ai-review / agent-release | PR 与发版 |
| repo-delivery | 编码 Agent 按 AGENTS 交活 |

### Harness 套件

| Harness | 测什么 | 门禁 |
|---------|--------|------|
| harness-feedback-classifier | type/severity/area | PR + 日更 |
| harness-dedup | 是否正确挂 duplicate | PR |
| harness-meeting-actions | action 完整度 / 幻觉 owner | 周更 |
| harness-metrics-grounding | 是否带 question_id | PR |
| harness-pii-redaction | PII 是否进 Linear/Slack | 强制 |
| harness-tool-policy | 无 scope 是否拒写 | 强制 |

金标条目形态：

```json
{
  "id": "fb-017",
  "input": { "text": "支付成功但权益未到账，订单 123" },
  "expect": {
    "type": "bug",
    "severity": "S1",
    "area": "billing",
    "must_not_contain_in_linear_description": ["完整手机号"]
  }
}
```

复杂调参（prompt、路由、阈值、成本/质量权衡）：先定目标与护栏 → 小矩阵实验 → 跑 Harness → 再改生产配置。

---

## 9. 权限矩阵（摘要）

| Skill / Agent | 建 Linear | 发 Slack | 读 PII | 发布/发送 | Gateway 管理 |
|---------------|-----------|----------|--------|-----------|--------------|
| feedback-triage | ✓ | ✓ | 脱敏 | ✗ | ✗ |
| meeting-to-actions | ✓ | ✓ | 低 | ✗ | ✗ |
| metrics-answer | ✗ | ✓ | ✗ | ✗ | ✗ |
| sales-opportunity-brief | ✓（产品回流） | ✓ | 低 | ✗ | ✗ |
| people-lifecycle-sync | ✗ | ✓ | 高受限 | ✗ | 身份相关 |
| pandadoc-draft | ✗ | ✓ | 高受限 | send=HITL | ✗ |
| coding（repo-delivery） | ✗ | ✗ | 代码内 | ✗ | ✗ |
| incident cutswitch | ✓ | ✓ | ✓ | ✗ | 受限角色 |

---

## 10. 事故时切断 Agent

```text
怀疑误写 / 泄露 / 模型供应商故障
  → #incidents
  → Gateway 关闭该 agent 的 write scope（保留只读诊断）
  → 修代码或 Prompt + Harness 回归
  → 复盘 → Linear → 更新 Skill / Runbook
```

下一篇：[05-TOOLKIT.md](./05-TOOLKIT.md)
