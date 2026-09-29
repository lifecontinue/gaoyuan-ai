# 周报 2026-W40（09-28 ~ 10-04）

状态：进行中

## 本周综述

### 进展
-

### 决策与判断
-

### 风险与阻塞
-

### 下周
-

---

## 日报 2026-09-28

- 做了什么：对 AI 课堂角色代码做 code review 式梳理：服务端 `classroom_roles`（graph / prompts / role_prompts / tts / server / benchmark）+ 前端原型 `ai-classroom-roles-flow.html`，逐条对照 PRD D01–D09 标出实现位置和缺口。
- 判断/裁决：Phase A（导演规则 + 工具契约）在实验室基本成立；服务端没兜住的规则有 3 条：教师必选只在前端做、没教师时同学仍可能首答、「可以了吗」这类问句会误触 close 快捷路径。无鉴权、MemorySaver、localStorage 策略三项阻塞生产（对应 PRD Q1/Q2）。benchmark 缺少用 mock LLM 的确定性单测。
- 产物：会话内 review 结论（未改代码）。
- 下一步：用户确认后修服务端选角兜底 / close 正则 / `_run_child` 顺序 bug，并补单测。
- 阻塞：生产挂载链与策略表归属（PRD Q1/Q2）未定。

**续（修复 + 验证）：**

- 做了什么：用户确认「原型阶段生产阻塞项先不管，先备注 + 原型跑通；规则要兜住并出图」后执行修复。服务端 `graph.py`：注入默认教师、lead 取教师 > 助教 > 首位、同学首答改派、只对同学去重、cue 前补教学答、裸 close 补收束句、end_reason 白名单、问句/否定句不走 close 短路；`server.py`：`max_agent_turns` 限 1–6，缺 key 返回 503。原型修复 `setStatusBar` 无限递归（导致一直卡在「导演调度中」）。
- 判断/裁决：规则由「靠 prompt 自觉」改为「导演只提议、确定性规则执行」；生产阻塞项 B1–B9 写入 PRD 第 7 节，裁决 defer 到 Phase C。
- 产物：
  - `D:\software\langgraph\classroom_roles\tests\test_director_rules.py`（18/18 mock 单测通过）；`benchmark.py` 新增 BM09/BM10，live 11/11 通过（改前备份 `*.bak-20260928`）
  - `30-prd/ai-classroom-roles/diagram/director-rules-flow.svg` + `@2x.png`（规则兜底流程图）
  - PRD `prd-ai-classroom-roles-orchestration-2026-09-24.md`：2.2 新增「服务端兜底规则」，新增第 7 节「原型已知限制 · 生产阻塞项」
  - 原型 `ai-classroom-roles-flow.html`（两份副本已同步）：提问 → 教师首答 + 语音、「我明白了，谢谢」→ 收束，Playwright 实测通过，控制台只剩 favicon 404
- 下一步：进生产前按 PRD 第 7 节 B1–B9 逐项关闭；前端 `max_agent_turns` 改由策略下发。
- 阻塞：同上（Q1/Q2）。

**续（口径调整：只有讲师 + 同学）：**

- 做了什么：按用户口径取消「组班」和「助教」，对话角色只有 1 位讲师 + 若干同学。服务端 `graph.py` 用 `_normalize_roles` 替换原组班守卫（丢弃其他类型、多讲师只留第一位、无讲师注入默认讲师），lead 固定为讲师；`state.py` / `prompts.py` / `role_prompts.py` / `tts.py` / `server.py` 去掉助教，默认讲师改名 AI讲师。原型设置页改为「讲师（必选 1 位）/ 同学（可多选）」两组；学习页兼容旧 localStorage 里的助教数据。安装 ui-ux-pro-max skill（`.cursor/skills/ui-ux-pro-max`，uipro-cli），按其交互规范优化对话面板：推荐问题、讲师「正在思考」占位、角色标签、回答中可停止、结束/停止分隔线、读屏播报、可见焦点、减少动效；去掉 PRD 禁止的合成/播放状态条。顺手修了已存在的 bug：未勾选的同学也会出现在对话里。
- 判断/裁决：配色不采纳 skill 推荐的靛蓝方案，继续用帮建 DS；只取交互规范。历史附录文档里的「组班/助教」不回改，以 PRD 为准。
- 产物：
  - PRD：需求描述、D01/D02/D05/D07、配置流程图、兜底规则表、功能列表（新增 F13）、验收标准全部改为讲师 + 同学口径
  - `diagram/director-rules-flow.svg` + `@2x.png`、`diagram/ai-classroom-roles-architecture.svg` + `@2x.png` 已更新
  - 服务端单测 21/21（新增助教丢弃、多讲师只留一位、默认角色目录）；live benchmark 11/11；改前备份 `*.bak-20260928b`
  - 原型两份副本已同步，Playwright 验证：设置分组、旧数据兼容、思考占位、停止、收束分隔
