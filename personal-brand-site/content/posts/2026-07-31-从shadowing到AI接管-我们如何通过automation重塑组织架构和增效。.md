---
title: '从shadowing到AI接管: 我们如何通过automation重塑组织架构和增效。'
slug: 2026-07-31-从shadowing到AI接管-我们如何通过automation重塑组织架构和增效。
date: '2026-07-31T09:30:00'
author: gaoyuan
account: AI Prodlab
summary: 一个automation项目的失败，通常不发生在技术环节。我把最近半年的项目实践经验完整呈现给你看。
categories:
- 静夜思
tags:
- AI产品
cover: assets/img/posts/2026-07-31-从shadowing到AI接管-我们如何通过automation重塑组织架构和增效。/002-e30a7e033e.jpg
original: true
word_count: 5924
wechat_url: https://mp.weixin.qq.com/s/EwE-pZcgXZsS1hQgJRgEgg
source_url: ''
wechat_sn: EwE-pZcgXZsS1hQgJRgEgg
imported_at: '2026-08-07T14:58:37'
---

> 过去半年，我在公司里负责一个两百多人的核心岗位automation。pattern跑通了，围绕dashboard的automated monitoring to reminders上线了，Region by region 去做training推广，ramp up到80%以上的员工——然后在 7 月的一个晚上，整个项目差点被C位们一句话砍掉。
>
> 这篇文章不聊技术。聊的是一个更少有人写、但每个想在企业里推 automation 的人都会撞上的问题：技术做出来了，怎么让它在组织里活下去？

### 0、先讲那个差点掀翻一切的晚上

7 月 18 日，预算评审。某O看着我们的方案说了一句话，大意是：为什么实施automation战略半年了，XX岗位和Tech Team这边预算反而都增加了上千万的预算？这不 make sense。

那一刻我脑子里闪过的不是反驳，是一连串数字：dashboard 活跃用户197 人，NPS100%Promoter，subjectline从allocation到开始上课的时长从 316 小时压到 116 小时，降了 63%......这些全都发生在短短两个月。

但它们没有出现在决策者的脑子里。C位们只关注一个核心指标：半年前立项时，要求我们能够通过AI automation裁减一半以上的岗位人数。

再回顾我们汇报的结果，比如计算workload时，当初推断Allocation tutor这件事理论上能automate到87.1%，对上6月实际的渗透率12.7%。

87.1% 对 12.7%。在不了解上下文的人眼里，这不叫落差，这叫失败。

五个月的技术成果，一夜之间被重新定价。

虽然后续通过整理汇报材料、对比立项文档，重新汇报，说服了高层。

**我们一直以为automation就是一场技术仗。可让它在组织里活下来，真正要打的是三场完全不同的仗：workflow、organization、decision。技术只是入场券，这三场才是生死线。而这三场，我们没有足够重视。**

---

### 1、我们怎么开始的：从 shadowing 到breakdown

一切的起点不是技术，是观察。

我们先用 shadowing 加上一线访谈，把这个角色每天到底在做什么，从头到尾摸了一遍。不是看handbook，是坐在他们旁边看他们真实的一天：打开哪些tab page、来回切几次、在什么环节卡住、什么环节靠记忆、分别有哪些edgecase并如何处理。

同时我们拿回了内部的大量资料，包括日常工作流文档、Matherboard、training video、checklist等等，做了系统性的分析。

在这之上，我们把每个岗位的工作拆到minimum unit，算出在每一个学生身上平均花费的时间。这一步让"感觉很忙"变成了可度量的分布——哪些内容占时间、哪些可以标准化、哪些纯属信息搬运。

有了这份时间账单，我们才为每一类工作内容，找到了对应的解决方式：能自动化的自动化，能标准化的标准化，必须留人的留人。

2、三个核心洞察

整个项目的基础，是这三个当时还算反直觉的判断。

第一，他们之前几乎没有任何有效的工作监督手段，只能靠人工。

每位XX管着几十个学生，谁该followup、谁在warning list里、哪个已经overdue很久，过去全靠人工记忆和例会同步。没有系统帮他们持续盯着"这个人 47 天没开 strategy session 了"。监督的缺失，让大量本可早干预的问题拖成了危机。

第二，面对 edge case，每个人其实用的是不同的方案，没有形成固定的 SOP。

同一个"parents no reply"的场景，A 觉得先发邮件，B 习惯先 Slack，C 会直接escalation。这些方案里一定有更有效的那一种，但它们散落在每个人脑子里，从没被提炼出来。而这件事恰恰适合用 AI 来做：把大量一线gold set喂进去，分析哪些动作在哪些情境下最有效，再把最优路径固化成 workflow，让所有人用上最好的那一套。

第三，他们缺一个统一的worktable，去统一监测和管理。

工具是散的：email使用front、calender不同region也不一样、whatsup/wecom/aircall作为沟通工具。人在系统之间当搬运工。只要我们先把这一个工作台立起来，后面的能力都可以在这个核心之上逐步长出来。

