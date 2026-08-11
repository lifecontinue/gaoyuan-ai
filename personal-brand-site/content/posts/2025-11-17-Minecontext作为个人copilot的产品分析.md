---
title: Minecontext作为个人copilot的产品分析
slug: 2025-11-17-Minecontext作为个人copilot的产品分析
date: '2025-11-17T18:36:12'
author: gaoyuan
account: AI Prodlab
summary: 今天从10点到12点，我用两个小时体验了 mine context。无论从产品前景还是费用上来说都很具有吸引力，相比智谱一堆虎头蛇尾的demo产品，我更看好字节的产品体系。
categories:
- 静夜思
tags: []
cover: assets/img/posts/2025-11-17-Minecontext作为个人copilot的产品分析/004-87cbbf14e7.jpg
original: true
word_count: 1762
wechat_url: https://mp.weixin.qq.com/s/ESGWINF338OdxMETT8KmhQ
source_url: ''
wechat_sn: ESGWINF338OdxMETT8KmhQ
imported_at: '2026-08-07T15:04:56'
---

今天从10点到12点，我用两个小时体验了 mine context。这是一款由豆包出品的工具，主要结合一个 Vision Model 和一个 vector Model 配合使用。

这个工具最大的作用是可以在后台运行，①通过 Screen Monitor 不断截屏，并对截屏内容进行理解；②随后生成 Proactive Tips。③在 Tips 里会形成一些智能提醒，根据阶段性的工作进行总结。④当用户点击 “I got it” 后，会自动生成 Today To Do List，并进行分组标记。

![](assets/img/posts/2025-11-17-Minecontext作为个人copilot的产品分析/001-e62c13105b.png)

这是我的一份proactive feed，能明显发现内容可读性有待提高

此外，MineContext 还可以将录入的内容形成个人知识库。它实现了从 Workspace 内容管理，到与chatbot 对话（系统内还提供了2个template：一个是总结化的 summarize；另一个是更明细化的list），再到intelligence reminder和 To Do List 的完整工作流。这套底层算法和业务流程已经做得比较完善，下一步还可以进行更广泛的拓展。

---

整个工具使用下来，效果非常棒，界面也很清爽，操作功能不复杂，Home 会主动为我推送每日总结、待办事项、提醒以及从所有收集的 contacts 中提炼出的洞察和新信息。包括 To Do、Tips、 Summary、Creation 等功能，这些都非常实用。

我觉得它下一步很有可能在现有基础上进行平台化拓展。比如connect更多的 apps，让用户可以根据在不同平台上的操作，在 to do list 或reminder 里做集成。同时，也可以和移动端关联，帮助用户更好地完成提醒事项。

此外，它可以通过本地化方式降低费用，实现更高效的处理，让用户在后台监测到更多行为数据，生成更优质的总结内容。一段时间后，还能形成分析报告或改进建议。甚至有可能进一步 agenttic，根据用户每天的行为习惯，自动帮用户完成一些任务。这些都是非常好的拓展方向。

![](assets/img/posts/2025-11-17-Minecontext作为个人copilot的产品分析/002-7179b534fc.png)

它的业务流程总结如下：

1. 通过 version 和 embedding 模型快速处理数据，并通过 API Key 进行部署。
2. 部署完成后，点击 recording 开始记录。
3. 每隔十几分钟记录不同的screemshots，并对这些图片进行分析。
4. 本地还会运行一些复杂算法，发给云端模型根据图片文件进行信息提炼。
5. 每小时形成一个 proactive fit（主动提示），生成小的 tips，用户可以点击查看。
6. 用户查看并确认后，这些内容会更新到用户的 to do list 里。

当然，里面还有很多需要优化的地方。workflow 方面没有什么问题，但细节上，尤其是prompt，比如 to do list 的更新和 tips 的整理，还有很多可以改进的空间。

在此基础上，还可以将所有数据本地化，或者在云端形成知识库。这些知识库可以通过调用 chat bot，与 AI 进行对话，用户可以不断提取自己想要的信息，或者做一些总结。

但，当我以为minecontext的功能仅限于此的时候，翻了一下github，发现竟然可以通过http://localhost:1733访问后台服务端。这么小的一个工具竟然包含了完整的前后端你敢信？！

![](assets/img/posts/2025-11-17-Minecontext作为个人copilot的产品分析/003-4b2dd7f8d2.png)

---

最后，我通过火山引擎后台记录。发现主要是doubao-seed-1.6-flash模型费用高，2小时内调用总量tokens1,485,173，其中输入tokens1,202,933，输出tokens282,240，调用次数716。按照一般用户使用的

- 在线推理
- 长度在32k以内
- **输入单价**：0.15元/百万token
- **输出单价**：1.50元/百万token

让火山助手计算得出2小时的花费是0.6038元，按照每天均匀分布，可能会有一些个人使用电脑的时间共12小时计算，差不多每天7.2456元，月估算费用218.37元。这个价格，对于一些需要经常做工作整理，写日报的人来说，还是可以接受的。

补充一些：火山助手是一个 AI 助手，感觉字节这家公司在整体的 AI 化方面做得非常棒。这个 AI 助手不仅仅是一个普通的AI客服，还能很好地衔接上下文，并且调用用户的行为数据，以及用户在平台上的一些 package。比如，我可以和它沟通，告诉它去查询我的 tokens 的调用费用和使用情况。它会结合我提供的现实中的上下文信息，迅速推理出我一个月的用量和大致的预算范围，这样可以帮助我快速决策是否继续使用。
