# AI Native 组织基建

本目录沉淀团队从「工具堆叠」进化为 **AI Native 组织** 的完整基建：架构、工作流、Skill/MCP/Plugin、可复制工具清单。

| 文档 | 说明 |
|------|------|
| [AI-NATIVE-INFRA.md](./AI-NATIVE-INFRA.md) | 九层架构、公司运转视角遗漏补齐、Auth0 / Key Gateway / Audit / Harness |
| [WORKFLOWS.md](./WORKFLOWS.md) | 端到端流转（含 **Slack 反馈 → Bot 评估 → Linear**） |
| [SKILLS-MCP-PLUGINS.md](./SKILLS-MCP-PLUGINS.md) | MCP / Skill / Plugin / Agent / Harness 具体目录 |
| [TOOLKIT-CHECKLIST.md](./TOOLKIT-CHECKLIST.md) | **发给其他团队即可 Copy 的工具清单与两周最小包** |

**一句话**：Auth0 + API Key Gateway 管住身份与密钥；Rippling 管入离职权限总线；Salesforce / PandaDoc 接住 Sales 与 People 文档流；Slack/Calendar/Zoom 把上下文送进 Linear；Bot + Harness 负责评估；LangGraph/n8n 编排；OpenAI SDK 统一模型出口；Langfuse/Datadog/Audit 保证可观测、可评测、可追责。