这三点里，前两点是"为什么要做"，第三点是"从哪做起"。

3、工具选型与踩坑：vibe coding 的得与失

早期我们用 raplit 这类 vibe coding 工具快速搭原型，前后试了不同版本。它确实快，像一支神笔，你描述要什么界面，能够快速所说即所见。

但问题也正好出在"quick create"上，我们后来吃了不少亏，值得写清楚：

- 数据查询逻辑混乱且低效。 它不知道后端有哪些正式接口，就在页面渲染时直接发起 fetch 或调用看似存在的 API 去拉数据，没有任何缓存、批处理或分页。学生少的时候没问题，数据一多、字段一复杂，每次打开都在全量重拉，页面越来越慢。
- 接口不存在时，它会自己编一个（AI幻觉）。 当某个它需要的接口在真实后端里根本没有，它不会停下来问你，而是返回一个写死的 mock，或者假设一个并不存在的字段结构。结果是 UI 长得完全正常，但底下数据全是假的。内部 demo 时极难发现，一接真实数据就穿帮。
- 为了绕开上面两点，它会用笨办法兜底。 比如把整张表塞进前端再在浏览器里过滤，或者去爬页面。用户少时勉强能用，并发一上来既慢又容易错。
- 最麻烦的是可维护性。 数据层、接口层都是它即兴生成的，没有稳定架构。早期几个用户没问题；一旦要支持更多user，每加一个功能都可能牵动之前那些临时取数逻辑，开发越来越乱，bug 越来越多。

换句话说，vibe coding 适合验证"长什么样"，不适合承载"真实生产"。我们用它快速探了三版方向，确定什么该做之后，逐步收敛出一套更扎实的框架，把数据层从临时的取数逻辑里剥离出来。

4、我们到底做了什么：unique Dashboard 的三步走

基于前面的洞察，dashboard不是一次性做成的，而是分三步长出来的。

Step 1：统一工作台，把监测和操作收到一处

我们做了一个 dashboard，把原本散在多个系统里的关注信息，全部集中呈现，并且把对应的 action button 直接集成进来。根据真实界面，它现在已经长成这样：

- Students roster view：核心入口，把学生list中呈现students card+labels—no reply、allocation pending、no-show、cancellation、penalty、payment overdue、checkpoint 等，并通过颜色和样式区分priority。staff一眼看到谁被 flag、因为什么。点开右边面板能看到多个维度的详细数据。
- Actionitem view：按不同业务线拆分，配 Act now / Early warning / Booked / Allocation issue / Paused 状态漏斗，每行直接带 [Remind] 和 [Open To Send]，从"该催谁"和"一键去催"形成闭环。并增加navigator sidebar，方便一次性解决与学生相关的所有问题。
- Key Deadlines：把整个申请季按月份铺开，Strategist / AEM / Student 三列对齐，谁该在什么时候做什么一目了然。
- Risk 与 NPS：把风险与满意度并进来，不再另开系统看。
- Tutor Allocations 与 Sessions：分配和上课记录也进了同一个工作台。
- Payment Oversight：按 region 切换，直接呈现逾期总额、潜在坏账、每个学生欠款和处理状态，并带 [Remind] 让管理层能推动一线跟进。
- Team Lead Board：给团队负责人看——每个staff在 Engage / Alloc / Sessions / Pay / Risk / NPS 上的注意力 heatmap、SLA 逾期数、issue duration time、学生数。
- Dashboard Usage 与 Feedback Board：前者看采用情况（谁在用、用了多久、谁掉队），后者收一线反馈和 bug，让产品团队持续运营这个工作台。

这一步解决的是第三个核心洞察：统一工作台立起来了，所有监测和操作在一个地方闭环。

Step 2：从Benchmark user里提取最优 SOP

工作台有了使用数据，真正的价值才开始释放。

我们找到一批使用最频繁、操作最有效的标杆（也就是一线里最肯用、用得最对的那些"战斗机"）。他们的日常协作行为里，藏着大量没被写下来的有效做法。当dashboard可以记录行为数据后，我们让AI去分析这些行为：在某一类情境下，标杆用户通常怎么做、动作序列是什么、结果好不好。

然后把这些被验证有效的路径，自动优化成 SOP 操作。这正好把第二个核心洞察落了地——edge case 不再靠每个人各凭经验，而是用 AI 从最优秀的那批人身上把最优方案提炼出来，固化成 workflow，让所有人默认用上最好的那一套。Feedback Board 里的功能投票和 Team Lead Board 的 heatmap，也在持续告诉我们哪类 SOP 真的在降风险、哪类只是看上去合理。

Step 3：让 AI 接管日常，把reminder打通到all channel

当使用量积累到一定程度，我们开始在后台监测一个关键信号：一线对系统建议的编辑和撤销操作是不是越来越少。如果某个 region、某类场景下的 edit / undo 率已经很低，说明系统给出的动作已经足够贴近人的判断。