- 下一步：用户验收新交互；如认可，可把 F13 交互规范同步进飞书 PRD。
- 阻塞：无新增。

**续（异常文案 + 出图清晰度 + 空状态对齐帮建 DS）：**

- 做了什么：给出 agent 失败（「回答生成失败，请稍后重试。」+ 重试；超时变体）和 TTS 失败 tooltip（「语音播放失败，点击重试」）文案；规则流程图改为 @4x 并放大字号重出；学习页 AI 面板空状态按帮建 DS 欢迎态重做：标题 20/28 + 说明 14/22 + 分割线 + 「你可以这样问」12/20 + 示例标签（#F5F5F5、圆角 6、间距 12、悬停变 #1677FF），在顶栏和输入框之间垂直居中，去掉灰底卡片和描边胶囊。
- 判断/裁决：空状态只用现有 `--bj-*` token，不新增 token。
- 产物：`diagram/director-rules-flow@4x.png`（PRD 引用已改）；原型两份副本已同步，Playwright 验证居中、悬停、点击示例后欢迎区隐藏。
- 下一步：用户确认后把异常文案写进 PRD 和原型（替换现在「导演服务未连通」的技术提示）。
- 阻塞：无。

**续（音文同步）：**

- 做了什么：修复「agent 回复时音文不同步」。原因是原型先把字打完再放语音，两者串行。服务端 `tts.py` 改用 edge-tts `WordBoundary`，`/tts` 额外返回词级时间戳 `marks`（文字 / 起始毫秒 / 时长）；前端改为语音开始播放才出字，出字进度按音频当前时间对齐到词，没有时间戳时（火山、浏览器语音）按字数 + 标点停顿比例铺满时长。顺手修了停止按钮：清空音频后播放 Promise 挂起，导致没有「已停止本次回答」、还会回退到浏览器语音。
- 判断/裁决：语音失败时台词照常展示（与异常文案口径一致）；等待音频最多 8 秒，浏览器语音 2 秒内没开播就放弃。
- 产物：`classroom_roles/tts.py`、`server.py`（备份 `*.bak-20260928c`）；原型两份副本已同步。实测 105 字讲师回答，出字比例与播放进度基本一致（约 10.4/21 秒时显示 53/105 字），在标点处停顿；TTS 返回 500 时回退浏览器语音仍同步；中途停止时文字停在对应位置；单测 21/21。
- 下一步：首句出声前还要等整段合成（105 字约 4 秒），可改为按句切分合成，让第一句约 1 秒就出声。
- 阻塞：无。

**续（讲师收尾 + 只在最后提问）：**

- 做了什么：用户发现一轮回答以同学追问结束、没人回应。`graph.py` 新增两条确定性规则：一是终态前最后一条是同学时，讲师必须回应后才结束（导演点同学时要给讲师留名额，否则跳过该同学）；二是只有本轮最后一条讲师发言可以问学员，中途讲师的指令要求不提问，兜底去掉末尾问句。`prompts.py` 导演规则加第 12、13 条，调度示例改为讲师 → 同学 → 讲师；原型本地兜底也改为讲师收尾。
- 判断/裁决：规则放服务端执行，不只靠 prompt；为了回应同学，允许超出发言上限一条（trace 记 `over_budget`）。
- 产物：`graph.py` / `prompts.py`（备份 `*.bak-20260928c`）；单测 27/27（新增 6 条）；live 3 题全部符合；原型实测三张卡片顺序为讲师 → 同学 → 讲师；PRD 兜底规则表新增 3 行、证据行更新。
- 下一步：用户验收。
- 阻塞：无。

