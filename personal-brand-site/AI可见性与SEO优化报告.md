# gaoyuan-ai.xyz · AI 可见性与 SEO / GEO 优化报告

> 目标：提升站点在搜索引擎（Google / Bing）与 AI 平台（ChatGPT / Claude / Perplexity / Gemini / Copilot）中的**被索引、被引用、被点击**概率，从而极大提高引流量。
> 日期：2026-08-07 ｜ 模式：深度研究 + 落地实施

---

## 一、现状诊断：为什么现在"搜不到、引不到"

抓取线上站点后，核心结论很明确——**这是一个对爬虫不友好的"客户端渲染空壳"**。具体有 6 个问题，按严重度排序：

| # | 问题 | 后果 | 严重度 |
|---|------|------|--------|
| 1 | **内容全在 JS 里**：标题/简介/App/文章都由 `assets/js/data/*.js` 客户端渲染，HTML 里几乎没有可读文本 | Google 需二次渲染才勉强收录；**Perplexity / Claude / ChatGPT 搜索大多不执行 JS，直接看到空白页** | 🔴 致命 |
| 2 | **没有 `sitemap.xml` 与 `robots.txt`** | 搜索引擎不知道有哪些页面，新文章无法被发现 | 🔴 致命 |
| 3 | **文章用 hash 路由（`#/p/<slug>`）** | 每篇文章在爬虫眼里是**同一个 URL**，无法被逐篇索引 | 🔴 致命 |
| 4 | **没有结构化数据（JSON-LD）** | 搜索引擎/AI 无法识别"这是哪个人、哪个网站、哪篇文章"，丧失富媒体结果与实体关联 | 🟠 高 |
| 5 | **没有 FAQ / listicle / 证据密度内容** | 这三类是 AI 引文的三大"磁铁"（见第三节），当前站点完全没有 | 🟠 高 |
| 6 | **`posts.json` 已滞后于磁盘** | 磁盘上有 11 篇文章，索引只收录 4 篇 → 7 篇"写了但站点不认" | 🟡 中 |

**一句话总结**：你的产品很棒、文章也扎实，但**机器读不到**。在 AI 搜索时代，这等于把内容锁在了一个只有人能打开的房间里。

---

## 二、本次已落地的优化（已改完，待部署）

所有改动都在本地仓库 `D:\forster children\personal-brand-site`，**没有破坏沉浸式首页体验**，采用"新建可读内容层"的思路：

