import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import {
  Annotation,
  Command,
  END,
  MemorySaver,
  START,
  StateGraph,
  interrupt,
  messagesStateReducer,
} from "@langchain/langgraph";
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";

type InterviewMode =
  | "product_sense"
  | "metric_tradeoff"
  | "stakeholder_conflict"
  | "ai_feature_scope"
  | "execution_postmortem";

type Intensity = "warm" | "standard" | "pressure";
type TurnKind =
  | "opening"
  | "question"
  | "probe"
  | "pushback"
  | "interrupt"
  | "wrap";
type RouteDecision = "probe" | "next" | "wrap";

interface ChatMessage {
  id: string;
  role: "interviewer" | "candidate" | "system";
  content: string;
  kind?: TurnKind;
  at: string;
}

interface ScenarioBrief {
  title: string;
  company: string;
  roleTitle: string;
  interviewerName: string;
  interviewerTitle: string;
  style: string;
  setting: string;
  stakes: string;
  hiddenAgenda: string;
  successSignals: string[];
  failureTraps: string[];
}

interface DimensionScore {
  id: string;
  label: string;
  score: number;
  evidence: string;
  tip: string;
}

interface InterviewReport {
  overall: number;
  summary: string;
  dimensions: DimensionScore[];
  highlights: string[];
  risks: string[];
  nextDrills: string[];
  transcriptNotes: string[];
}

interface SessionPublic {
  id: string;
  mode: InterviewMode;
  intensity: Intensity;
  phase: "interviewing" | "scored";
  round: number;
  maxRounds: number;
  scenario: ScenarioBrief;
  messages: ChatMessage[];
  awaitingAnswer: boolean;
  report: InterviewReport | null;
  engine: "llm" | "mock";
}

export const MODE_META: Record<
  InterviewMode,
  { label: string; blurb: string; defaultTitle: string }
> = {
  product_sense: {
    label: "产品判断",
    blurb: "从模糊需求中立题、定用户、给方案与取舍。",
    defaultTitle: "给教育 App 设计一个 AI 面试陪练能力",
  },
  metric_tradeoff: {
    label: "指标权衡",
    blurb: "增长与体验冲突时，如何设北极星与护栏指标。",
    defaultTitle: "激活率涨了，但完成率掉了，你怎么判？",
  },
  stakeholder_conflict: {
    label: "利益相关方冲突",
    blurb: "销售承诺、研发产能、合规红线同时压过来。",
    defaultTitle: "销售已对外承诺两周上线语音面试",
  },
  ai_feature_scope: {
    label: "AI 功能定界",
    blurb: "Agent / 评估闭环如何切 MVP，避免伪智能。",
    defaultTitle: "把智能复盘 Agent 从 demo 做成可上线能力",
  },
  execution_postmortem: {
    label: "执行复盘",
    blurb: "一次失败上线后的归因、沟通与下一轮计划。",
    defaultTitle: "上周 Agent 面试官上线翻车，你会怎么复盘",
  },
};

function msg(
  role: ChatMessage["role"],
  content: string,
  kind?: TurnKind,
): ChatMessage {
  return {
    id: randomUUID(),
    role,
    content,
    kind,
    at: new Date().toISOString(),
  };
}

function pick<T>(arr: T[], salt: number): T {
  return arr[Math.abs(salt) % arr.length];
}

function hasLlmConfig() {
  return Boolean(process.env.OPENAI_API_KEY || process.env.DEEPSEEK_API_KEY);
}

function createChatModel() {
  const apiKey =
    process.env.OPENAI_API_KEY ||
    process.env.DEEPSEEK_API_KEY ||
    "missing-key";
  const baseURL =
    process.env.OPENAI_BASE_URL ||
    (process.env.DEEPSEEK_API_KEY ? "https://api.deepseek.com/v1" : undefined);
  const model = process.env.OPENAI_MODEL || "deepseek-chat";
  return new ChatOpenAI({
    apiKey,
    model,
    temperature: 0.7,
    configuration: baseURL ? { baseURL } : undefined,
  });
}