**续（原型细节）：** 角色名行标签去掉残留下边距，名字、标签和播放圆点垂直居中；顶栏头像悬停改为角色卡片浮层（头像 + 名称 + 讲师/同学标签 + 人设描述，最多 4 行），参考用户给的人设卡样式，标签沿用帮建现有配色；浮层挂在侧栏内（侧栏 z-index 为最大整数）。「正在说话」头像参考用户图和会议软件改为白色间隙 + 主色实线圈 + 沿圈转动的小圆点 + 一层呼吸柔光，去掉三圈波纹和头像下的音量条；亮圈时机改为音频真正开播时，等待合成期间不亮。侧栏标题改为「AI课堂」。

**续（异常状态）：**

- 做了什么：按用户定稿文案补齐前端异常状态。回答失败（接口报错 / 返回空 / 30 秒超时）显示黄色错误卡片「回答时间有点长，请稍后重试。」+ 重试；断网换文案并在输入框上方挂提示条；超过 10 秒显示「正在整理回答，请稍候」；语音失败时台词完整展示，语音图标变黄，悬停「语音暂时无法播放，点击重试」，点击重播成功后恢复。去掉「导演服务未连通，已用本地示例回复」的假回复和底部技术提示。
- 判断/裁决：帮建 DS 没有警告色，暂用同色板 `#FAAD14` 三件套，写进 PRD 待设计确认；部分角色失败静默跳过。
- 产物：原型两份副本已同步；PRD「异常分支」改为 7 行规范表。Playwright 逐项验证：慢提示、失败卡片、重试（不重复插入问题）、断网卡片与提示条（恢复后消失）、语音失败变黄与悬停提示、点击重播恢复。顺手重启了卡死的 8765 静态服务。
- 下一步：设计确认警告色是否入 DS。
- 阻塞：无。

**续（北森 skill 解析 + 钉钉 A One 对齐）：**

- 做了什么：解析本机 14 个北森 skill（`C:\Users\haida\.claude\skills\beisen-*`）：共享底座 + 数据查询六步流水线 + 员工/考勤/组织/知识/办事/审批 + 招聘六件套；本机未安装 `beisen-cli`。钉钉 alignment meeting 结论落 inbox → intake，并同步 Linear。
- 判断/裁决：合作对象改为钉钉 A One 团队（非传统 ISV），accept；技术对接维持一期最简版本；千问办公要求 skill + mcp，PRO-35 defer 待重评（未改状态）；深推开发仍等万总准信。
- 产物：
  - `10-inbox/dump/2026-09-28-dingtalk-aone-alignment-meeting.md`
  - `20-intake/2026-09/dingtalk-aone-alignment/00-judgment.md`
  - Linear：新建 PRO-73～77；P-PRO-2 状态更新 + Agent Context 第 7 条；PRO-72 / PRO-35 评论
  - 北森 skill 架构图（PRO-77 素材）：`60-research/competitive/diagram/beisen-skill-architecture/beisen-skill-architecture.svg` + `@2x.png`（用户/Agent → Skill 层 → beisen-cli → 北森云；右侧响应式登录流程 + data-query 6 步）