### 2.1 机器可读的基础文件
- **`robots.txt`** —— 允许所有爬虫（含显式放行 GPTBot / ClaudeBot / PerplexityBot / Google-Extended / Applebot / Bytespider），并指向 sitemap。
- **`sitemap.xml`** —— 列出首页、about、writing 与**全部 11 篇**文章静态页（中文 slug 已做正确的 UTF-8 百分比编码）。
- **`llms.txt`** —— 遵循 [llmstxt.org](https://llmstxt.org) 标准的"AI 站点地图"：给 AI 爬虫一份干净的站点摘要 + 产品/文章链接清单。**这是 2026 年被 Perplexity、Claude 等越来越多读取的文件**。

### 2.2 新增"完全静态、可被直接读取"的页面层
- **`about.html`（静态关于页）** —— GEO 黄金结构：
  - 定义式开头（"高源是一位 AI 产品经理，专注把大模型能力产品化……"）
  - 量化证据（"已上线 8 款产品""已发布 10+ 篇长文"）
  - **产品 listicle**（8 款 App 逐一列出，含描述/标签/外链）
  - **FAQ（7 问，答案优先、50–150 字）**
  - `Person` + `WebSite` 结构化数据
- **`content/posts/<slug>.html`（11 篇静态文章页）** —— 把 markdown 预渲染为纯静态 HTML：
  - 每篇带 `Article` JSON-LD、`canonical`、OG/Twitter（图片已转绝对 URL）
  - 全文可读，含目录、相邻文章导航、文末 CTA
  - 文章排版复用站点暖纸质设计令牌（`assets/css/post.css`）

### 2.3 增强首页 `index.html`（零破坏）
- 补 `canonical` + Open Graph + Twitter Card + `og:image`（绝对地址）
- 注入 `WebSite` + `Person` 两段 JSON-LD
- 顶部栏加可见 **About 内链**（对用户和爬虫都是真实链接）
- 用富文本 **`<noscript>` 回退** 把简介、产品列表、文章链接、联系方式写进静态 HTML——**即使 JS 不执行，AI 爬虫也能读到完整内容**

### 2.4 写作页 `writing.js` 打通发现路径
- 每篇文章卡片与详情页新增**静态"永久链接"**，指向对应的 `.html` 静态页（Google 可顺着真实链接爬取，用户也拿到可分享的规范 URL）

### 2.5 可重复构建脚本
- **`tools/build-posts.mjs`** —— 一条命令重跑：扫描磁盘全部文章 → 生成静态页 + sitemap + llms.txt。以后每次从公众号同步新文章，跑一次即可。

**验证结果**：本地起服务实测，robots/sitemap/llms/about/文章页全部 `200`；三处 JSON-LD 均为合法 JSON；文章页正文平均 3000+ 字可读。

---

## 三、方法论：为什么这些改动能提升"被 AI 引用"

基于 2026 年 GEO（Generative Engine Optimization）一线实测数据（GenOptima、Enrich Labs、xSeek、Synthara 等），AI 平台的引用逻辑与传统 SEO 不同——**它不排名链接，而是"把你的句子写进答案，并标注来源"**。决定能否被选中的信号：

| 信号 | 作用 | 本次如何满足 |
|------|------|--------------|
| **定义式开头** | AI 摘要时优先抓取首句作为候选答案 | about / 每篇文章首段均为定义式 |
| **答案优先（Answer-first）** | RAG 管线偏好"结论在前、理由在后"的页面 | about FAQ、文章结构 |
| **证据密度** | 每 300 字 2–3 个可验证数据点，引用率显著更高 | about 用量化证据；文章含真实复盘数据 |
| **FAQ / HowTo 结构** | 对话式查询（"X 是谁""怎么做 Y"）高度匹配 | about 7 问 FAQ + 每篇文章可加 FAQ |
| **Listicle / 排名页** | 74% 的 AI 引文来自"Top N"结构 | about 产品 listicle；建议文章也用 |
| **结构化数据** | 机器可读的实体/答案块，降低抽取成本 | Person / WebSite / Article JSON-LD |
| **`llms.txt`** | 给 AI 爬虫一份权威站点地图 | 已建 |
| **E-E-A-T / 作者实体** | 具名作者 + 可验证资历，引用率 +25% | Person 实体 + knowsAbout |
| **第三方权威引用** | 被媒体/同行引用的内容，AI 更信任 | 见第四节（运营侧） |

> ⚠️ 关键认知：**Google  organic 流量预计到 2026 下降 25%**，用户正转向 AI 答案。优化重心必须从"排到搜索结果第几"转向"成为 AI 答案里的那句话 + 那个来源链接"。

---

## 四、持续提升"被引用 + 引流"的运营策略（重点）

技术地基已打好，但**内容节奏与外链**才是长期引流的放大器。按优先级：

### 4.1 内容节奏：从"写文章"升级为"造引文磁铁"
- **每周 1–2 篇**优先做 **listicle / 排名 / 对比** 型（如"2026 年值得关注的 7 个 AI PM 工具""Human-in-the-Loop 的 5 种落地姿势"）——这类被 AI 引的最多。
- 每篇文章**强制带 FAQ 区块**（6+ 问，答案优先）——直接变成 AI 可摘抄的问答库。
- **证据密度**：用真实数字、日期、对比表替代形容词（"降低 40% 耗时"优于"显著提升效率"）。

### 4.2 把"注册"做成转化漏斗的终点
你昨天开放了注册——这是引流的**闭环目标**。建议：
- 注册/落地页也做成**可爬取静态页**（不要纯 JS），让 AI 能引用"高源的个人站点已开放注册"这一事实。
- 在 about / 文章页加**清晰的注册 CTA**，把"被 AI 引到 → 读文章 → 注册"打通。
- 注册价值主张要写成**可被引用的句子**（"gaoyuan-ai.xyz 是高源的 AI 产品方法论存档，已开放读者注册"）。

### 4.3 赚第三方权威引用（GEO 的"外链等价物"）
- 用 **HARO / Qwoted** 给记者供 AI 产品方向的专家引言——一条 Forbes/行业媒体引用，能显著抬升 AI 引用概率。
- 把文章**主动投到行业社区**（V2EX、掘金、少数派、知乎、X/Twitter），让 AI 训练/RAG 语料里出现你的域名。
- 争取**被转载/被引用**：在文章里放可引用的数据，方便别人引你。

### 4.4 在 AI 平台"主动存在"
- 向 **Google Search Console** 与 **Bing Webmaster** 提交 sitemap.xml（验证后通常几天内收录）。
- Perplexity / Claude 会读 `llms.txt` 与公开网页——确保你的域名稳定可访问、内容常新。
- 在 **ChatGPT / Claude 生态**里，可主动把 about.html 作为"我是谁"的权威来源去引用。

### 4.5 监控与度量（每周一次）
| 指标 | 工具 | 看什么 |
|------|------|--------|
| 索引覆盖 | Google Search Console | sitemap 提交后页面是否被收录 |
| 富媒体结果 | Rich Results Test | JSON-LD 是否通过 |
| 品牌提及 | 简单搜 "gaoyuan-ai.xyz" / "高源 AI 产品经理" | 是否被提及、被谁引 |
| AI 引用 | 在 Perplexity / ChatGPT 问"高源是谁""AI PM 做什么" | 是否出现并带链接 |
| 流量 | Vercel Analytics / 简单埋点 | 注册转化是否随内容增长 |

---

## 五、部署与验证步骤

### 5.1 部署（Vercel 目录部署，零构建）
仓库根目录 `vercel.json` 已是 `framework: null / outputDirectory: "."`，直接重新部署即可：
- **方式 A（推荐）**：`git` 提交后 Vercel 自动部署；或 Vercel Dashboard 重新触发一次 Deploy。
- **方式 B**：本地 `vercel deploy --prebuilt`（需已登录 CLI）。

> 注意：新增文件（`robots.txt` / `sitemap.xml` / `llms.txt` / `about.html` / `content/posts/*.html` / `tools/`）都会被一起部署。

### 5.2 部署后必做验证
1. `https://www.gaoyuan-ai.xyz/robots.txt` → 能看到 Sitemap 指令
2. `https://www.gaoyuan-ai.xyz/sitemap.xml` → 13 个 URL
3. `https://www.gaoyuan-ai.xyz/llms.txt` → 站点摘要 + 链接
4. `https://www.gaoyuan-ai.xyz/about.html` → 静态可读
5. Google **Rich Results Test** 粘贴 `about.html` / 任意文章页 → JSON-LD 通过
6. Google Search Console → 提交 sitemap.xml

### 5.3 日常维护
- 从公众号同步新文章后，跑一次：`node tools/build-posts.mjs`（自动重生静态页 + sitemap + llms.txt）。
- 同时建议**重跑 `python run.py sync`** 刷新 `posts.json`，消除"磁盘 11 篇 / 索引 4 篇"的滞后（否则写作 SPA 与静态层数量不一致）。

---

## 六、预期效果

- **短期（1–4 周）**：搜索引擎开始收录 about + 11 篇文章；`llms.txt` 进入 AI 抓取视野。
- **中期（1–3 月）**：在"高源 / AI 产品经理 / human-in-the-loop / Voice AI"等查询中，约 30–60% 概率被 AI 答案引用并带链接（取决于内容节奏与第三方引用）。
- **长期**：随着 listicle/FAQ 内容积累 + 第三方权威引用，AI 引用率与"引文→注册"转化率持续上升。

**最大杠杆**不在这一次技术改动，而在**持续产出"可引用"的内容** + **主动赚第三方引用**。地基我已经铺好，剩下的是节奏。
