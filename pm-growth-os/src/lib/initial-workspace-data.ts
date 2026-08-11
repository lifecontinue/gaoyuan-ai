import type {
  CaptureSuggestions,
  Capability,
  CoachPlan,
  UserProfile,
  WeeklySummary,
} from '../types/domain';

export const capabilities: Capability[] = [
  {
    id: 'prompt-engineering',
    name: 'Prompt Engineering',
    category: 'Skills',
    progress: 0,
    stageLabel: 'Not started',
    summary: 'Start by saving one real prompt experiment or AI product task as evidence.',
    evidenceCount: 0,
    updatedAt: 'Not started',
  },
  {
    id: 'ai-product-strategy',
    name: 'AI Product Strategy',
    category: 'Strategy',
    progress: 0,
    stageLabel: 'Not started',
    summary: 'Connect AI capability choices to user value, market timing, product bets, and measurable outcomes.',
    evidenceCount: 0,
    updatedAt: 'Not started',
  },
  {
    id: 'user-research-synthesis',
    name: 'User Research Synthesis',
    category: 'Discovery',
    progress: 0,
    stageLabel: 'Not started',
    summary: 'Use AI to synthesize interviews, feedback, support tickets, and behavior signals without losing nuance.',
    evidenceCount: 0,
    updatedAt: 'Not started',
  },
  {
    id: 'context-engineering',
    name: 'Context Engineering',
    category: 'Skills',
    progress: 0,
    stageLabel: 'Not started',
    summary: 'Learn how to structure context, memory, and summaries for repeatable AI workflows.',
    evidenceCount: 0,
    updatedAt: 'Not started',
  },
  {
    id: 'rag-knowledge-systems',
    name: 'RAG & Knowledge Systems',
    category: 'Knowledge',
    progress: 0,
    stageLabel: 'Not started',
    summary: 'Design retrieval, grounding, source quality, chunking, and knowledge workflows for reliable AI products.',
    evidenceCount: 0,
    updatedAt: 'Not started',
  },
  {
    id: 'agent-design',
    name: 'Agent Design',
    category: 'Application',
    progress: 0,
    stageLabel: 'Not started',
    summary: 'Map simple agent roles, handoffs, tools, and review points as you learn.',
    evidenceCount: 0,
    updatedAt: 'Not started',
  },
  {
    id: 'tool-orchestration',
    name: 'Tool Orchestration',
    category: 'Tooling',
    progress: 0,
    stageLabel: 'Not started',
    summary: 'Plan how agents call tools, APIs, databases, search, and human checkpoints safely and usefully.',
    evidenceCount: 0,
    updatedAt: 'Not started',
  },
  {
    id: 'ai-evaluation',
    name: 'AI Evaluation',
    category: 'Tooling',
    progress: 0,
    stageLabel: 'Not started',
    summary: 'Define what good AI output means before building complex workflows.',
    evidenceCount: 0,
    updatedAt: 'Not started',
  },
  {
    id: 'experimentation-metrics',
    name: 'Experimentation & Metrics',
    category: 'Evaluation',
    progress: 0,
    stageLabel: 'Not started',
    summary: 'Define success metrics, offline evals, product experiments, and learning loops for AI features.',
    evidenceCount: 0,
    updatedAt: 'Not started',
  },
  {
    id: 'ai-safety-governance',
    name: 'AI Safety & Governance',
    category: 'Governance',
    progress: 0,
    stageLabel: 'Not started',
    summary: 'Identify risk boundaries, policy constraints, privacy concerns, review flows, and launch readiness.',
    evidenceCount: 0,
    updatedAt: 'Not started',
  },
  {
    id: 'automation-ops',
    name: 'Automation Ops',
    category: 'Operations',
    progress: 0,
    stageLabel: 'Not started',
    summary: 'Turn repeated PM workflows into maintainable automations with monitoring, fallback, and ownership.',
    evidenceCount: 0,
    updatedAt: 'Not started',
  },
  {
    id: 'product-storytelling',
    name: 'Product Storytelling',
    category: 'Growth',
    progress: 0,
    stageLabel: 'Not started',
    summary: 'Translate AI product work into narratives, demos, release notes, stakeholder updates, and adoption loops.',
    evidenceCount: 0,
    updatedAt: 'Not started',
  },
  {
    id: 'multi-agent-collaboration',
    name: 'Multi-Agent Collaboration',
    category: 'Application',
    progress: 0,
    stageLabel: 'Not started',
    summary: 'Design specialist agents, handoffs, review loops, and collaboration patterns for complex PM workflows.',
    evidenceCount: 0,
    updatedAt: 'Not started',
  },
];

export const defaultCaptureDraft = '';

export const defaultSuggestions: CaptureSuggestions = {
  tags: [],
  confidence: 'low',
  nextPrompt: 'Write your first evidence record about a real AI product task, question, or experiment.',
  relatedCapabilities: [],
};

export const coachPlan: CoachPlan = {
  description:
    'Start by saving one real AI product evidence record. The Coach Agent will generate a personalized learning path after your first evidence record or selected skill.',
  steps: [
    {
      id: 'first-note',
      title: 'Step 1: Save your first evidence record',
      detail: 'Open New Evidence and write about one AI product task, question, failure, or insight from today.',
      status: 'active',
    },
    {
      id: 'pick-skill',
      title: 'Step 2: Pick one skill to grow',
      detail: 'Use Growth Map to choose a capability such as Strategy, Research Synthesis, Context Engineering, Agent Design, RAG, Evaluation, or Governance.',
      status: 'todo',
    },
    {
      id: 'generate-learning-path',
      title: 'Step 3: Generate your first learning path',
      detail: 'Use Coach Agent to turn the selected capability into a Learn, Practice, Evidence, Reflect workflow.',
      status: 'todo',
    },
  ],
};

export const weeklySummary: WeeklySummary = {
  period: 'Your first week',
  progress: ['No progress recorded yet. Save your first evidence record to begin.'],
  nextActions: [
    'Write one real AI product evidence record.',
    'Choose one capability in Growth Map.',
    'Generate a focused learning path with Coach Agent.',
  ],
};

export const userProfile: UserProfile = {
  currentStageLabel: 'New workspace',
  weeklyGoal: 4,
  focusArea: 'Choose your first focus',
  preferredModel: 'Default platform model',
  longTermGoal: 'Build a personal operating system for compounding AI PM capability.',
  savedNotes: 0,
  lastInsight: 'No evidence yet. Start by saving one real AI product moment.',
};