- skill + mcp 方案选型（会话内）：除北森「Skill + 本地 CLI」外还有本地 MCP、远程托管 MCP、平台原生技能（钉钉「自定义能力」/ Coze / Dify）、带界面技能（卡片 / H5）、子 Agent 接入。判断：我方主干宜为「远程 MCP + 平台无关 Skill 说明书」，陪练走 H5 深链；CLI 暂不做。钉钉 MCP 广场、组织技能库为实证（官方文档）；千问办公要求的具体格式为缺口，待问陆老师。
- MCP 推进与成本（会话内）：最简版约 3～4 周 / 6～9 人周，标准版约 6～8 周 / 12～18 人周（推断）。本地代码证据：鉴权为 Redis 会话 + corpCode 路径，未见 OAuth 授权服务，仅竞赛有 Swagger；学习 / 考试 / 陪练核心仓不在本地（缺口）。结论：身份与授权是最大成本项；CLI 与 MCP 后端投入相同，差在分发与适用的 Agent。
- 北森 14 skill 全维度分析文档（PRO-77 验收项 1、2）：`60-research/competitive/beisen-skill-analysis-2026-09-28.md`，含边界 / 命令入参 / 输出与敏感 / 其他维度四张表、sceneTool 与租户场景配置机制、7 处文件不一致、对我方启示。
- 领导版飞书文档《北森 HR Skill 拆解》（个人云空间）：[飞书链接](https://shuiiiiqqq.feishu.cn/docx/NyQsdtaIJoP9oHxxUymc3xD5nCf)。综合架构、14 skill、登录权限、sceneTool、防翻车规则、局限与不一致、我方方案比较 / 投入估算 / 待确认事项；草稿 `draft_f3952fe8_folder/draft.xml`。
- 北森方案是否适配 WorkBuddy（会话内判断）：适配。本机实证：WorkBuddy 有 `skills/`（同款 SKILL.md 格式）、`mcp.json`、能执行本地命令；北森 skill 目前只装在 `~/.claude/skills`，未装进 WorkBuddy。结论：WorkBuddy 与 Claude Code 同属本地桌面 Agent，北森式「Skill + 本地 CLI」可用，但我方远程 MCP 在 WorkBuddy 同样能接，主干不变；WorkBuddy 连接器市场能否作为分发渠道为缺口。
- 千问办公生态接入白皮书（伙伴版 v0.0.2）：原件 `10-inbox/dingtalk/2026-09-28-千问办公-生态接入白皮书-伙伴版.html`，判断 `20-intake/2026-09/dingtalk-aone-alignment/01-qwenwork-whitepaper.md`，裁决 accept（PRO-35 规格输入）。实证：连接器仅公网 HTTP MCP + OAuth（PKCE、client_id qwenwork、3 个回调加白），stdio / API Key 不能上架；技能须为完整任务。据此更新领导版飞书文档：一页结论补千问硬要求；局限改为实证；新增 8.1 千问接入要求、8.2 北森对照表；方案比较加「千问能否上架」列与专家套件行；借鉴第 6 点；待确认事项重写。保留用户手改（skill.md 用词、删除投入估算节）。
- 下一步：向沐总要钉钉客户数据（PRO-73）；跟进陆老师问清 A One 与抵押金（PRO-76）；写北森 skill 分析文档（PRO-77）；国庆后出万总推进说明（PRO-74）。
- 阻塞：抵押金未明确；万总准信未到。

**续（AI 课堂回答中打断的边界情况）：**

- 做了什么：梳理回答进行中（思考 / 出字 / 播报）用户点旧消息播放、重新生成、停止、关面板、新建会话、恢复听课、断网等打断操作的处理规则，并对照原型 `ai-classroom-roles-flow.html` 查了现有行为。
- 判断/裁决：四条原则：同一时刻只允许一个进行中的回合和一个发声源；只有显式操作才能终止回合；服务端上下文只记学员看到的内容；迟到的数据按回合 ID 丢弃。回答中旧消息的播放、重新生成和推荐问题一律置灰；重新生成只放在最后一轮，语义是整轮重跑并替换。
- 原型现状（实证）：点旧消息「播放」会调 `stopTts()`，顺带把 `turnSeq` 加一，当前回答被静默终止并插入「已停止本次回答」；「停止」没有取消 `/chat` 请求，服务端 thread 仍会写入学员没看到的台词；「重新生成」按钮没有绑定处理函数；原型的流式是一次性拿全部台词再在前端逐字显示，不是真流式。
- 用户确认后执行：服务端 `/chat` 接收 `turn_id`，同一会话的多轮请求排队执行；新增 `POST /turn/rollback`，回退到这一轮开始前的检查点（`shown=null` 整轮撤回，数组则只留已展示文字 +「学员中途停止」；只允许回退最后一轮；导演还在跑时延后回退）。原型：停止会取消请求并回传已显示文字；回答中历史消息的播放置灰、重新生成隐藏；重新生成只挂在最后一轮，先撤回再重答；重试前撤回失败的那轮；关面板等同停止。
- 产物：
  - `classroom_roles/graph.py`（`rewind_turn`）、`server.py`（回合登记 + `/turn/rollback`），备份 `*.bak-20260928d`；单测 33/33（新增 6 条回退用例）；8768 已重启
  - 原型两份副本已同步；Playwright 实测：回答中点历史播放不打断、停止后服务端只收到已显示的半句、重新生成先撤回再重答且不重复插入问题、思考中停止返回 `deferred: true` 且草稿保留
  - PRD：D07 补一条；2.2 新增「回答中的打断规则」（四原则 + 13 行处理表 + 服务端契约 + 证据）；功能列表新增 F14；验收新增「回答中打断」8 条；开放问题新增 Q6；第 7 节新增 B10（流式是前端模拟）、B11（回合登记只在内存）
- 下一步：Q6 定口径；生产换真流式时按 `turn_id` 取消服务端运行。
- 阻塞：Q6 待定（不阻塞原型）。
- 收尾：按用户要求删除 Playwright 临时截图 / 快照 / 日志，以及 `classroom_roles` 今天所有 `*.bak-20260928*` 备份（17 个，上文提到的备份路径已不存在）；删除后单测仍 33/33。

**续（TBC 调查查询 skill）：**

- 做了什么：参照北森 `beisen-applicant-follow-up` + `beisen-shared` 的「Skill + 本地 CLI + 响应式登录」结构，做了 Cursor 可调用的 `tbc-survey-query` skill：Python CLI 用本人浏览器 Cookie 调 `tbc.21tb.com/qsm/html/*` 只读接口，支持调查列表、详情、完成率、逐题统计、已交 / 未交名单、问答题作答明细。
- 判断/裁决：登录方式用「浏览器复制 Cookie → 从剪贴板导入」，不做账号密码登录（现网登录接口未摸清，且可能有验证码）；Cookie 只存 `%USERPROFILE%\.tbc\credentials.json`，不进工作区和 Git。只读查询无需 CSRF token（源码实证：只有模板编辑和 csrf 接口带 `@ElnCsrfCheck`）。
- 产物：`C:\Users\haida\.cursor\skills\tbc-survey-query\SKILL.md`、`scripts\tbc_survey.py`。接口来源：`app-qsm` 的 `SurveyAction` / `SurveyMonitorAction` + `10-inbox/dump/2026-09-17-qsm-questionnaire-api-schema.md`。冒烟测试：无凭证返回 `TBC_AUTH_MISSING`；假 Cookie 打现网返回 403，识别为 `TBC_AUTH_EXPIRED`，未落盘。
- 真实数据联调（用户提供 Cookie 后）：7 个命令全部跑通，不需要 `current_app_id`。修了四处：① 列表去掉 `survey.version=1.0`（老页面参数，只能查到老版调查；实测我管理的调查从 0 条变为 5 条，授权给我的共 387～392 条）；② 调查模式大写 `ANONYMOUS` 未翻译；③ 单题作答人数服务端恒为 0，改为不展示；④ 匿名调查的问答明细服务端仍返回部门，改为一并隐去，防止被反推出作答人。
- 实证：「《公司AI产品讲解》课后调研」完成率 107/763（14.0%），满意度「非常满意 + 满意」占 96.3%，改进项最多的是「增加案例分析」（60.75%）。未提交名单 419 人，少于全量未提交的 656 人，原因是名单按账号的数据管辖范围过滤（源码 `listUnAnsweredUser`），已写进 SKILL.md。
- 下一步：用户在 Cursor 里直接用自然语言提问试用；Cookie 过期后按 skill 引导重新导入。
- 阻塞：无。
- 分享版整理（v0.2.0）：去掉本机专属内容，包括 Cursor / Windows 专用脚本路径、工作区源码与 inbox 路径、「周报 / intake」字样、内部项目名、带个人数据的实测记录；脚本入口改为「本 skill 目录/scripts」，兼容 Cursor 和 Claude Code；域名默认 `tbc.21tb.com`，其他企业首次登录时用 `--base-url` 指定；剪贴板读取支持 Windows / macOS / Linux；新增安装说明（Python 3.8+、`pip install requests`），并注明接口是 Web 内部接口、不是开放 API。已确认凭证在 `~/.tbc/`、不在 skill 文件夹内；清理了 `__pycache__` 和文件 BOM。
- Bugbot 审查 + 修复（v0.2.1）：Bugbot 报 5 条，逐条核实均成立，另自查 3 条，共修 8 处：① 重新登录会把已保存的租户域名重置为默认值；② 同时清空已保存的 `current_app_id`；③ SKILL.md 关于「域名自动沿用」的描述与脚本行为不符；④ 发布中的调查只看开始时间、不看结束时间，详情接口会把已过期调查显示为进行中；⑤ 已提交名单读 `employeeCode`，服务端实际把工号放在 `cardNo`（源码 `QuestionnaireUserServiceImpl` L517），工号一直为空；⑥ Cookie 文件不存在时抛出堆栈；⑦ 未提交名单部门字段回退有漏洞；⑧ 403 可能是凭证失效也可能是无权限，SKILL.md 补了区分规则，避免反复让用户重新登录。离线单测 12/12 通过（临时凭证路径，未联网、未碰真实凭证）。
- 支持私有化部署（v0.3.0）：用户口径「不一定是 tbc，可能做私有化部署」。去掉默认域名 `tbc.21tb.com`，首次登录必须 `--base-url`；地址可粘贴主机名、页面网址或 qsm 接口请求网址，自动识别站点根地址，保留私有化部署的路径前缀和端口，支持 http；新增 `--insecure`（内网自签证书，需用户确认后使用）；新增 `TBC_TLS`（证书校验失败）、`TBC_NOT_FOUND`（地址不对或平台版本缺少接口）两类错误；SKILL.md 登录流程改为向用户要请求网址（不含登录信息），补充内网 / VPN / 版本差异的处理规则。已保存的旧凭证照常可用。离线测试 11/11 + 本地 404 模拟通过。
- 结构拆分（v0.3.1）：「接口说明（维护用）」从 SKILL.md 移到 `references/api.md`，SKILL.md 只留一行指引（仅排查接口时读取、不向用户展示）。
- 浏览器登录（v0.4.0）：用户希望「只给账号密码、skill 自己拿 Cookie」。判断：登录中心源码不在本地（缺口），线上登录页为 JS 渲染、平台存在 SSO 通道（实证），直连账号密码接口脆弱且密码会进对话 → 用户选定折中方案：`auth login --browser` 弹出 Edge/Chrome，用户本人登录（兼容验证码 / 扫码 / SSO），脚本轮询 Cookie 并以调查列表接口校验后保存；手动粘贴 Cookie 保留为兜底；新增 `TBC_DEP`。离线测试 4/4 通过；**真实弹窗登录待用户实测**（缺口：登录后的 Cookie 是否无需再进调查管理即可调用 qsm）。
- Token 优化（v0.5.0）：用户在 WorkBuddy 安装使用耗时 7 分 8 秒、token 偏高。复盘分享页（实证）：安装时通读全部文件做安全审计；PowerShell 按 GBK 解码 Python 的 UTF-8 输出导致乱码，Agent 多轮落盘重试并自建 `tbc_run.py`；Agent 预检凭证 / 依赖、追加演示查询。优化：SKILL.md 从 ~3.7k 降到 ~1.3k token（登录流程拆到 `references/auth.md`，出错才读；安装与安全说明拆到 `README.md`）；写明 PowerShell 先设 `[Console]::OutputEncoding=UTF8`（本机实测捕获输出中文正常）；输出改紧凑 JSON（5 条列表省 36% 字符）；禁止预检和追加演示查询。WorkBuddy 内已装旧版需重新安装。
- 风险评估 + 飞书文档：用户自评两点（接口写在脚本有暴露风险、无统一鉴权），判断：第一点部分成立（接口地址本就可见，真实风险是对外披露接口语义、支持负担、批量拉取绕过导出审计），第二点成立且为根因；补充：数据发给模型厂商、只读靠约定（代码层写接口未见 CSRF 注解）、提示词注入、匿名调查作答明细服务端泄露部门（平台缺陷）、非官方接口脆弱、无限流、无更新渠道。建议 B（限内部试用 + 过渡加固）+ C（官方 AI 接入立项评估），缺陷单独提。产物：飞书文档 [21tb 调查查询 AI Skill：能力、风险与下一步建议](https://shuiiiiqqq.feishu.cn/docx/BIvAdB4WQoXk34xhFQvc2hZ2n7I)；草稿 `draft_04814a36_folder/`。待决策：是否对外分发、允许的模型范围、是否立项。
- 过渡加固落地（v0.6.0，推动内部试用）：Cookie 分段存入系统钥匙串（Windows 凭据管理器单条上限需分 3 段），旧明文凭证读取时自动迁移并抹除，logout 同时清钥匙串；answered / unanswered 默认只出总数 + 部门分布，answers 默认不含姓名，`--names` 才返回具名数据，匿名调查任何参数都不出部门，具名命令取消 `--raw`；请求限流每秒 ≤2 次，SKILL 规定批量超 50 次请求先确认；作答原文标注为不可信内容并写入规则；README 增加内部试用须知（仅内部、领用登记、模型范围、版本）与已知限制；新增 `--version` / `auth status` 显示版本。离线测试全过，真实凭证已迁移、汇总查询实测通过。内部分发包 `C:\Users\haida\.cursor\skills\tbc-survey-query-v0.6.0.zip`。缺口：登记表链接待定；注入防护只验证了输出标注，未做模型行为测试；浏览器登录仍未实测。

## 日报 2026-09-29

- 做了什么：把 AI 课堂原型前后端上线到 Vercel（Production）。后端 `classroom_roles` 单独放在部署目录 `D:\software\classroom-roles-vercel`（包副本 + `app/main.py` 入口 + `requirements.txt` + `vercel.json`），新建 Vercel 项目 `ai-classroom-roles-agent`，不动 `langgraph` 根目录里帮建 `ai-bangjian-agent` 的配置；`DEEPSEEK_API_KEY` / `VOLC_TTS_*` 从本机 `.env` 直接写入 Vercel 环境变量（未打印、未进仓库）。前端 `CLASSROOM_API` 改为：在 `*.vercel.app` 上用云端后端，本机仍用 8768，可用 `localStorage.classroomApi` 覆盖（与帮建同一写法）；后端 CORS 加入前端域名；前端新增短链 `/classroom`。
- 判断/裁决：沿用帮建「前端 + 云端 Agent」的做法；会话检查点仍是内存，serverless 冷启动或换实例后多轮上下文可能丢失，演示可接受，生产仍按 PRD B 项处理。
- 产物：
  - 前端：https://ai-classroom-roles-flow.vercel.app/classroom#learning
  - 后端：https://ai-classroom-roles-agent.vercel.app（`/health` 显示 has_key=true、edge TTS 可用）
  - 原型两份副本已同步；`standard-course-create/vercel.json` 新增 `/classroom`；`langgraph/classroom_roles/server.py` 的 CORS 同步加入线上域名
  - 线上实测：提问后讲师 → 同学 → 讲师三张卡片，无错误卡片，语音正常（`/chat` 约 5.6 秒，`/tts` 1.2～2.7 秒）
- 下一步：后端代码改动后需重新拷贝到部署目录，再执行 `vercel deploy --prod`。
- 阻塞/风险：线上后端无鉴权，拿到地址的人都能消耗 DeepSeek 额度；需要时可开 Vercel 访问保护，或在演示后下线。

**续（需求→上线工作流落盘 + Linear 子任务）：**

- 做了什么：用户口述的 6 步流程写入 memory；问卷确认范围=SDGH 在途 + 池内 7 条、池内建完整 8 步。补完全部产品子任务（PRO-79～PRO-201）。
- 判断/裁决：tracked = 需求板 + 池内待评审；钉钉 / AI 学习 / AI 另轨不碰。八类子任务：【评审】【方案】【排期】【跟进】【验收·测试环境】【部署】【验收·正式环境】【闭环】。池内【评审】due=今天 14:00。
- 产物：
  - `00-os/playbooks/demand-to-release-workflow.md`；Cursor 个人规则；`AGENTS.md` / atlas 已挂
  - 对照表 `20-intake/2026-09/jira-demand-board-map/workflow-subissues-2026-09-29.md`
- 去重：8 条因接口超时重复建出的子任务已标 Duplicate（PRO-88/114/120/121/135/162/163/166），每个父需求每环节只剩一条。
- 下一步：今天下午用 PRO-146/151/159/169/179/186/194 做评审；纳入后把后续子任务从 Backlog 拉进 Todo。
- 阻塞：无。