这时就可以提供一些toggle，让staff决定是否托管给AI自动完成每天的监测和"模仿人操作"——自动执行原本要人点的一连串动作，把后续日常工作内容接手过去。

在这之上，我们还会给 Monitoring dashboard 增加智能化的 automated reminder：把现在分散的 in-app push、notification、email 推送，和已经购买了席位的 WhatsApp、企业微信等外部渠道集成起来。一条该催家长的提醒，可以在工作台监测并触发generate content, 按渠道自动分发，不再需要人耗费时间去跟进。

集成的终点很明确：原来那些繁杂的独立系统和人工管理操作，可以被这一处端到端取代，整个流程在工作台里走完。

5、用推进数据说话：问题总结

工作台不是上线就结束了。我们看了推广后的真实数据，既有好消息，也有必须正视的问题。

- Dashboard Usage 显示200+用户处于活跃状态
- 累计 actioned 571 项，说明 action button 不是摆设，一线真的在用。
- Feedback Board 收到 38 条提交（来自 17 人），其中 19 个 bug、15 个 feature request，NPS 9.3。一线愿意反馈，本身就是信任的证据。
- Students 视图覆盖了{N}名学生，其中{N}名暂停、{N}起 escalation

但数据也暴露了几个绕不开的问题：

- 采用并不均匀。 Dashboard Usage 提示有 15 名staff"已经安静了"——之前活跃，最近 14 天没有任何动作。这 15 个人才是 adoption 真正的阻力点，需要 targeted onboarding，而不是看整体活跃数自我安慰。
- 统计的口径需要结合业务情况进一步细化明确。 本周 actioning 下降了 21%，但单看一个数字没法归因：是 issue 真的变少了，是人变懒了，还是系统变卡了？而且"点了按钮"和"真的闭环了"不是一回事。
- 使用率高不等于数据质量高。 Payment Oversight 里大量学生显示 Not assessed、No comment yet；Students 视图里能看到 365 天没开 strategy session 的极端值还躺在默认列表里。脏数据会悄悄侵蚀一线对系统的信任。
- 如何判断priority缺乏统一口径。提供了多维度的metrics，包括risk score、redflag、KPI、metrics。不同角色关注的维度不同，导致各类信息冗余呈现，反而让人无法直观判断优先级。
- 干预日志不够全面。 我们有操作记录（谁点了什么），但缺判断记录（为什么否决 AI 建议、为什么降级某个 issue）。而 Step 2 提炼 SOP、Step 3 AI 模仿人操作，都靠这批"人的判断"当燃料。没有它，AI 学不到真东西。
- PII 暴露面比预想大得多。 真实界面里能看到学生全名、家庭沟通、session取消原因、逾期金额。权限和审计必须立刻跟上。

6、Next Step

基于上面的问题，下一步不该是再加功能，而是把地基补实，再顺着三步走框架往前推：

1. 先补干预日志。这是 Step 2 和 Step 3 的前提。在Action流程里加一个轻量的closure code，把高质量干预定期聚类，反哺SOP。没有这层，后面两步都是空转。
2. 把 automated reminder 从 in-app 推到全渠道。WhatsApp 和企微席位已经买了，下一步是把提醒生成和渠道分发打通，真正端到端取代人工催收和跨系统通知。这是 Step 3 的下一棒，优先级最高。
3. AI auto-execution 灰度放开。从 edit / undo 率最低的 region 先开 toggle，用真实闭环率验证"AI 模仿人操作"的准确率，跑稳了再扩。别一上来全量自动。
4. 做一张数据健康度看板。把 Not assessed 比例、duration time、接口加载时长做成首屏 KPI。再好的 action 设计，输入脏了都会让人失去信任。
5. 统一"actioned"口径。拆成"触发动作数"和"闭环确认数"，让 Dashboard Usage 能回答"到底解决了多少"而不是"点了多少"。
6. PII 与权限治理。字段级 RBAC、访问审计、截图水印。这比任何新功能都紧急。
7. 阈值按 region / role 校准。红黄绿和"Needs attention"不该全局一刀切，否则某些 region 常年飘红、某些常年飘绿，反而失去信号意义。

7.写在最后

回看这一路，项目最值钱的部分不是某个功能，而是顺序做对了：先 shadowing 看清人在做什么，再 breakdown 算出时间花在哪，然后立起统一工作台，最后才谈 AI 接管。一边做一边积累数据并优化agent，并逐步通过workflow替代功能。

我们已经证明了工作台能被一线接受。接下来要证明的是另一件事：当 AI 开始模仿最优秀的那批人、把提醒打通到家长真正在用的渠道，这个工作台能不能从"帮人看得更清楚"，进化成"替人把事做完"。

这一步走通，前面提到的"监督靠人工、edge case 无 SOP、缺乏统一工作台"三个老问题，才算是被真正关掉。

如果你也在企业里推 automation，欢迎交流。

![](assets/img/posts/2026-07-31-从shadowing到AI接管-我们如何通过automation重塑组织架构和增效。/001-d37c6a00cf.jpg)