function buildScenario(input: {
  mode: InterviewMode;
  intensity: Intensity;
  resumeText?: string;
  jdText?: string;
  candidateName?: string;
}): ScenarioBrief {
  const interviewers = [
    {
      interviewerName: "林安",
      interviewerTitle: "AI 产品线 Head of Product",
      style: "冷静、短句、喜欢打断模糊表述；不爱空话与框架堆砌。",
    },
    {
      interviewerName: "Vera Chen",
      interviewerTitle: "Senior PM · Growth & Agent Experience",
      style: "追问“所以呢”和可度量结果；对 AI 幻觉与评估体系敏感。",
    },
  ];
  const interviewer =
    interviewers[(input.mode.length + (input.candidateName?.length ?? 0)) % 2];
  const meta = MODE_META[input.mode];
  const pressure =
    input.intensity === "pressure"
      ? "本场偏高压：会打断、要求当场改方案、质疑证据。"
      : input.intensity === "warm"
        ? "本场偏暖场：仍会追问，但会先给上下文。"
        : "本场标准强度：礼貌但不会放水。";

  const templates: Record<
    InterviewMode,
    Omit<ScenarioBrief, "interviewerName" | "interviewerTitle" | "style">
  > = {
    product_sense: {
      title: meta.defaultTitle,
      company: "Northstar Learning",
      roleTitle: "AI Product Manager",
      setting: "线上初面，45 分钟产品判断。桌上只有白板链接和一份残缺 PRD。",
      stakes: "面试官要判断你能否把 AI 陪练从概念落到可交付范围。",
      hiddenAgenda: "看你是否为了炫技堆模型，还是先守住用户作业与评估闭环。",
      successSignals: ["先澄清用户与成功标准", "明确非目标", "给出可验证 MVP"],
      failureTraps: ["空谈多智能体", "没有指标", "回避取舍"],
    },
    metric_tradeoff: {
      title: meta.defaultTitle,
      company: "Lumen Agents",
      roleTitle: "PM, AI Coaching",
      setting: "周会后的加面。增长负责人刚甩给你一张漏斗图。",
      stakes: "需要你在 10 分钟内给出诊断框架与下周实验。",
      hiddenAgenda: "测试你是否盲目追 DAU，还是能守住完成质量与信任。",
      successSignals: ["区分诊断与行动指标", "提出护栏", "用实验消解分歧"],
      failureTraps: ["只骂增长团队", "没有假设", "给不出下一步"],
    },
    stakeholder_conflict: {
      title: meta.defaultTitle,
      company: "Atlas Edu",
      roleTitle: "Staff PM",
      setting: "会议室里销售、法务、语音供应商三方在线，空气紧绷。",
      stakes: "你要在不毁信任的前提下重谈范围与时间。",
      hiddenAgenda: "看你是否无脑硬抗，还是能重构承诺与风险沟通。",
      successSignals: ["重述各方目标", "拆可交付与不可交付", "给出沟通话术"],
      failureTraps: ["站队骂人", "虚假承诺", "忽略合规"],
    },
    ai_feature_scope: {
      title: meta.defaultTitle,
      company: "Brief Studio",
      roleTitle: "AI PM · Agent Platform",
      setting: "白板上写着 LangGraph / Eval / Memory，旁边是一堆半成品 demo。",
      stakes: "工程只给你两个冲刺；你必须砍出可上线切片。",
      hiddenAgenda: "考察你对真实 Agent（状态、评估、失败回退）的理解深度。",
      successSignals: ["定义状态/图节点", "说明评估与人工兜底", "列出明确砍掉项"],
      failureTraps: ["把聊天机器人叫 Agent", "没有失败路径", "范围无限膨胀"],
    },
    execution_postmortem: {
      title: meta.defaultTitle,
      company: "Harbor AI",
      roleTitle: "Product Lead",
      setting: "事故复盘会，投影着用户差评与延迟曲线。",
      stakes: "你要带队给出可执行的 72 小时与 2 周计划。",
      hiddenAgenda: "看你是否甩锅，还是能建立机制防止再犯。",
      successSignals: ["事实-影响-根因分层", "短期止血与长期机制", "对内对外沟通差异"],
      failureTraps: ["情绪化追责", "只有口号没有 owner", "忽略用户补偿"],
    },
  };

  const base = templates[input.mode];
  const setting = [
    base.setting,
    pressure,
    input.jdText?.trim() ? `JD 摘要：${input.jdText.trim().slice(0, 220)}` : "",
    input.resumeText?.trim()
      ? `候选人材料：${input.resumeText.trim().slice(0, 220)}`
      : "",
    input.candidateName?.trim() ? `候选人：${input.candidateName.trim()}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return { ...base, ...interviewer, setting };
}

const openings: Record<InterviewMode, string[]> = {
  product_sense: [
    "先别急着讲方案。你认为这题真正要解决的用户作业是什么？一句话。",
    "如果我们只能服务一个核心用户，你会选谁？为什么不是别人？",
  ],
  metric_tradeoff: [
    "激活涨、完成掉——你第一反应会查哪三张表？别给我完整分析框架，先说顺序。",
    "有人说完成率掉是因为题目变难了。你怎么证伪？",
  ],
  stakeholder_conflict: [
    "销售已经对外承诺了。你进会议室第一句说什么？",
    "法务说语音录音有合规风险。你现在砍什么、保什么？",
  ],
  ai_feature_scope: [
    "别跟我讲“多智能体协同”。这个 Agent 的状态机最少要有哪几个节点？",
    "如果模型胡说八道，产品侧的失败回退是什么？",
  ],
  execution_postmortem: [
    "事故发生后 2 小时，你对用户说什么？对内说什么？请分开。",
    "你觉得根因更可能在模型、产品流程，还是发布机制？先给判断再给证据。",
  ],
};

const probes = [
  "太顺了。如果预算砍掉 60%，你的方案还剩什么？",
  "你刚才说的“体验更好”——用什么可观测信号证明？",
  "停。你在回避取舍。A 和 B 只能保一个，选哪个？",
  "假设工程说做不到，你怎么改叙事而不是硬刚？",
  "这听起来像咨询报告。落地第一周 owner 是谁、交付物是什么？",
];

type GraphState = {
  mode: InterviewMode;
  intensity: Intensity;
  maxRounds: number;
  round: number;
  route: RouteDecision;
  lastCandidateAnswer: string;
  transcript: ChatMessage[];
  scenario: ScenarioBrief | null;
};

function mockInterviewerLine(state: GraphState): { line: string; kind: TurnKind } {
  const round = state.round ?? 0;
  if (round <= 1) {
    return {
      line: pick(openings[state.mode], round + state.mode.length),
      kind: "opening",
    };
  }
  if (state.route === "probe") {
    return {
      line: pick(probes, round + (state.lastCandidateAnswer?.length ?? 0)),
      kind: state.intensity === "pressure" ? "interrupt" : "probe",
    };
  }
  if (state.route === "wrap" || round >= state.maxRounds) {
    return {
      line: "时间差不多了。你用 30 秒总结：如果下周就开工，你最想先验证哪一个假设？",
      kind: "wrap",
    };
  }
  const followups = [
    `顺着你刚才说的「${(state.lastCandidateAnswer || "方案").slice(0, 18)}…」——失败时用户会怎么感知？`,
    "好，下一刀：你如何评估这个能力是否真的帮到面试准备，而不是只是聊得开心？",
    "换成对方是保守的业务负责人，你怎么重讲一遍？",
  ];
  return {
    line: pick(followups, round * 3),
    kind: state.intensity === "pressure" ? "pushback" : "question",
  };
}

function mockAssess(state: GraphState): { route: RouteDecision; note: string } {
  const answer = (state.lastCandidateAnswer || "").trim();
  const round = state.round ?? 0;
  if (!answer) return { route: "probe", note: "空回答，继续施压。" };
  if (round >= state.maxRounds - 1) return { route: "wrap", note: "轮次耗尽，收束。" };
  const soft =
    /赋能|闭环|生态|打通|抓手|综合来看/.test(answer) &&
    !/\d|指标|实验|用户|假设|MVP|评估/.test(answer);
  if (soft || answer.length < 40) {
    return { route: "probe", note: "回答偏空或过短，追问证据。" };
  }
  if (round % 2 === 1) return { route: "probe", note: "制造一次真实压力追问。" };
  return { route: "next", note: "信息足够，切换下一刀场景压力。" };
}

function mockReport(state: GraphState): InterviewReport {
  const answerLens = state.transcript
    .filter((m) => m.role === "candidate")
    .map((m) => m.content)
    .join(" ");
  const hasMetric = /\d|%|指标|转化|完成率|DAU/.test(answerLens);
  const hasTradeoff = /取舍|不做|砍|优先|权衡/.test(answerLens);
  const hasAi = /Agent|评估|LangGraph|状态|回退|幻觉|RAG/i.test(answerLens);
  const structure = answerLens.length > 180 ? 78 : 62;
  const dimensions: DimensionScore[] = [
    {
      id: "product_sense",
      label: "产品判断",
      score: hasTradeoff ? 84 : 68,
      evidence: hasTradeoff
        ? "出现了明确取舍与优先级语言。"
        : "方案叙述较多，取舍不够锋利。",
      tip: "每次回答强制写：做什么 / 不做什么 / 为什么。",
    },
    {
      id: "structure",
      label: "结构化表达",
      score: structure,
      evidence:
        structure > 70
          ? "回答有一定层次，能跟住追问。"
          : "容易一次性倾倒观点，缺少分层。",
      tip: "先结论，再 2 个支撑，再风险。",
    },
    {
      id: "ai_literacy",
      label: "AI 产品素养",
      score: hasAi ? 86 : 64,
      evidence: hasAi
        ? "提到了 Agent/评估/失败路径等真实能力边界。"
        : "AI 相关讨论偏功能表层。",
      tip: "把模型能力翻译成状态、评估与人工兜底。",
    },
    {
      id: "metrics",
      label: "指标与验证",
      score: hasMetric ? 82 : 60,
      evidence: hasMetric ? "能落到可观察指标或实验。" : "缺少可验证信号。",
      tip: "为每个主张配一个可在两周内验证的信号。",
    },
    {
      id: "ownership",
      label: "推动与沟通",
      score:
        state.mode === "stakeholder_conflict" ||
        state.mode === "execution_postmortem"
          ? 80
          : 72,
      evidence: "在冲突/复盘类追问中，看你是否给出可执行下一步。",
      tip: "明确 owner、时间盒、对外话术。",
    },
  ];
  const overall = Math.round(
    dimensions.reduce((s, d) => s + d.score, 0) / dimensions.length,
  );
  const scenario = state.scenario!;
  return {
    overall,
    summary: `在「${MODE_META[state.mode].label}」场景（${scenario.company} · ${scenario.roleTitle}）中，你完成了 ${state.round} 轮真实追问。整体${
      overall >= 80
        ? "具备较强现场感"
        : overall >= 70
          ? "合格但还不够锋利"
          : "需要更具体的证据与取舍"
    }。`,
    dimensions,
    highlights: dimensions
      .filter((d) => d.score >= 80)
      .map((d) => `${d.label}：${d.evidence}`),
    risks: dimensions
      .filter((d) => d.score < 70)
      .map((d) => `${d.label}：${d.evidence}`),
    nextDrills: [
      "同一场景用 pressure 强度再打一局，强制 20 秒内给取舍。",
      "把你的方案压成：用户作业 / MVP / 评估 / 失败回退 四行。",
      "找一个真实 JD，重跑并对比报告维度变化。",
    ],
    transcriptNotes: state.transcript
      .filter((m) => m.role === "interviewer" && m.kind === "probe")
      .slice(0, 3)
      .map((m) => `追问点：${m.content}`),
  };
}

const InterviewAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),
  mode: Annotation<InterviewMode>,
  intensity: Annotation<Intensity>,
  resumeText: Annotation<string>,
  jdText: Annotation<string>,
  candidateName: Annotation<string>,
  maxRounds: Annotation<number>,
  round: Annotation<number>,
  scenario: Annotation<ScenarioBrief | null>,
  transcript: Annotation<ChatMessage[]>({
    reducer: (left, right) => left.concat(right),
    default: () => [],
  }),
  lastCandidateAnswer: Annotation<string>,
  lastTurnKind: Annotation<TurnKind>,
  lastInterviewerLine: Annotation<string>,
  route: Annotation<RouteDecision>,
  assessmentNote: Annotation<string>,
  report: Annotation<InterviewReport | null>,
  engine: Annotation<"llm" | "mock">,
});

type InterviewState = typeof InterviewAnnotation.State;

async function buildScenarioNode(state: InterviewState) {
  const scenario = buildScenario({
    mode: state.mode,
    intensity: state.intensity,
    resumeText: state.resumeText,
    jdText: state.jdText,
    candidateName: state.candidateName,
  });
  return {
    scenario,
    engine: hasLlmConfig() ? ("llm" as const) : ("mock" as const),
    round: 0,
    transcript: [
      msg(
        "system",
        `场景已就绪：${scenario.title}。面试官 ${scenario.interviewerName}（${scenario.interviewerTitle}）进场。`,
      ),
    ],
    messages: [
      new SystemMessage(
        `你是严苛但专业的 AI/产品面试官 ${scenario.interviewerName}。场景：${scenario.title}。设定：${scenario.setting}。隐藏考察点：${scenario.hiddenAgenda}。成功信号：${scenario.successSignals.join("；")}。失败陷阱：${scenario.failureTraps.join("；")}。风格：${scenario.style}。不要拍马屁。用中文。短句。必要时打断式追问。`,
      ),
    ],
  };
}

async function interviewerSpeak(state: InterviewState) {
  const nextRound = (state.round ?? 0) + 1;
  let line: string;
  let kind: TurnKind;

  if (hasLlmConfig()) {
    const model = createChatModel();
    const guidance =
      state.route === "probe"
        ? "对上一个回答做尖锐追问或打断，要求证据/取舍。"
        : state.route === "wrap"
          ? "收束本场，要求 30 秒总结最该验证的假设。"
          : nextRound <= 1
            ? "开场，抛出核心压力问题，不要寒暄过长。"
            : "进入下一刀真实场景压力，换角度施压。";
    const res = await model.invoke([
      ...state.messages,
      new HumanMessage(
        `[导演指令] 第 ${nextRound}/${state.maxRounds} 轮。强度=${state.intensity}。动作=${guidance}。只输出面试官要对候选人说的话。`,
      ),
    ]);
    line = String(res.content ?? "").trim();
    kind =
      state.route === "probe"
        ? state.intensity === "pressure"
          ? "interrupt"
          : "probe"
        : state.route === "wrap"
          ? "wrap"
          : nextRound <= 1
            ? "opening"
            : "question";
  } else {
    const mocked = mockInterviewerLine({
      mode: state.mode,
      intensity: state.intensity,
      maxRounds: state.maxRounds,
      round: nextRound,
      route: state.route,
      lastCandidateAnswer: state.lastCandidateAnswer,
      transcript: state.transcript,
      scenario: state.scenario,
    });
    line = mocked.line;
    kind = mocked.kind;
  }

  return {
    round: nextRound,
    lastInterviewerLine: line,
    lastTurnKind: kind,
    transcript: [msg("interviewer", line, kind)],
    messages: [new AIMessage(line)],
  };
}

async function awaitCandidate(state: InterviewState) {
  const answer = interrupt({
    type: "await_answer",
    prompt: state.lastInterviewerLine,
    round: state.round,
  }) as string;
  const text = String(answer ?? "").trim();
  return {
    lastCandidateAnswer: text,
    transcript: [msg("candidate", text)],
    messages: [new HumanMessage(text)],
  };
}

async function assessAnswer(state: InterviewState) {
  if (hasLlmConfig()) {
    const model = createChatModel();
    const res = await model.invoke([
      new SystemMessage(
        '你是面试导演。决定下一步：probe / next / wrap。只输出 JSON：{"route":"probe|next|wrap","note":"..."}',
      ),
      new HumanMessage(
        `轮次 ${state.round}/${state.maxRounds}\n问：${state.lastInterviewerLine}\n答：${state.lastCandidateAnswer}`,
      ),
    ]);
    const raw = String(res.content ?? "");
    const match = raw.match(/\{[\s\S]*\}/);
    let route: RouteDecision = "next";
    let note = raw.slice(0, 200);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]) as { route?: string; note?: string };
        if (
          parsed.route === "probe" ||
          parsed.route === "next" ||
          parsed.route === "wrap"
        ) {
          route = parsed.route;
        }
        if (parsed.note) note = parsed.note;
      } catch {
        /* ignore */
      }
    }
    if ((state.round ?? 0) >= state.maxRounds) route = "wrap";
    return { route, assessmentNote: note };
  }
  const mocked = mockAssess({
    mode: state.mode,
    intensity: state.intensity,
    maxRounds: state.maxRounds,
    round: state.round,
    route: state.route,
    lastCandidateAnswer: state.lastCandidateAnswer,
    transcript: state.transcript,
    scenario: state.scenario,
  });
  return { route: mocked.route, assessmentNote: mocked.note };
}

async function scoreSession(state: InterviewState) {
  const report = mockReport({
    mode: state.mode,
    intensity: state.intensity,
    maxRounds: state.maxRounds,
    round: state.round,
    route: state.route,
    lastCandidateAnswer: state.lastCandidateAnswer,
    transcript: state.transcript,
    scenario: state.scenario,
  });

  const wrapLine =
    state.lastTurnKind === "wrap"
      ? []
      : [
          msg(
            "interviewer",
            "好，今天先到这里。报告已生成，我们基于证据复盘，不给空洞鼓励。",
            "wrap",
          ),
        ];

  return { report, transcript: wrapLine };
}

function afterAssess(state: InterviewState): "interviewerSpeak" | "scoreSession" {
  if (state.route === "wrap" || (state.round ?? 0) >= state.maxRounds) {
    return "scoreSession";
  }
  return "interviewerSpeak";
}

const checkpointer = new MemorySaver();
const interviewGraph = new StateGraph(InterviewAnnotation)
  .addNode("buildScenario", buildScenarioNode)
  .addNode("interviewerSpeak", interviewerSpeak)
  .addNode("awaitCandidate", awaitCandidate)
  .addNode("assessAnswer", assessAnswer)
  .addNode("scoreSession", scoreSession)
  .addEdge(START, "buildScenario")
  .addEdge("buildScenario", "interviewerSpeak")
  .addEdge("interviewerSpeak", "awaitCandidate")
  .addEdge("awaitCandidate", "assessAnswer")
  .addConditionalEdges("assessAnswer", afterAssess, [
    "interviewerSpeak",
    "scoreSession",
  ])
  .addEdge("scoreSession", END)
  .compile({ checkpointer });

function threadConfig(threadId: string) {
  return { configurable: { thread_id: threadId } };
}

function toPublic(
  id: string,
  state: InterviewState,
  awaitingAnswer: boolean,
): SessionPublic {
  if (!state.scenario) throw new Error("scenario missing");
  return {
    id,
    mode: state.mode,
    intensity: state.intensity,
    phase: state.report ? "scored" : "interviewing",
    round: state.round ?? 0,
    maxRounds: state.maxRounds,
    scenario: state.scenario,
    messages: state.transcript ?? [],
    awaitingAnswer,
    report: state.report,
    engine: state.engine ?? "mock",
  };
}

export async function startSession(payload: {
  mode: InterviewMode;
  intensity?: Intensity;
  resumeText?: string;
  jdText?: string;
  candidateName?: string;
  maxRounds?: number;
}): Promise<SessionPublic> {
  const id = randomUUID();
  const config = threadConfig(id);
  const maxRounds = Math.min(Math.max(payload.maxRounds ?? 6, 4), 10);

  await interviewGraph.invoke(
    {
      mode: payload.mode,
      intensity: payload.intensity ?? "standard",
      resumeText: payload.resumeText ?? "",
      jdText: payload.jdText ?? "",
      candidateName: payload.candidateName ?? "",
      maxRounds,
      round: 0,
      scenario: null,
      lastCandidateAnswer: "",
      lastTurnKind: "opening",
      lastInterviewerLine: "",
      route: "next",
      assessmentNote: "",
      report: null,
      engine: "mock",
      transcript: [],
      messages: [],
    },
    config,
  );

  const snap = await interviewGraph.getState(config);
  const state = snap.values as InterviewState;
  const interrupted = Boolean(snap.tasks?.some((t) => t.interrupts?.length));
  return toPublic(id, state, interrupted || !state.report);
}

export async function replySession(
  id: string,
  answer: string,
): Promise<SessionPublic> {
  const config = threadConfig(id);
  const before = await interviewGraph.getState(config);
  if (!before.values || !(before.values as InterviewState).scenario) {
    throw new Error("SESSION_NOT_FOUND");
  }
  await interviewGraph.invoke(new Command({ resume: answer }), config);
  const snap = await interviewGraph.getState(config);
  const state = snap.values as InterviewState;
  const interrupted = Boolean(snap.tasks?.some((t) => t.interrupts?.length));
  return toPublic(id, state, interrupted && !state.report);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 8787);

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "brief-interview-coach",
    engine: hasLlmConfig() ? "llm" : "mock",
    modes: MODE_META,
  });
});

app.post("/api/session/start", async (req, res) => {
  try {
    const mode = req.body?.mode as InterviewMode;
    if (!mode || !(mode in MODE_META)) {
      res.status(400).json({ error: "INVALID_MODE" });
      return;
    }
    const session = await startSession({
      mode,
      intensity: (req.body?.intensity as Intensity) || "standard",
      resumeText: String(req.body?.resumeText || ""),
      jdText: String(req.body?.jdText || ""),
      candidateName: String(req.body?.candidateName || ""),
      maxRounds: Number(req.body?.maxRounds || 6),
    });
    res.json({ session });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "START_FAILED", detail: String(err) });
  }
});

app.post("/api/session/:id/reply", async (req, res) => {
  try {
    const answer = String(req.body?.answer || "").trim();
    if (!answer) {
      res.status(400).json({ error: "EMPTY_ANSWER" });
      return;
    }
    const session = await replySession(req.params.id, answer);
    res.json({ session });
  } catch (err) {
    const message = String(err);
    if (message.includes("SESSION_NOT_FOUND")) {
      res.status(404).json({ error: "SESSION_NOT_FOUND" });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "REPLY_FAILED", detail: message });
  }
});

const dist = path.join(__dirname, "..", "dist");
app.use(express.static(dist));
app.get(/^(?!\/api).*/, (req, res, next) => {
  if (req.method !== "GET") return next();
  res.sendFile(path.join(dist, "index.html"), (err) => {
    if (err) next();
  });
});

async function smoke() {
  const session = await startSession({
    mode: "ai_feature_scope",
    intensity: "pressure",
    candidateName: "测试候选人",
    resumeText: "做过 AI 产品与 Agent 流程设计",
    jdText: "AI Product Manager，负责面试陪练 Agent",
    maxRounds: 4,
  });
  console.log("start", session.engine, session.messages.at(-1)?.content);
  let current = session;
  const answers = [
    "状态机至少要有：资料解析、出题、追问决策、评分、失败回退。MVP 先做文本，不做语音。",
    "评估用 rubric + 人工抽检；模型胡说就降级成题库模式并标记低置信。",
    "两个冲刺只做：场景生成、追问图、报告。砍掉多面试官和表情分析。",
    "先验证用户是否愿意为针对 JD 的追问付费完成一整场。",
  ];
  for (const answer of answers) {
    if (current.phase === "scored") break;
    current = await replySession(current.id, answer);
    console.log("round", current.round, current.phase);
  }
  if (!current.report) throw new Error("expected report");
  console.log("overall", current.report.overall);
  console.log("smoke ok");
}

if (process.argv.includes("--smoke")) {
  smoke().catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else {
  app.listen(PORT, () => {
    console.log(
      `[brief] api on http://127.0.0.1:${PORT} engine=${hasLlmConfig() ? "llm" : "mock"}`,
    );
  });
}
