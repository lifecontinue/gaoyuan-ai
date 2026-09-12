# Brief · 面场

基于 **LangGraph.js** 的 AI / 产品面试陪练 Agent。

## 能力

- 5 类真实场景：产品判断、指标权衡、利益相关方冲突、AI 功能定界、执行复盘
- LangGraph 状态机：`buildScenario → interviewerSpeak → awaitCandidate → assessAnswer → (probe/next/wrap) → scoreSession`
- 高压追问 / 打断式压力测试（mock 可离线跑通；配置 LLM Key 后走真实模型）
- 分维度复盘：产品判断、结构化表达、AI 产品素养、指标与验证、推动与沟通

## 本地运行

```bash
cd interview-coach
cp .env.example .env   # 可选：填入 OPENAI_API_KEY / DEEPSEEK_API_KEY
npm install
npm run dev            # API :8787 + Web :5177
```

无 Key 时自动走 mock，图编排仍完整运行：

```bash
npm run smoke
```

## 环境变量

见 `.env.example`：

- `OPENAI_API_KEY` 或 `DEEPSEEK_API_KEY`
- `OPENAI_BASE_URL`（DeepSeek 默认 `https://api.deepseek.com/v1`）
- `OPENAI_MODEL`（默认 `deepseek-chat`）
- `PORT`（默认 `8787`）
