# AI Native 组织基建

这套文档来自一家大型教育产品公司的工程现场：一边是已经能跑的编码 Agent 工作流，一边是还没打通的组织级 Agent 总线。

请把它当成 **可复制的目标架构 + 对照笔记**，不要当成「这家公司已经全部落地」的说明书。

| 文档 | 说明 |
|------|------|
| [AI-NATIVE-INFRA.md](./AI-NATIVE-INFRA.md) | 分层架构、身份与密钥、评测与审计；含 **crimson-app 对照** |
| [ORG-OPERATING-CADENCE.md](./ORG-OPERATING-CADENCE.md) | 人的节奏（Standup、评审、Catchup、Town Hall）怎么接工具 |
| [WORKFLOWS.md](./WORKFLOWS.md) | 端到端流转；含编码 Agent 交付环，以及反馈→任务的目标流 |
| [SKILLS-MCP-PLUGINS.md](./SKILLS-MCP-PLUGINS.md) | MCP / Skill / Plugin 目录；标清已有形态 vs 规划形态 |
| [TOOLKIT-CHECKLIST.md](./TOOLKIT-CHECKLIST.md) | 给其他团队复制的清单；每项标了常见等价物 |
| [REFLECTION.md](./REFLECTION.md) | 对照 crimson-app 的 `AGENTS.md` / `README` 后的问题清单 |

**怎么读**

1. 产品里的 Copilot、仓库里的 `AGENTS.md`、Secrets 加载方式，是已经存在的控制面。
2. Linear 反馈 Bot、统一 Key Gateway、LangGraph 全公司编排，是建议建设的目标态。
3. 复制到别的团队时，先换「职责」不要先换品牌名：身份、密钥、任务、评测、审计缺一不可。
