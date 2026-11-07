export type InterviewMode =
  | "product_sense"
  | "metric_tradeoff"
  | "stakeholder_conflict"
  | "ai_feature_scope"
  | "execution_postmortem";

export type Intensity = "warm" | "standard" | "pressure";

export type TurnKind =
  | "opening"
  | "question"
  | "probe"
  | "pushback"
  | "interrupt"
  | "wrap";

export interface ChatMessage {
  id: string;
  role: "interviewer" | "candidate" | "system";
  content: string;
  kind?: TurnKind;
  at: string;
}

export interface ScenarioBrief {
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

export interface DimensionScore {
  id: string;
  label: string;
  score: number;
  evidence: string;
  tip: string;
}

export interface InterviewReport {
  overall: number;
  summary: string;
  dimensions: DimensionScore[];
  highlights: string[];
  risks: string[];
  nextDrills: string[];
  transcriptNotes: string[];
}

export interface SessionPublic {
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
